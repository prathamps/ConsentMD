const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const consultationValidation = require('../../validations/consultation.validation');
const consultationController = require('../../controllers/consultation.controller');

const router = express.Router();

router
  .route('/')
  .post(
    auth('createConsultation'),
    validate(consultationValidation.createConsultation),
    consultationController.createConsultation
  );

router.get('/requests', auth('getConsultations'), consultationController.getConsultationRequests);

router.get('/mine', auth('getConsultations'), consultationController.getMyConsultations);

router
  .route('/:consultationId')
  .patch(
    auth('manageConsultations'),
    validate(consultationValidation.updateConsultationStatus),
    consultationController.updateConsultationStatus
  );

module.exports = router;
