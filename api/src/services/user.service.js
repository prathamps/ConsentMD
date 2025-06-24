const httpStatus = require('http-status');
const { User } = require('../models');
const Consultation = require('../models/consultation.model');
const ApiError = require('../utils/ApiError');
const { USER_STATUS, CONSULTATION_STATUS } = require('../utils/Constants');
const { registerUser, submitTransaction, evaluateTransaction } = require('../utils/blockchainUtils');

/**
 * Create a user in the database and register their identity on the blockchain.
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  // 1. Determine the organization based on the role
  const orgName = userBody.organization === 'doctor' ? 'org1' : 'org2';

  // 2. Register the user on the blockchain network
  const enrollmentSecret = await registerUser(orgName, userBody.email, userBody.organization);
  if (!enrollmentSecret) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Blockchain identity registration failed.');
  }

  // 3. Add the enrollment secret to the user object before saving
  const userToSave = {
    ...userBody,
    secret: enrollmentSecret,
    status: USER_STATUS.ACTIVE,
  };

  // 4. Save the user to the database
  const user = await User.create(userToSave);

  // 5. Fetch and save the blockchain ID
  try {
    const idBuffer = await evaluateTransaction(orgName, user.email, 'getMyId');
    user.blockchainId = idBuffer.toString();
    await user.save();
  } catch (error) {
    // This is not a critical failure; the ID can be fetched later.
    // We log the error but don't prevent the user from being created.
    console.error(`--- Failed to fetch blockchainId for user ${user.email}:`, error);
  }

  return user;
};

/**
 * Query for users
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async (filter, options) => {
  return User.paginate(filter, options);
};

/**
 * Get user by id
 * @param {ObjectId} id
 * @returns {Promise<User>}
 */
const getUserById = async (id) => {
  return User.findById(id);
};

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User>}
 */
const getUserByEmail = async (email) => {
  return User.findOne({ email });
};

/**
 * Update user by id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  Object.assign(user, updateBody);
  await user.save();
  return user;
};

/**
 * Update user by id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserStatus = async (userId, status) => {
  const user = await getUserById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  try {
    if (!user.secret) {
      //Blockchain Registration and Enrollment call
      let secret = await registerUser(`org${user.orgId}`, user.email, user.department);
      user.secret = secret;
      user.isVerified = true;
    }
  } catch (error) {
    console.log('Error occured--', error);
  }

  user.status = status;
  await user.save();
  return user;
};

/**
 * Delete user by id
 * @param {ObjectId} userId
 * @returns {Promise<User>}
 */
const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  await user.remove();
  return user;
};

/**
 * Registers a doctor's public profile on the blockchain.
 * @param {object} user - The authenticated user (doctor) object.
 * @param {object} profileBody - The profile details ({ name, specialization }).
 * @returns {Promise<object>} The parsed blockchain profile object.
 */
const registerDoctorProfile = async (user, profileBody) => {
  const { name, specialization } = profileBody;
  const identityLabel = user.email;
  const orgName = 'org1'; // Doctor action

  if (user.role !== 'doctor') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only doctors can register a profile.');
  }

  try {
    const resultBuffer = await submitTransaction(orgName, identityLabel, 'registerDoctorProfile', name, specialization);

    // Also update the user profile in MongoDB
    const userToUpdate = await getUserById(user._id);
    if (!userToUpdate) {
      // This should not happen if the user is authenticated
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    Object.assign(userToUpdate, { name, specialization });
    await userToUpdate.save();

    return JSON.parse(resultBuffer.toString());
  } catch (error) {
    // Let the error from blockchainUtils propagate
    throw error;
  }
};

/**
 * Get all active doctors
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const getDoctors = async (options) => {
  const filter = { role: 'doctor', status: USER_STATUS.ACTIVE };
  return User.paginate(filter, options);
};

/**
 * Get assigned patients for a doctor
 * @param {ObjectId} doctorId
 * @returns {Promise<User[]>}
 */
const getAssignedPatients = async (doctorId) => {
  console.log(`--- Getting assigned patients for doctorId: [${doctorId}]`);
  const consultations = await Consultation.find({ doctor: doctorId, status: CONSULTATION_STATUS.APPROVED }).populate(
    'patient'
  );
  console.log(`--- Found [${consultations.length}] approved consultations for this doctor.`);
  if (consultations.length > 0) {
    console.log('--- Consultations found:', consultations);
  }
  const patients = consultations.map((consultation) => consultation.patient);
  // Return unique patients
  const uniquePatients = [...new Map(patients.map((item) => [item.id, item])).values()];
  console.log(`--- Returning [${uniquePatients.length}] unique patients.`);
  return uniquePatients;
};

/**
 * Get assigned doctors for a patient
 * @param {ObjectId} patientId
 * @returns {Promise<User[]>}
 */
const getAssignedDoctors = async (patientId) => {
  const consultations = await Consultation.find({ patient: patientId, status: CONSULTATION_STATUS.APPROVED }).populate(
    'doctor'
  );
  const doctors = consultations.map((consultation) => consultation.doctor);
  // Return unique doctors
  return [...new Map(doctors.map((item) => [item.id, item])).values()];
};

module.exports = {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
  updateUserStatus,
  registerDoctorProfile,
  getDoctors,
  getAssignedPatients,
  getAssignedDoctors,
};
