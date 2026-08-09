'use strict';

const { expect } = require('chai');
const { authorize, RULES, ACTIONS } = require('../lib/access/policy');
const { principalOf } = require('../lib/access/principal');
const { FakeClientIdentity } = require('./support/FakeStub');

/**
 * Authorization matrix.
 *
 * The policy is a pure function of (principal, resource, consentPort), so this
 * whole suite runs with no ledger, no Fabric and no network. That property is
 * the reason the policy was extracted into its own module, and it is what makes
 * the authorization surface something a reviewer can read in one sitting.
 *
 * The final test asserts the matrix is EXHAUSTIVE: adding a rule to policy.js
 * without adding an expectation here fails CI, so the authorization surface
 * cannot grow silently.
 */

const P = (id, msp, attrs) => principalOf({ clientIdentity: new FakeClientIdentity(id, msp, attrs) });

const PRINCIPALS = {
  'patient-owner': P('pat1', 'Org2MSP', { organization: 'patient' }),
  'patient-other': P('pat2', 'Org2MSP', { organization: 'patient' }),
  'doctor-creator': P('doc1', 'Org1MSP', { organization: 'doctor' }),
  'doctor-other': P('doc2', 'Org1MSP', { organization: 'doctor' }),
  // Threat model P2: the API service account. Enrolled and trusted by the
  // channel MSP, but carries no `organization` attribute.
  'no-attribute': P('svc', 'Org1MSP', {}),
  // An identity asserting a role value that is not part of the model.
  'bogus-role': P('evil', 'Org1MSP', { organization: 'admin' }),
};

const RECORD = { recordId: 'record_1', patientId: 'pat1', doctorCreatorId: 'doc1', archived: false };
const CONSENT_ASSET = { recordId: 'record_1', patientId: 'pat1', doctorId: 'doc1', status: 'granted' };
const ACTIVE = { isActive: async () => true };
const INACTIVE = { isActive: async () => false };

/**
 * Expected outcome per (action, principal). `true` = allowed.
 * Consent state is varied separately for READ_RECORD / READ_HISTORY below.
 */
const MATRIX = {
  REGISTER_DOCTOR_PROFILE: { 'doctor-creator': true, 'doctor-other': true },
  CREATE_RECORD_AS_PATIENT: { 'patient-owner': true, 'patient-other': true },
  CREATE_RECORD_AS_DOCTOR: { 'doctor-creator': true, 'doctor-other': true },
  UPDATE_RECORD: { 'doctor-creator': true },
  ARCHIVE_RECORD: { 'patient-owner': true },
  REMOVE_FILE: { 'patient-owner': true },
  GRANT_CONSENT: { 'patient-owner': true },
  REVOKE_CONSENT: { 'patient-owner': true },
  READ_RECORD: { 'patient-owner': true, 'doctor-creator': true, 'doctor-other': true },
  READ_HISTORY: { 'patient-owner': true, 'doctor-creator': true, 'doctor-other': true },
  LIST_OWN_RECORDS: { 'patient-owner': true, 'patient-other': true },
  LIST_OWN_CONSENTS: { 'patient-owner': true, 'patient-other': true },
  LIST_GRANTED_RECORDS: { 'doctor-creator': true, 'doctor-other': true },
};

const resourceFor = (action) => (action === 'REVOKE_CONSENT' ? CONSENT_ASSET : RECORD);

const allowed = async (action, who, consent) => {
  try {
    await authorize(action, who, resourceFor(action), consent);
    return true;
  } catch (e) {
    expect(e.code, `${action}/${who.id} threw the wrong error type`).to.equal('ACCESS_DENIED');
    return false;
  }
};

