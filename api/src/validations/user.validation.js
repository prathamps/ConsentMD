const Joi = require('joi');
const { ORG_ORGANIZATION, USER_STATUS } = require('../utils/Constants');
const { password, objectId } = require('./custom.validation');

const createUser = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    organization: Joi.string().required().valid(ORG_ORGANIZATION.DOCTOR, ORG_ORGANIZATION.PATIENT),
    orgId: Joi.number().required(),
  }),
};

const updateUserStatus = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
  body: Joi.object().keys({
    status: Joi.string().required().valid(USER_STATUS.ACTIVE, USER_STATUS.INACTIVE, USER_STATUS.OTHER),
  }),
};

const getUsers = {
  query: Joi.object().keys({
    size: Joi.number().integer().max(100).required(),
    page: Joi.number().integer().required(),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      email: Joi.string().email(),
      password: Joi.string().custom(password),
      name: Joi.string(),
      organization: Joi.string().valid(ORG_ORGANIZATION.DOCTOR, ORG_ORGANIZATION.PATIENT),
    })
    .min(1),
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const registerDoctorProfile = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    specialization: Joi.string().required(),
  }),
};

 

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  registerDoctorProfile,
};
