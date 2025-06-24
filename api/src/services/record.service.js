const httpStatus = require('http-status');
const { User, Consultation } = require('../models');
const ApiError = require('../utils/ApiError');
const { evaluateTransaction, submitTransaction } = require('../utils/blockchainUtils');
const { deleteFile } = require('../utils/fileUpload');

/**
 * Fetches a single medical record from the blockchain.
 * Can be called by either a doctor or the patient who owns the record.
 * Access control is enforced by the chaincode.
 * @param {object} user - The authenticated user object.
 * @param {string} recordId - The ID of the record to fetch.
 * @returns {Promise<object>} The parsed blockchain record.
 */
const getRecordById = async (user, recordId) => {
  const identityLabel = user.email;
  let orgName;

  if (user.role === 'doctor') {
    orgName = 'org1';
  } else if (user.role === 'patient') {
    orgName = 'org2';
  } else {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access blockchain records.');
  }

  try {
    const resultBuffer = await evaluateTransaction(orgName, identityLabel, 'getRecordById', recordId);
    return JSON.parse(resultBuffer.toString());
  } catch (error) {
    // The error from blockchainUtils is already logged and is an ApiError.
    // Let it propagate to be caught by the catchAsync wrapper in the controller.
    throw error;
  }
};

/**
 * Patient creates a medical record on the blockchain.
 * This is invoked by the patient themselves.
 * @param {object} user - The authenticated user object from passport.
 * @param {object} recordBody - The record details.
 * @returns {Promise<object>} The parsed blockchain record.
 */
const createPatientRecord = async (user, recordBody) => {
  const { fileMetadata, details } = recordBody;
  const identityLabel = user.email;
  const orgName = 'org2'; // Patients belong to Org2 as per the setup scripts

  // If a file is being uploaded, check for duplicates first.
  if (fileMetadata && fileMetadata.contentHash) {
    const queryString = JSON.stringify({
      selector: {
        docType: 'MedicalRecord',
        patientId: { $regex: user.email },
        fileHash: fileMetadata.contentHash,
      },
    });

    const hashExistsBuffer = await evaluateTransaction(orgName, identityLabel, 'assetExistsByQuery', queryString);
    if (hashExistsBuffer && hashExistsBuffer.toString() === 'true') {
      throw new ApiError(httpStatus.CONFLICT, 'This file has already been uploaded.');
    }
  }

  try {
    const resultBuffer = await submitTransaction(
      orgName,
      identityLabel,
      'createPatientRecord',
      fileMetadata?.name || '',
      fileMetadata?.id || '',
      fileMetadata?.contentHash || '',
      details
    );
    return JSON.parse(resultBuffer.toString());
  } catch (error) {
    // The error from blockchainUtils is already logged and is an ApiError.
    // Let it propagate to be caught by the catchAsync wrapper in the controller.
    throw error;
  }
};

/**
 * Patient grants a doctor consent to view a specific medical record.
 * @param {object} user - The authenticated user (patient) object.
 * @param {string} recordId - The ID of the record to grant access to.
 * @param {string} doctorId - The blockchain identity ID of the doctor.
 * @returns {Promise<object>} The parsed blockchain consent object.
 */
const grantConsent = async (user, recordId, doctorId) => {
  const identityLabel = user.email;
  const orgName = 'org2'; // Patient action

  try {
    const resultBuffer = await submitTransaction(orgName, identityLabel, 'grantConsent', recordId, doctorId);
    return JSON.parse(resultBuffer.toString());
  } catch (error) {
    // The error from blockchainUtils is already logged and is an ApiError.
    // Let it propagate to be caught by the catchAsync wrapper in the controller.
    throw error;
  }
};

/**
 * Patient revokes a doctor's consent for a specific medical record.
 * @param {object} user - The authenticated user (patient) object.
 * @param {string} consentId - The ID of the consent to revoke.
 * @returns {Promise<object>} The parsed blockchain consent object.
 */
