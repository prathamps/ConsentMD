const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const recordValidation = require('../../validations/record.validation');
const recordController = require('../../controllers/record.controller');
const { uploadFileToS3, processDoctorRecordUpload } = require('../../utils/fileUpload');

const router = express.Router();

router.post(
  '/self',
  auth('patient'),
  uploadFileToS3,
  validate(recordValidation.createPatientRecord),
  recordController.createPatientRecord
);

router.post(
  '/by-doctor',
  auth('manageRecords'),
  processDoctorRecordUpload,
  validate(recordValidation.createMedicalRecordByDoctor),
  recordController.createMedicalRecordByDoctor
);

router.post('/consents', auth('patient'), validate(recordValidation.grantConsent), recordController.grantConsent);
router.delete(
  '/consents/:consentId',
  auth('patient'),
  validate(recordValidation.revokeConsent),
  recordController.revokeConsent
);

router.get('/mine', auth('patient'), recordController.getMyRecords);
router.get('/consents/mine', auth('patient'), recordController.getMyConsents);
router.get('/accessible', auth('doctor'), recordController.getAccessibleRecords);

router.route('/:recordId').get(auth('getRecords'), validate(recordValidation.getRecordById), recordController.getRecordById);

router
  .route('/:recordId/file')
  .delete(auth('patient'), validate(recordValidation.getRecordById), recordController.deleteFileFromRecord);

module.exports = router;
