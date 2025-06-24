

const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  OTHER: 'other'
}

const USER_TYPE = {
  ADMIN: 'admin',
  USER: 'user'
}

const ORG_DEFAULT_USER = {
  ADMIN: 'admin'
}


const BLOCKCHAIN_DOC_TYPE = {
  AGREEMENT: 'agreement', // Remvove 
  APPROVAL: 'approval',
  DOCUMENT: 'document'
}

const FILTER_TYPE = {
  COMPLETED:'completed',
  EXPIRING_SOON: 'expiring-soon',
  INPROGRESS:'inprogress',
  ALL:'all',
  ACTIVE: 'active'
}

const NETWORK_ARTIFACTS_DEFAULT ={
  CHANNEL_NAME: 'mychannel',
  CHAINCODE_NAME: 'medicalconsent',
  QSCC:'qscc'
}

const ORG_DEPARTMENT = {
  DOCTOR: 'doctor',
  PATIENT: 'patient'
}

const ORG_ORGANIZATION = {
  DOCTOR: 'doctor',
  PATIENT: 'patient'
}



const APPROVAL_STATUS = {
  APPROVED:'approved',
  REJECTED: 'rejected',
  OTHER: 'other'
}

const CONSULTATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};


module.exports = {
  USER_STATUS,
  USER_TYPE,
  ORG_DEPARTMENT,
  NETWORK_ARTIFACTS_DEFAULT,
  BLOCKCHAIN_DOC_TYPE,
  APPROVAL_STATUS,
  FILTER_TYPE,
  ORG_ORGANIZATION,
  CONSULTATION_STATUS
}