const revokeConsent = async (user, consentId) => {
  const identityLabel = user.email;
  const orgName = 'org2'; // Patient action

  // The 'revokeConsent' chaincode function requires the user to be a patient
  // and the owner of the consent, so we check the role here first.
  if (user.role !== 'patient') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only patients can revoke consent.');
  }

  try {
    const resultBuffer = await submitTransaction(orgName, identityLabel, 'revokeConsent', consentId);
    return JSON.parse(resultBuffer.toString());
  } catch (error) {
    // Let the error from blockchainUtils propagate
    throw error;
  }
};

/**
 * Doctor creates a new medical record for a specified patient.
 * @param {object} user - The authenticated user (doctor) object.
 * @param {object} recordBody - The record details, including patientId.
 * @returns {Promise<object>} The parsed blockchain record object.
 */
const createMedicalRecordByDoctor = async (user, recordBody) => {
  const { patientId, details, fileName, s3ObjectKey } = recordBody;
  const identityLabel = user.email;
  const orgName = 'org1'; // Doctor action

  if (user.role !== 'doctor') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only doctors can create records for patients.');
  }

  // Find the patient's full user object by their blockchain ID
  const patient = await User.findOne({ blockchainId: patientId });
  if (!patient) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Patient with the provided blockchain ID not found.');
  }

  // Verify that there is an approved consultation between this doctor and patient
  const approvedConsultation = await Consultation.findOne({
    doctor: user._id,
    patient: patient._id,
    status: 'approved',
  });

  if (!approvedConsultation) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have an approved consultation with this patient.');
  }

  // The file hash needs to be calculated from the s3ObjectKey if a file was uploaded
  // The format is `orgName/hash-originalFileName`. We need to extract the hash.
  let fileHash = '';
  if (s3ObjectKey) {
    const keyParts = s3ObjectKey.split('/');
    if (keyParts.length > 1) {
      const fileNameWithHash = keyParts[1];
      const hashParts = fileNameWithHash.split('-');
      if (hashParts.length > 1) {
        fileHash = hashParts[0];
      }
    }
  }

  try {
    const resultBuffer = await submitTransaction(
      orgName,
      identityLabel,
      'createMedicalRecord',
      patientId,
      details,
      fileName || '',
      s3ObjectKey || '',
      fileHash
    );
    return JSON.parse(resultBuffer.toString());
  } catch (error) {
    // Let the error from blockchainUtils propagate
    throw error;
  }
};

/**
 * Retrieves all medical records for the authenticated patient.
 * @param {object} user - The authenticated user (patient) object.
 * @returns {Promise<Array<object>>} A list of the patient's medical records.
 */
const getMyRecords = async (user) => {
  const identityLabel = user.email;
  const orgName = 'org2'; // Patient action

  if (user.role !== 'patient') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only patients can view their own records list.');
  }

  try {
    // First, get the user's actual blockchain identity ID from the certificate.
    const idBuffer = await evaluateTransaction(orgName, identityLabel, 'getMyId');
    const patientId = idBuffer.toString();

    if (!patientId) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not determine user blockchain identity.');
    }

    // Now, construct the query to find all records for that patient.
    const queryString = JSON.stringify({
      selector: {
        docType: 'MedicalRecord',
        patientId: { $regex: user.email },
      },
    });

    const resultBuffer = await evaluateTransaction(orgName, identityLabel, 'findAssetsByQuery', queryString);
    return JSON.parse(resultBuffer.toString());
  } catch (error) {
    // Let the error from blockchainUtils propagate
    throw error;
  }
};

/**
 * Retrieves all consents granted by the authenticated patient.
 * @param {object} user - The authenticated user (patient) object.
 * @returns {Promise<Array<object>>} A list of the patient's granted consents.
 */
