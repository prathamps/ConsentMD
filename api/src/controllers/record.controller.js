const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { recordService } = require('../services');
const { getSuccessResponse } = require('../utils/Response');

const createPatientRecord = catchAsync(async (req, res) => {
  const record = await recordService.createPatientRecord(req.user, req.body);
  res.status(httpStatus.CREATED).send(getSuccessResponse(httpStatus.CREATED, 'Record created successfully', record));
});

const grantConsent = catchAsync(async (req, res) => {
  const { recordId, doctorId } = req.body;
  const consent = await recordService.grantConsent(req.user, recordId, doctorId);
  res.status(httpStatus.CREATED).send(getSuccessResponse(httpStatus.CREATED, 'Consent granted successfully', consent));
});

const getRecordById = catchAsync(async (req, res) => {
  const record = await recordService.getRecordById(req.user, req.params.recordId);
  res.status(httpStatus.OK).send(getSuccessResponse(httpStatus.OK, 'Record fetched successfully', record));
});

const revokeConsent = catchAsync(async (req, res) => {
  const result = await recordService.revokeConsent(req.user, req.params.consentId);
  res.status(httpStatus.OK).send(getSuccessResponse(httpStatus.OK, 'Consent revoked successfully', result));
});

const createMedicalRecordByDoctor = catchAsync(async (req, res) => {
  const record = await recordService.createMedicalRecordByDoctor(req.user, req.body);
  res.status(httpStatus.CREATED).send(getSuccessResponse(httpStatus.CREATED, 'Record created successfully', record));
});

const getMyRecords = catchAsync(async (req, res) => {
  const records = await recordService.getMyRecords(req.user);
  res.status(httpStatus.OK).send(getSuccessResponse(httpStatus.OK, 'Records fetched successfully', records));
});

const getMyConsents = catchAsync(async (req, res) => {
  const consents = await recordService.getMyConsents(req.user);
  res.status(httpStatus.OK).send(getSuccessResponse(httpStatus.OK, 'Consents fetched successfully', consents));
});

const getAccessibleRecords = catchAsync(async (req, res) => {
  const records = await recordService.getAccessibleRecords(req.user);
  res.status(httpStatus.OK).send(getSuccessResponse(httpStatus.OK, 'Accessible records fetched successfully', records));
});

const getRecordFileUrl = catchAsync(async (req, res) => {
  const url = await recordService.getRecordFileUrl(req.user, req.params.recordId);
  res.status(httpStatus.OK).send(getSuccessResponse(httpStatus.OK, 'File URL fetched successfully', { url }));
});

const deleteFileFromRecord = catchAsync(async (req, res) => {
  const message = await recordService.deleteFileFromRecord(req.user, req.params.recordId);
  res.status(httpStatus.OK).send(getSuccessResponse(httpStatus.OK, message, null));
});

module.exports = {
  createPatientRecord,
  grantConsent,
  getRecordById,
  revokeConsent,
  createMedicalRecordByDoctor,
  getMyRecords,
  getMyConsents,
  getAccessibleRecords,
  getRecordFileUrl,
  deleteFileFromRecord,
};
