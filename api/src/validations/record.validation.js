const Joi = require('joi');
const { USER_DEPARTMENT, APPROVAL_STATUS } = require('../utils/Constants');
const { password } = require('./custom.validation');

const createPatientRecord = {
  body: Joi.object().keys({
    details: Joi.string().required(),
    fileMetadata: Joi.object()
      .keys({
        id: Joi.string().required(),
        orgName: Joi.string().required(),
        name: Joi.string().required(),
        url: Joi.string().uri().required(),
        contentHash: Joi.string().required(),
      })
      .optional()
      .allow(null),
  }),
};

const grantConsent = {
  body: Joi.object().keys({
    recordId: Joi.string().required(),
    doctorId: Joi.string().required(),
  }),
};

const getRecordById = {
  params: Joi.object().keys({
    recordId: Joi.string().required(),
  }),
};

const revokeConsent = {
  params: Joi.object().keys({
    consentId: Joi.string().required(),
  }),
};

const createMedicalRecordByDoctor = {
  body: Joi.object().keys({
    patientId: Joi.string().required(),
    details: Joi.string().required(),
    fileName: Joi.string().allow('', null),
    s3ObjectKey: Joi.string().allow('', null),
  }),
};

const getSignedURL = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
};

module.exports = {
  createPatientRecord,
  grantConsent,
  getRecordById,
  revokeConsent,
  createMedicalRecordByDoctor,
  getSignedURL,
};
