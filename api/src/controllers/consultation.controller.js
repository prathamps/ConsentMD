const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { consultationService } = require('../services');
const { getSuccessResponse } = require('../utils/Response');

const createConsultation = catchAsync(async (req, res) => {
  console.log('--- Controller received consultation request. Doctor ID from body:', req.body.doctorId);
  const consultation = await consultationService.createConsultation(req.user, req.body);
  res
    .status(httpStatus.CREATED)
    .send(getSuccessResponse(httpStatus.CREATED, 'Consultation request created successfully', consultation));
});

const getConsultationRequests = catchAsync(async (req, res) => {
  const requests = await consultationService.getConsultationRequests(req.user);
  res.status(httpStatus.OK).send(getSuccessResponse(httpStatus.OK, 'Consultation requests fetched successfully', requests));
});

const getMyConsultations = catchAsync(async (req, res) => {
  const requests = await consultationService.getMyConsultations(req.user);
  res
    .status(httpStatus.OK)
    .send(getSuccessResponse(httpStatus.OK, 'Your consultation requests fetched successfully', requests));
});

const updateConsultationStatus = catchAsync(async (req, res) => {
  const { consultationId } = req.params;
  const { status } = req.body;
  const consultation = await consultationService.updateConsultationStatus(req.user, consultationId, status);
  res
    .status(httpStatus.OK)
    .send(getSuccessResponse(httpStatus.OK, 'Consultation status updated successfully', consultation));
});

module.exports = {
  createConsultation,
  getConsultationRequests,
  getMyConsultations,
  updateConsultationStatus,
};
