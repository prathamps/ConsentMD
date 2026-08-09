'use strict';

const K = require('./keys');
const { NotFound, Conflict } = require('../domain/errors');
const { newConsent, isActiveConsent } = require('../domain/assets');
const { collectKeyAttributes, firstOrNull } = require('./iterate');

const EMPTY = Buffer.from('');

/**
 * Consent storage.
 *
 * The central change from the original design: a consent is addressed by the
 * composite key (recordId, doctorId), so "does this doctor hold consent for
 * this record right now?" is ONE getState.
 *
 * Previously that question was answered by a CouchDB Mango query
 * (`getQueryResult` over {docType, doctorId, recordId, status}) executed on
 * every single doctor read. `isActiveViaRichQuery` below preserves that exact
 * query so the two mechanisms can be compared head-to-head on the same peer,
 * same state database, same instant -- which is what turns "reads are slow
 * because of CouchDB queries" from a hypothesis into a measurement.
 *
 * Uniqueness also becomes structural: one consent per (record, doctor) pair.
 * The old scheme keyed consents by transaction id, so granting twice created
 * two indistinguishable consent assets and revoking one left the other active.
 */
class ConsentRepository {
  /** @returns {Promise<object|null>} the consent asset, or null if absent. */
  async find(ctx, recordId, doctorId) {
    K.assertKeySafe('recordId', recordId);
    K.assertKeySafe('doctorId', doctorId);
    const buf = await ctx.stub.getState(K.consentKey(ctx.stub, recordId, doctorId));
    if (!buf || buf.length === 0) return null;
    return JSON.parse(buf.toString('utf8'));
  }

  async get(ctx, recordId, doctorId) {
    const consent = await this.find(ctx, recordId, doctorId);
    if (!consent) throw new NotFound('Consent', `${recordId}/${doctorId}`);
    return consent;
  }

  /**
   * PRODUCTION consent check: a single state read.
   * This is the function on the hot path of every doctor record read.
   */
  async isActive(ctx, recordId, doctorId) {
    const consent = await this.find(ctx, recordId, doctorId);
    return isActiveConsent(consent);
  }

  /**
   * MEASUREMENT-ONLY consent check, byte-for-byte the selector the original
   * implementation used. It reaches the SAME authorization decision as
   * isActive(); only the lookup mechanism differs. It is therefore not a
   * bypass, and the facade routes it through the identical policy call.
   *
   * Kept so the read-path attribution experiment can isolate the cost of a
   * Mango query against a controlled baseline rather than inferring it.
   */
  async isActiveViaRichQuery(ctx, recordId, doctorId) {
    const queryString = JSON.stringify({
      selector: {
        docType: K.DOC_TYPE.CONSENT,
        doctorId,
        recordId,
        status: 'granted',
      },
      use_index: ['idxConsentLookupDoc', 'index-consent-lookup'],
    });
    const iterator = await ctx.stub.getQueryResult(queryString);
    return (await firstOrNull(iterator)) !== null;
  }

  /**
   * Grant, or re-grant a previously revoked consent.
   *
   * Re-granting mutates the existing asset rather than creating a second one,
   * so `getAssetHistory` on the consent key yields the full grant/revoke
   * timeline for that (record, doctor) pair -- which is the audit property the
   * system claims.
   */
  async grant(ctx, record, patient, doctorId, consentId, now) {
    K.assertKeySafe('doctorId', doctorId);
    const key = K.consentKey(ctx.stub, record.recordId, doctorId);
    const existing = await this.find(ctx, record.recordId, doctorId);

    let consent;
    if (existing) {
      if (existing.status === 'granted') {
        throw new Conflict(`consent already granted for record ${record.recordId} to ${doctorId}`);
      }
      consent = { ...existing, status: 'granted', regrantedAt: now, revokedAt: null };
    } else {
      consent = newConsent({
        consentId,
        recordId: record.recordId,
        patientId: patient.id,
        doctorId,
        grantedAt: now,
      });
    }

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(consent)));
    // Pointer indexes. ConsentByDoctor holds ACTIVE consents only, so a
    // doctor's "records I can see" listing is a pure range scan with no
    // per-entry status check.
    await ctx.stub.putState(K.consentByDoctorKey(ctx.stub, doctorId, record.recordId), EMPTY);
    await ctx.stub.putState(
      K.consentByPatientKey(ctx.stub, patient.id, record.recordId, doctorId),
      EMPTY
    );
    return consent;
  }

  async revoke(ctx, consent, now) {
    if (consent.status === 'revoked') {
      throw new Conflict(`consent for record ${consent.recordId} is already revoked`);
    }
    const updated = { ...consent, status: 'revoked', revokedAt: now };
    await ctx.stub.putState(
      K.consentKey(ctx.stub, consent.recordId, consent.doctorId),
      Buffer.from(JSON.stringify(updated))
    );
    // Drop the doctor-side pointer so the active-consent listing shrinks
    // immediately. The patient-side pointer is deliberately retained: a
    // patient must still be able to audit consents they have revoked.
    await ctx.stub.deleteState(
      K.consentByDoctorKey(ctx.stub, consent.doctorId, consent.recordId)
    );
    return updated;
  }

  /** Record ids a doctor currently holds active consent for. */
  async listRecordIdsForDoctor(ctx, doctorId, pageSize, bookmark) {
    const res = await ctx.stub.getStateByPartialCompositeKeyWithPagination(
      K.OBJ.IDX_CONSENT_BY_DOCTOR,
      [doctorId],
      pageSize,
      bookmark
    );
    const attrs = await collectKeyAttributes(ctx.stub, res.iterator);
    return { recordIds: attrs.map(([, recordId]) => recordId), bookmark: res.metadata.bookmark };
  }

  /** Every consent a patient has issued, active or revoked. */
  async listForPatient(ctx, patientId, pageSize, bookmark) {
    const res = await ctx.stub.getStateByPartialCompositeKeyWithPagination(
      K.OBJ.IDX_CONSENT_BY_PATIENT,
      [patientId],
      pageSize,
      bookmark
    );
    const attrs = await collectKeyAttributes(ctx.stub, res.iterator);
    const consents = [];
    for (const [, recordId, doctorId] of attrs) {
      const c = await this.find(ctx, recordId, doctorId);
      if (c) consents.push(c);
    }
    return { consents, bookmark: res.metadata.bookmark };
  }
}

module.exports = ConsentRepository;
