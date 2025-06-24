const allRoles = {
  user: [],
  doctor: ['getUsers', 'getRecords', 'getConsultations', 'manageConsultations'],
  patient: ['getUsers', 'manageRecords', 'getDoctors', 'createConsultation', 'getConsultations'],
  admin: ['getUsers', 'manageUsers', 'getRecords', 'manageRecords'],
};

const roles = Object.keys(allRoles);
const roleRights = new Map(Object.entries(allRoles));

module.exports = {
  roles,
  roleRights,
};