const getMyConsents = async (user) => {
  const identityLabel = user.email;
  const orgName = 'org2'; // Patient action

  if (user.role !== 'patient') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only patients can view their own consents list.');
  }

  try {
    // First, get the user's actual blockchain identity ID from the certificate.
    const idBuffer = await evaluateTransaction(orgName, identityLabel, 'getMyId');
    const patientId = idBuffer.toString();

    if (!patientId) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not determine user blockchain identity.');
    }

    // Now, construct the query to find all consents for that patient.
    const queryString = JSON.stringify({
      selector: {
        docType: 'Consent',
        patientId: patientId,
      },
    });

    const resultBuffer = await evaluateTransaction(orgName, identityLabel, 'findAssetsByQuery', queryString);
    return JSON.parse(resultBuffer.toString());
  } catch (error) {
    // Let the error from blockchainUtils propagate
    throw error;
  }
};

/**
 * Retrieves all medical records a doctor has been granted access to.
 * @param {object} user - The authenticated user (doctor) object.
 * @returns {Promise<Array<object>>} A list of medical records the doctor can access.
 */
const getAccessibleRecords = async (user) => {
  const identityLabel = user.email;
  const orgName = 'org1'; // Doctor action

  if (user.role !== 'doctor') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only doctors can view accessible records.');
  }

  try {
    // 1. Get the doctor's blockchain ID
    const idBuffer = await evaluateTransaction(orgName, identityLabel, 'getMyId');
    const doctorId = idBuffer.toString();
    if (!doctorId) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not determine user blockchain identity.');
    }

    // 2. Find all 'granted' consents for this doctor
    const consentQuery = JSON.stringify({
      selector: {
        docType: 'Consent',
        doctorId: doctorId,
        status: 'granted',
      },
    });
    const consentBuffer = await evaluateTransaction(orgName, identityLabel, 'findAssetsByQuery', consentQuery);
    const consents = JSON.parse(consentBuffer.toString());

    if (!consents || consents.length === 0) {
      return []; // No consents means no records to see
    }

    // 3. Extract the record IDs from the consents
    const recordIds = consents.map((c) => c.record.recordId);

    // 4. Find all medical records matching the extracted IDs
    const recordsQuery = JSON.stringify({
      selector: {
        docType: 'MedicalRecord',
        recordId: { $in: recordIds },
      },
    });

    const recordsBuffer = await evaluateTransaction(orgName, identityLabel, 'findAssetsByQuery', recordsQuery);
    return JSON.parse(recordsBuffer.toString());
  } catch (error) {
    // Let the error from blockchainUtils propagate
    throw error;
  }
};

/**
 * Deletes a file associated with a medical record.
 * This involves deleting the file from S3 and clearing its reference on the blockchain.
 * @param {object} user - The authenticated user (patient) object.
 * @param {string} recordId - The ID of the record whose file should be deleted.
 * @returns {Promise<string>} A success message.
 */
const deleteFileFromRecord = async (user, recordId) => {
  const identityLabel = user.email;
  const orgName = 'org2'; // Patient action

  // 1. Get the record from the blockchain to find the S3 object key
  const recordBuffer = await evaluateTransaction(orgName, identityLabel, 'getRecordById', recordId);
  const record = JSON.parse(recordBuffer.toString());

  if (!record || !record.s3ObjectKey) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No file found for this record.');
  }

  // 2. Delete the file from S3. The orgName is part of the bucket path.
  await deleteFile(record.s3ObjectKey, `org${user.orgId}`);

  // 3. Call chaincode to remove the file reference from the ledger
  try {
    await submitTransaction(orgName, identityLabel, 'removeFileFromRecord', recordId);
    return 'File successfully deleted from the record.';
  } catch (error) {
    // Let the error from blockchainUtils propagate
    throw error;
  }
};

module.exports = {
  getRecordById,
  createPatientRecord,
  grantConsent,
  revokeConsent,
  createMedicalRecordByDoctor,
  getMyRecords,
  getMyConsents,
  getAccessibleRecords,
  deleteFileFromRecord,
};