describe('access/policy — authorization matrix', () => {
  for (const action of Object.keys(MATRIX)) {
    describe(action, () => {
      for (const [name, who] of Object.entries(PRINCIPALS)) {
        const want = Boolean(MATRIX[action][name]);
        it(`${want ? 'allows' : 'denies'} ${name}`, async () => {
          // Reads are evaluated with consent ACTIVE so a denial can only come
          // from the role/ownership rule, not from a missing consent.
          expect(await allowed(action, who, ACTIVE)).to.equal(want);
        });
      }
    });
  }

  describe('READ_RECORD across consent states', () => {
    const cases = [
      ['owner reads without consent', 'patient-owner', INACTIVE, true],
      ['owner reads with consent', 'patient-owner', ACTIVE, true],
      ['doctor with active consent', 'doctor-other', ACTIVE, true],
      ['doctor with revoked/absent consent', 'doctor-other', INACTIVE, false],
      ['non-owner patient, consent irrelevant', 'patient-other', ACTIVE, false],
      ['no-attribute identity, consent irrelevant', 'no-attribute', ACTIVE, false],
    ];
    for (const [label, principal, consent, want] of cases) {
      it(`${want ? 'allows' : 'denies'}: ${label}`, async () => {
        expect(await allowed('READ_RECORD', PRINCIPALS[principal], consent)).to.equal(want);
      });
    }

    it('never consults the consent port for a non-doctor', async () => {
      let consulted = false;
      const spy = {
        isActive: async () => {
          consulted = true;
          return true;
        },
      };
      await allowed('READ_RECORD', PRINCIPALS['patient-other'], spy);
      expect(consulted, 'a patient must be rejected on role/ownership alone').to.equal(false);
    });
  });

  describe('UPDATE_RECORD guards', () => {
    it('denies the creating doctor once the record is archived', async () => {
      try {
        await authorize('UPDATE_RECORD', PRINCIPALS['doctor-creator'], { ...RECORD, archived: true });
        throw new Error('should have been denied');
      } catch (e) {
        expect(e.code).to.equal('ACCESS_DENIED');
      }
    });
  });

  describe('fail-closed behaviour', () => {
    it('denies an action with no rule', async () => {
      try {
        await authorize('TOTALLY_NEW_ACTION', PRINCIPALS['patient-owner'], RECORD);
        throw new Error('should have been denied');
      } catch (e) {
        expect(e.code).to.equal('ACCESS_DENIED');
        expect(e.message).to.match(/no policy defined/);
      }
    });

    it('throws rather than returning a falsy value a caller could ignore', async () => {
      let threw = false;
      try {
        await authorize('READ_RECORD', PRINCIPALS['no-attribute'], RECORD, ACTIVE);
      } catch (_) {
        threw = true;
      }
      expect(threw).to.equal(true);
    });

    it('includes the principal and role in the denial message for audit', async () => {
      try {
        await authorize('READ_RECORD', PRINCIPALS['no-attribute'], RECORD, INACTIVE);
      } catch (e) {
        expect(e.message).to.contain('principal=svc');
        expect(e.message).to.contain('role=none');
      }
    });
  });

  describe('matrix exhaustiveness', () => {
    it('covers every action defined in policy.js', () => {
      expect(Object.keys(MATRIX).sort()).to.deep.equal(
        ACTIONS.slice().sort(),
        'an action was added to policy.js without a row in the test matrix'
      );
    });

    it('covers every principal for every action', () => {
      const names = Object.keys(PRINCIPALS);
      for (const action of Object.keys(MATRIX)) {
        for (const name of names) {
          expect(RULES).to.have.property(action);
          expect(typeof MATRIX[action][name]).to.be.oneOf(['boolean', 'undefined']);
        }
      }
    });

    it('denies the no-attribute service identity on every single action (P2)', async () => {
      for (const action of ACTIONS) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await allowed(action, PRINCIPALS['no-attribute'], ACTIVE);
        expect(ok, `${action} must deny the API service identity`).to.equal(false);
      }
    });

    it('denies an identity with an unrecognised role on every single action', async () => {
      for (const action of ACTIONS) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await allowed(action, PRINCIPALS['bogus-role'], ACTIVE);
        expect(ok, `${action} must deny an unrecognised role`).to.equal(false);
      }
    });
  });
});
