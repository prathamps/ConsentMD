'use strict';

const { AccessDenied } = require('../domain/errors');
const { DOCTOR, PATIENT } = require('./principal');

/**
 * ConsentMD authorization policy -- the complete authorization surface.
 *
 * Every operation that reads a record or mutates the ledger names exactly one
 * ACTION below, and is authorized if and only if that action's rule returns
 * true. Rules are pure functions of:
 *
 *   who      the principal parsed from the caller's signed X.509 ecert
 *            (see access/principal.js) -- never from a transaction argument
 *   res      the on-ledger asset being acted upon (null for create actions)
 *   consent  a ledger port answering "is consent currently active?"
 *
 * Two structural properties make this the whole story:
 *   1. the contract facade calls authorize() before any repository call, and
 *   2. no repository is reachable from outside the chaincode process.
 *
 * The module has no dependency on fabric-shim or on `ctx`, so the entire
 * policy is unit-testable with plain objects and no ledger. That is the point
 * of the extraction, not an accident of it.
 */

const RULES = {
  // ---- profiles -----------------------------------------------------------
  REGISTER_DOCTOR_PROFILE: (who) => who.role === DOCTOR,

  // ---- record lifecycle ---------------------------------------------------
  CREATE_RECORD_AS_PATIENT: (who) => who.role === PATIENT,
  CREATE_RECORD_AS_DOCTOR: (who) => who.role === DOCTOR,

  UPDATE_RECORD: (who, rec) =>
    who.role === DOCTOR && rec.doctorCreatorId === who.id && rec.archived === false,

  ARCHIVE_RECORD: (who, rec) => who.role === PATIENT && rec.patientId === who.id,
  REMOVE_FILE: (who, rec) => who.role === PATIENT && rec.patientId === who.id,

  // ---- consent lifecycle --------------------------------------------------
  GRANT_CONSENT: (who, rec) => who.role === PATIENT && rec.patientId === who.id,
  REVOKE_CONSENT: (who, con) => who.role === PATIENT && con.patientId === who.id,

  // ---- the read rule the paper is about -----------------------------------
  // A record is readable by its owning patient, or by a doctor who currently
  // holds an active consent for that specific record. There is no third case:
  // no admin override, no org-wide read, no "trusted application" exemption.
  READ_RECORD: async (who, rec, consent) =>
    (who.role === PATIENT && rec.patientId === who.id) ||
    (who.role === DOCTOR && (await consent.isActive(rec.recordId, who.id))),

  READ_HISTORY: async (who, rec, consent) => RULES.READ_RECORD(who, rec, consent),

  // ---- principal-scoped listings ------------------------------------------
  // These replace the former findAssetsByQuery/assetExistsByQuery, which took
  // an arbitrary caller-supplied CouchDB selector with no authorization at all
  // and would happily return every record on the ledger to any enrolled
  // identity. The replacements take no selector: the scope is derived from
  // `who`, so there is nothing for a caller to widen.
  LIST_OWN_RECORDS: (who) => who.role === PATIENT,
  LIST_OWN_CONSENTS: (who) => who.role === PATIENT,
  LIST_GRANTED_RECORDS: (who) => who.role === DOCTOR,
};

/**
 * Sole enforcement point. Throws AccessDenied; never returns false.
 * An action with no rule is a programming error and denies (fail closed).
 *
 * @param {string} action  key of RULES
 * @param {object} who     principal from principalOf(ctx)
 * @param {object} [resource]
 * @param {{isActive: function(string, string): Promise<boolean>}} [consent]
 */
async function authorize(action, who, resource = null, consent = null) {
  const rule = RULES[action];
  if (!rule) {
    throw new AccessDenied(action, who, 'no policy defined');
  }
  if (!(await rule(who, resource, consent))) {
    throw new AccessDenied(action, who);
  }
}

module.exports = { authorize, RULES, ACTIONS: Object.keys(RULES) };
