'use strict';

const { Contract } = require('fabric-contract-api');

const { principalOf } = require('./access/principal');
const { authorize } = require('./access/policy');
const { InvalidArgument } = require('./domain/errors');
const { txTimeISO } = require('./ledger/time');
const RecordRepository = require('./ledger/RecordRepository');
const ConsentRepository = require('./ledger/ConsentRepository');
const ProfileRepository = require('./ledger/ProfileRepository');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

/**
 * ConsentMD medical-consent contract.
 *
 * This class is a FACADE. It holds no business logic and no authorization
 * logic of its own; every method follows the same four steps:
 *
 *     1. derive the principal from the signed certificate
 *     2. load the asset being acted upon
 *     3. authorize(ACTION, ...)   <-- throws on denial
 *     4. delegate to a repository
 *
 * Keeping it to that shape is what makes the authorization surface auditable:
 * there is no path to a repository that does not pass through step 3.
 *
 * NOTE on contract identity: fabric-contract-api must see exactly ONE exported
 * Contract with this namespace. Exporting a second contract would force every
 * caller to qualify functions as `Namespace:Function`, silently breaking the
 * REST API and every benchmark workload. Layering happens behind this class,
 * never beside it.
 *
 * Removed in this revision, deliberately:
 *   - `_verifyDoctorRole` / `_verifyPatientRole`, which had been stubbed out
 *     with an unconditional `return` under a "BENCHMARK MODE" comment. Every
 *     role check in the deployed chaincode was inert.
 *   - `findAssetsByQuery` / `assetExistsByQuery`, which executed an arbitrary
 *     caller-supplied CouchDB selector with no authorization whatsoever. Any
 *     enrolled identity could read every record on the ledger. They are
 *     replaced by the principal-scoped listings below, which take no selector.
 *   - `addPrivateNoteToRecord` and collection.json: the private-data
 *     collection was never deployed (--collections-config is commented out in
 *     every deploy script) and its OR('Org1MSP.member') policy was wrong for a
 *     two-org consent model anyway.
 */
class MedicalConsentContract extends Contract {
  constructor() {
    super('org.mednet.medicalconsent.MedicalConsentContract');
    this.records = new RecordRepository();
    this.consents = new ConsentRepository();
    this.profiles = new ProfileRepository();
  }

  /**
   * Consent port handed to the policy. Bound per-transaction so the policy
   * stays a pure function of its arguments and can be tested without a ledger.
   */
  _consentPort(ctx, { richQuery = false } = {}) {
    const repo = this.consents;
    return {
      isActive: (recordId, doctorId) =>
        richQuery
          ? repo.isActiveViaRichQuery(ctx, recordId, doctorId)
          : repo.isActive(ctx, recordId, doctorId),
    };
  }

  // =====================================================================
  // Identity
  // =====================================================================

  /**
   * Echo the caller's identity as the chaincode sees it.
   *
   * This is the preflight check that prevents the class of failure that
   * produced the original benchmark numbers: identities enrolled WITHOUT the
   * `organization` attribute silently failed every role check, which was
   * indistinguishable from a legitimate consent denial. `consentmd verify`
   * calls this as every benchmark identity and refuses to run if any returns
   * a null role.
   */
  async whoAmI(ctx) {
    return JSON.stringify(principalOf(ctx));
  }

  /** @deprecated retained so existing callers keep working; use whoAmI. */
  async getMyId(ctx) {
    return ctx.clientIdentity.getID();
  }

  // =====================================================================
  // Profiles
  // =====================================================================

  async registerDoctorProfile(ctx, name, specialization) {
    const who = principalOf(ctx);
    await authorize('REGISTER_DOCTOR_PROFILE', who);
    const profile = await this.profiles.upsert(ctx, {
      doctorId: who.id,
      name,
      specialization,
      registeredAt: txTimeISO(ctx),
    });
    ctx.stub.setEvent('RegisterDoctorProfile', Buffer.from(JSON.stringify(profile)));
    return JSON.stringify(profile);
  }

  async getDoctorProfile(ctx, doctorId) {
    return JSON.stringify(await this.profiles.get(ctx, doctorId));
  }

  // =====================================================================
  // Records
  // =====================================================================

