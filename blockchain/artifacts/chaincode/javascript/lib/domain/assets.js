'use strict';

const { InvalidArgument } = require('./errors');
const { DOC_TYPE } = require('../ledger/keys');

/**
 * Asset factories and invariants.
 *
 * Previously every asset was an inline object literal built at its call site,
 * so the shape was whatever that call site happened to write and there was no
 * validation anywhere. Centralising construction gives one definition of each
 * asset's schema and one place to enforce its invariants.
 *
 * `docType` is retained on every asset even though addressing is now by
 * composite key: the CouchDB documents remain queryable for admin/analytics
 * work and for the rich-query read path kept for measurement (see
 * ConsentRepository.isActiveViaRichQuery).
 */

const MAX_DETAILS = 4096;

const str = (label, v, { required = true, max = 512 } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new InvalidArgument(`${label} is required`);
    return null;
  }
  if (typeof v !== 'string') throw new InvalidArgument(`${label} must be a string`);
  if (v.length > max) throw new InvalidArgument(`${label} exceeds ${max} characters`);
  return v;
};

function newMedicalRecord({ recordId, patientId, details, fileName, s3ObjectKey, fileHash, doctorCreatorId, createdAt }) {
  return {
    recordId: str('recordId', recordId),
    docType: DOC_TYPE.RECORD,
    patientId: str('patientId', patientId),
    details: str('details', details, { required: false, max: MAX_DETAILS }),
    fileName: str('fileName', fileName, { required: false }),
    s3ObjectKey: str('s3ObjectKey', s3ObjectKey, { required: false }),
    // Hex SHA-256 of the off-chain object. This is the anchor that makes
    // tampering with the object store detectable; the API verifies it on
    // download (StorageService.fetchVerified).
    fileHash: str('fileHash', fileHash, { required: false, max: 64 }),
    doctorCreatorId: doctorCreatorId || null,
    createdAt,
    updatedAt: null,
    updaterId: null,
    archived: false,
  };
}

function newConsent({ consentId, recordId, patientId, doctorId, grantedAt }) {
  return {
    // Retained for display and audit only. Consents are ADDRESSED by the
    // composite key (recordId, doctorId) -- see ledger/keys.js -- because a
    // tx-derived id cannot be recomputed by a reader.
    consentId: str('consentId', consentId),
    docType: DOC_TYPE.CONSENT,
    recordId: str('recordId', recordId),
    patientId: str('patientId', patientId),
    doctorId: str('doctorId', doctorId),
    status: 'granted',
    grantedAt,
    revokedAt: null,
    regrantedAt: null,
  };
}

function newDoctorProfile({ doctorId, name, specialization, registeredAt }) {
  return {
    docType: DOC_TYPE.PROFILE,
    doctorId: str('doctorId', doctorId),
    name: str('name', name, { max: 256 }),
    specialization: str('specialization', specialization, { required: false, max: 256 }),
    registeredAt,
  };
}

const isActiveConsent = (c) => Boolean(c) && c.status === 'granted';

module.exports = { newMedicalRecord, newConsent, newDoctorProfile, isActiveConsent, MAX_DETAILS };
