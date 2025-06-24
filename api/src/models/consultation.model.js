const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { CONSULTATION_STATUS } = require('../utils/Constants');

const consultationSchema = mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: [CONSULTATION_STATUS.PENDING, CONSULTATION_STATUS.APPROVED, CONSULTATION_STATUS.REJECTED],
      default: CONSULTATION_STATUS.PENDING,
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
consultationSchema.plugin(toJSON);
consultationSchema.plugin(paginate);

/**
 * @typedef Consultation
 */
const Consultation = mongoose.model('Consultation', consultationSchema);

module.exports = Consultation;