  async createPatientRecord(ctx, fileName, s3ObjectKey, fileHash, details) {
    const who = principalOf(ctx);
    await authorize('CREATE_RECORD_AS_PATIENT', who);
    const record = await this.records.create(ctx, {
      recordId: `record_${ctx.stub.getTxID()}`,
      patientId: who.id,
      details,
      fileName,
      s3ObjectKey,
      fileHash,
      doctorCreatorId: null,
      createdAt: txTimeISO(ctx),
    });
    ctx.stub.setEvent('CreatePatientRecord', Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  async createMedicalRecord(ctx, patientId, recordDetails, fileName, s3ObjectKey, fileHash) {
    const who = principalOf(ctx);
    await authorize('CREATE_RECORD_AS_DOCTOR', who);
    const record = await this.records.create(ctx, {
      recordId: `record_${ctx.stub.getTxID()}`,
      patientId,
      details: recordDetails,
      fileName,
      s3ObjectKey,
      fileHash,
      doctorCreatorId: who.id,
      createdAt: txTimeISO(ctx),
    });
    ctx.stub.setEvent('CreateMedicalRecord', Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  async updateRecordDetails(ctx, recordId, newDetails) {
    const who = principalOf(ctx);
    const record = await this.records.get(ctx, recordId);
    await authorize('UPDATE_RECORD', who, record);
    const updated = await this.records.put(ctx, {
      ...record,
      details: newDetails,
      updatedAt: txTimeISO(ctx),
      updaterId: who.id,
    });
    ctx.stub.setEvent('UpdateMedicalRecord', Buffer.from(JSON.stringify(updated)));
    return JSON.stringify(updated);
  }

  async archiveMedicalRecord(ctx, recordId) {
    const who = principalOf(ctx);
    const record = await this.records.get(ctx, recordId);
    await authorize('ARCHIVE_RECORD', who, record);
    const updated = await this.records.put(ctx, { ...record, archived: true });
    // The original emitted no event here, inconsistently with every other
    // mutation; an archive is exactly the kind of thing an audit trail wants.
    ctx.stub.setEvent('ArchiveMedicalRecord', Buffer.from(JSON.stringify(updated)));
    return JSON.stringify(updated);
  }

  async removeFileFromRecord(ctx, recordId) {
    const who = principalOf(ctx);
    const record = await this.records.get(ctx, recordId);
    await authorize('REMOVE_FILE', who, record);
    const updated = await this.records.clearFile(ctx, record);
    ctx.stub.setEvent('RemoveFileFromRecord', Buffer.from(JSON.stringify(updated)));
    return JSON.stringify(updated);
  }

  // =====================================================================
  // Consent
  // =====================================================================

  async grantConsent(ctx, recordId, doctorId) {
    const who = principalOf(ctx);
    const record = await this.records.get(ctx, recordId);
    await authorize('GRANT_CONSENT', who, record);
    // Consent may only be granted to an identity that has actually registered
    // as a doctor. The original accepted any string, so consent could be
    // granted to a principal that does not exist.
    await this.profiles.mustExist(ctx, doctorId);
    const consent = await this.consents.grant(
      ctx,
      record,
      who,
      doctorId,
      `consent_${ctx.stub.getTxID()}`,
      txTimeISO(ctx)
    );
    ctx.stub.setEvent('GrantConsent', Buffer.from(JSON.stringify(consent)));
    return JSON.stringify(consent);
  }

  /**
   * Revoke consent.
   *
   * Signature changed from revokeConsent(consentId) to (recordId, doctorId):
   * consents are now addressed by that pair, and a transaction-derived
   * consentId cannot be recomputed by a reader. Callers always know both.
   */
  async revokeConsent(ctx, recordId, doctorId) {
    const who = principalOf(ctx);
    const consent = await this.consents.get(ctx, recordId, doctorId);
    await authorize('REVOKE_CONSENT', who, consent);
    const updated = await this.consents.revoke(ctx, consent, txTimeISO(ctx));
    ctx.stub.setEvent('RevokeConsent', Buffer.from(JSON.stringify(updated)));
    return JSON.stringify(updated);
  }

  async getConsentStatus(ctx, recordId, doctorId) {
    const who = principalOf(ctx);
    const record = await this.records.get(ctx, recordId);
    // Only the record owner, or the doctor in question, may ask.
    if (who.id !== record.patientId && who.id !== doctorId) {
      await authorize('READ_RECORD', who, record, this._consentPort(ctx));
    }
    const consent = await this.consents.find(ctx, recordId, doctorId);
    return JSON.stringify(consent || { recordId, doctorId, status: 'none' });
  }

  // =====================================================================
  // Reads
  // =====================================================================

  /**
   * Read a record. PRODUCTION path: consent resolves via a single getState.
   */
  async getRecordById(ctx, recordId) {
    const who = principalOf(ctx);
    const record = await this.records.get(ctx, recordId);
    await authorize('READ_RECORD', who, record, this._consentPort(ctx));
    return JSON.stringify(record);
  }

  /**
   * Read a record, resolving consent through a CouchDB rich query instead.
   *
   * MEASUREMENT ONLY. It enforces the IDENTICAL policy via the identical
   * authorize() call -- only the consent lookup mechanism differs -- so it is
   * not an authorization bypass and is safe to expose. It exists so the
   * read-path attribution experiment can measure the cost of the Mango query
   * against the composite-key baseline on the same peer, same state database,
   * same moment, rather than inferring it from two separate deployments.
   */
  async getRecordByIdRichQuery(ctx, recordId) {
    const who = principalOf(ctx);
    const record = await this.records.get(ctx, recordId);
    await authorize('READ_RECORD', who, record, this._consentPort(ctx, { richQuery: true }));
    return JSON.stringify(record);
  }

  async getAssetHistory(ctx, recordId) {
    const who = principalOf(ctx);
    const record = await this.records.get(ctx, recordId);
    await authorize('READ_HISTORY', who, record, this._consentPort(ctx));
    return JSON.stringify(await this.records.history(ctx, recordId));
  }

  // =====================================================================
  // Principal-scoped listings
  //
  // These take NO selector. The scope is derived from the caller's
  // certificate, so there is nothing for a caller to widen. This is the
  // replacement for findAssetsByQuery/assetExistsByQuery.
  // =====================================================================

  async listMyRecords(ctx, pageSize, bookmark) {
    const who = principalOf(ctx);
    await authorize('LIST_OWN_RECORDS', who);
    const { records, bookmark: next } = await this.records.listForPatient(
      ctx,
      who.id,
      this._pageSize(pageSize),
      bookmark || ''
    );
    return JSON.stringify({ records, bookmark: next });
  }

  async listMyConsents(ctx, pageSize, bookmark) {
    const who = principalOf(ctx);
    await authorize('LIST_OWN_CONSENTS', who);
    const { consents, bookmark: next } = await this.consents.listForPatient(
      ctx,
      who.id,
      this._pageSize(pageSize),
      bookmark || ''
    );
    return JSON.stringify({ consents, bookmark: next });
  }

  async listGrantedRecords(ctx, pageSize, bookmark) {
    const who = principalOf(ctx);
    await authorize('LIST_GRANTED_RECORDS', who);
    const { recordIds, bookmark: next } = await this.consents.listRecordIdsForDoctor(
      ctx,
      who.id,
      this._pageSize(pageSize),
      bookmark || ''
    );
    const records = [];
    for (const recordId of recordIds) {
      const r = await this.records.find(ctx, recordId);
      if (r) records.push(r);
    }
    return JSON.stringify({ records, bookmark: next });
  }

  /** Caller-scoped duplicate detection: has THIS patient already stored this file? */
  async recordExistsForHash(ctx, fileHash) {
    const who = principalOf(ctx);
    await authorize('LIST_OWN_RECORDS', who);
    const recordId = await this.records.findIdByHash(ctx, who.id, fileHash);
    return JSON.stringify({ exists: recordId !== null, recordId });
  }

  _pageSize(raw) {
    if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new InvalidArgument('pageSize must be a positive integer');
    }
    // Bounded so a patient with many records cannot produce an unbounded read
    // set and an oversized proposal response.
    return Math.min(n, MAX_PAGE_SIZE);
  }
}

module.exports = MedicalConsentContract;
