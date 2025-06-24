const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const userValidation = require('../../validations/user.validation');
const userController = require('../../controllers/user.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageUsers'), validate(userValidation.createUser), userController.createUser)
  .get(auth('getUsers'), validate(userValidation.getUsers), userController.getUsers);

router.get('/doctors', auth('getDoctors'), validate(userValidation.getUsers), userController.getDoctors);
router.get('/assigned-patients', auth('doctor'), userController.getAssignedPatients);
router.get('/assigned-doctors', auth('patient'), userController.getAssignedDoctors);

router
  .route('/:userId')
  .get(auth('getUsers'), validate(userValidation.getUser), userController.getUser)
  .patch(auth('manageUsers'), validate(userValidation.updateUser), userController.updateUser)
  .delete(auth('manageUsers'), validate(userValidation.deleteUser), userController.deleteUser);

router.post(
  '/profile/doctor',
  auth('doctor'),
  validate(userValidation.registerDoctorProfile),
  userController.registerDoctorProfile
);
// router.post('/profile/doctor', userController.registerDoctorProfile);

router
  .route('/:id/status')
  .put(auth('manageUsers'), validate(userValidation.updateUserStatus), userController.updateUserStatus);

module.exports = router;
