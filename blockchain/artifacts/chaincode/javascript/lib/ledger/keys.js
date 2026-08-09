'use strict';

/**
 * Every ledger key is derived here, and nowhere else.
 *
 * This exists because the previous code wrote DoctorProfile with
 * `createCompositeKey('DoctorProfile', [doctorId])` but read it back with a
 * plain `getState(id)`, so a profile lookup could never succeed. Centralising
 * derivation makes writer/reader drift structurally impossible.
 *
 * Addressing model
 * ----------------
 *   Record   plain key `record_<txid>`. Deliberately NOT composite: record IDs
 *            are referenced by external systems (S3 object keys, REST URLs,
 *            benchmark datasets), so they must be printable and stable.
 *
 *   Consent  composite key on (recordId, doctorId). There is at most ONE
 *            consent per (record, doctor) pair, so "does this doctor currently
 *            have consent for this record" is a single getState rather than a
 *            CouchDB rich query. That query sat on the hot path of every
 *            doctor read.
 *
 *   Profile  composite key on (doctorId).
 *
 * Pointer indexes
 * ---------------
 * Range-scannable secondary indexes so user-facing listings never touch
 * CouchDB. Values are empty buffers; the key carries all the information.
 *
 *   RecordByPatient    (patientId, recordId)             all of a patient's records
 *   ConsentByPatient   (patientId, recordId, doctorId)   every consent a patient issued,
 *                                                        retained after revocation for audit
 *   ConsentByDoctor    (doctorId, recordId)              ACTIVE consents only -- deleted on
 *                                                        revoke, re-added on re-grant, so the
 *                                                        doctor listing is a pure range scan
 *   RecordByHash       (patientId, fileHash)             caller-scoped duplicate detection
 */

/** Fabric's composite-key attribute separator. */
const NUL = '\u0000';

const OBJ = Object.freeze({
  CONSENT: 'Consent',
  PROFILE: 'DoctorProfile',
  IDX_RECORD_BY_PATIENT: 'RecordByPatient',
  IDX_CONSENT_BY_PATIENT: 'ConsentByPatient',
  IDX_CONSENT_BY_DOCTOR: 'ConsentByDoctor',
  IDX_RECORD_BY_HASH: 'RecordByHash',
});

const DOC_TYPE = Object.freeze({
  RECORD: 'MedicalRecord',
  CONSENT: 'Consent',
  PROFILE: 'DoctorProfile',
});

/** Records keep a plain, printable key. */
const recordKey = (_stub, recordId) => recordId;

const consentKey = (stub, recordId, doctorId) =>
  stub.createCompositeKey(OBJ.CONSENT, [recordId, doctorId]);

const profileKey = (stub, doctorId) => stub.createCompositeKey(OBJ.PROFILE, [doctorId]);

const recordByPatientKey = (stub, patientId, recordId) =>
  stub.createCompositeKey(OBJ.IDX_RECORD_BY_PATIENT, [patientId, recordId]);

const consentByPatientKey = (stub, patientId, recordId, doctorId) =>
  stub.createCompositeKey(OBJ.IDX_CONSENT_BY_PATIENT, [patientId, recordId, doctorId]);

const consentByDoctorKey = (stub, doctorId, recordId) =>
  stub.createCompositeKey(OBJ.IDX_CONSENT_BY_DOCTOR, [doctorId, recordId]);

const recordByHashKey = (stub, patientId, fileHash) =>
  stub.createCompositeKey(OBJ.IDX_RECORD_BY_HASH, [patientId, fileHash]);

/** Recover the attributes of a composite key. */
const splitKey = (stub, key) => stub.splitCompositeKey(key).attributes;

/**
 * Reject anything that would corrupt the composite key space.
 *
 * Client identity IDs are X.509 distinguished names full of commas, slashes
 * and equals signs -- all harmless. A NUL is not: it is the attribute
 * separator, so a caller-supplied string containing one could forge a key in a
 * different namespace. Checked at every boundary that accepts an external id.
 */
const assertKeySafe = (label, value) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`INVALID_ARGUMENT ${label} must be a non-empty string`);
  }
  if (value.indexOf(NUL) !== -1) {
    throw new Error(`INVALID_ARGUMENT ${label} must not contain a NUL character`);
  }
  return value;
};

module.exports = {
  NUL,
  OBJ,
  DOC_TYPE,
  recordKey,
  consentKey,
  profileKey,
  recordByPatientKey,
  consentByPatientKey,
  consentByDoctorKey,
  recordByHashKey,
  splitKey,
  assertKeySafe,
};
