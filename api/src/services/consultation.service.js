const httpStatus = require('http-status');
const Consultation = require('../models/consultation.model');
const User = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const { CONSULTATION_STATUS } = require('../utils/Constants');

/**
 * Create a consultation request
 * @param {Object} user - The authenticated patient user object.
 * @param {Object} consultationBody - The consultation request details.
 * @returns {Promise<Consultation>}
 */
const createConsultation = async (user, consultationBody) => {
  const { doctorId } = consultationBody;
  console.log('--- Attempting to create consultation with doctorId:', doctorId);

  // Check if the doctor exists and is actually a doctor
  const doctor = await User.findById(doctorId);
  console.log('--- Result of User.findById:', doctor);

  if (!doctor || doctor.role !== 'doctor') {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Doctor lookup failed. The provided ID may be invalid or the user is not a doctor.'
    );
  }

  if (doctor.status !== 'active') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The selected doctor is not currently active.');
  }

  // Check if a pending consultation already exists between the patient and doctor
  const existingConsultation = await Consultation.findOne({
    patient: user._id,
    doctor: doctorId,
    status: 'pending',
  });

  if (existingConsultation) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A pending consultation with this doctor already exists.');
  }

  return Consultation.create({
    patient: user._id,
    doctor: doctorId,
  });
};

/**
 * Get consultation requests for a doctor
 * @param {Object} user - The authenticated doctor user object.
 * @returns {Promise<QueryResult>}
 */
const getConsultationRequests = async (user) => {
  return Consultation.find({ doctor: user._id }).populate('patient', 'name email blockchainId');
};

/**
 * Get consultation requests for a patient
 * @param {Object} user - The authenticated patient user object.
 * @returns {Promise<QueryResult>}
 */
const getMyConsultations = async (user) => {
  return Consultation.find({ patient: user._id }).populate('doctor', 'name email specialization');
};

/**
 * Update consultation status
 * @param {Object} user - The authenticated doctor user object.
 * @param {string} consultationId - The ID of the consultation to update.
 * @param {string} status - The new status.
 * @returns {Promise<Consultation>}
 */
const updateConsultationStatus = async (user, consultationId, status) => {
  const lowerCaseStatus = status.toLowerCase();
  if (![CONSULTATION_STATUS.APPROVED, CONSULTATION_STATUS.REJECTED].includes(lowerCaseStatus)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status update.');
  }
  const consultation = await Consultation.findById(consultationId);
  if (!consultation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Consultation not found');
  }
  if (consultation.doctor.toString() !== user._id.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to update this consultation.');
  }
  consultation.status = lowerCaseStatus;
  await consultation.save();
  return consultation;
};

module.exports = {
  createConsultation,
  getConsultationRequests,
  getMyConsultations,
  updateConsultationStatus,
};
