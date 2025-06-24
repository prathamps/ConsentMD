const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { CONSULTATION_STATUS } = require('../utils/Constants');

const createConsultation = {
  body: Joi.object().keys({
    doctorId: Joi.string().custom(objectId).required(),
  }),
};

const updateConsultationStatus = {
  params: Joi.object().keys({
    consultationId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().valid(CONSULTATION_STATUS.APPROVED, CONSULTATION_STATUS.REJECTED).required(),
  }),
};

module.exports = {
  createConsultation,
  updateConsultationStatus,
};
