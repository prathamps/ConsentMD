/**
 * This file contains sample data structures for the assets created
 * by the MedicalConsentContract chaincode. This is for reference purposes
 * to help developers understand the data they are working with.
 */

// 1. Doctor Profile
// Created by a doctor via the registerDoctorProfile function.
// This is a public profile that patients can query to find doctors.
const doctorProfile = {
  profileId: 'profile_x509::/OU=client/OU=org1/OU=department1/CN=doctor@email.com::/C=US/ST=California/L=San Francisco/O=org1.example.com/CN=ca.org1.example.com',
  docType: 'DoctorProfile',
  doctorId: 'x509::/OU=client/OU=org1/OU=department1/CN=doctor@email.com::/C=US/ST=California/L=San Francisco/O=org1.example.com/CN=ca.org1.example.com',
  name: 'Dr. Alice',
  specialization: 'Cardiology',
  registeredAt: '2023-10-27T10:00:00.000Z',
};

// 2. Medical Record
// Can be created by a patient (createPatientRecord) or a doctor (createMedicalRecord).
// This is the primary asset that is shared and controlled via consents.
const medicalRecord = {
  recordId: 'record_txid_1a2b3c4d',
  docType: 'MedicalRecord',
  patientId: 'x509::/OU=client/OU=org2/OU=department1/CN=patient@email.com::/C=US/ST=California/L=San Francisco/O=org2.example.com/CN=ca.org2.example.com',
  details: 'Initial consultation notes regarding chest pain.',
  fileName: 'report-2023-10-27.pdf',
  s3ObjectKey: 'uploads/patient_email_com/report-2023-10-27.pdf',
  doctorCreatorId: 'x509::/OU=client/OU=org1/OU=department1/CN=doctor@email.com::/C=US/ST=California/L=San Francisco/O=org1.example.com/CN=ca.org1.example.com', // or null if patient-created
  createdAt: '2023-10-27T10:05:00.000Z',
  updatedAt: '2023-10-27T10:15:00.000Z', // only present if updated
  updaterId: '...', // only present if updated
  archived: false,
};

// 3. Consent Asset
// Created by a patient via the grantConsent function. This asset links a patient,
// a doctor, and a specific record together.
const consent = {
  consentId: 'consent_txid_5e6f7g8h',
  docType: 'Consent',
  recordId: 'record_txid_1a2b3c4d',
  patientId: 'x509::/OU=client/OU=org2/OU=department1/CN=patient@email.com::/C=US/ST=California/L=San Francisco/O=org2.example.com/CN=ca.org2.example.com',
  doctorId: 'x509::/OU=client/OU=org1/OU=department1/CN=doctor@email.com::/C=US/ST=California/L=San Francisco/O=org1.example.com/CN=ca.org1.example.com',
  status: 'granted', // can be 'granted' or 'revoked'
  grantedAt: '2023-10-27T11:00:00.000Z',
  revokedAt: null, // or a timestamp if status is 'revoked'
};

// 4. Private Note (Example of data in a Private Data Collection)
// This data is not stored on the public ledger. It is passed via the
// transient field when calling addPrivateNoteToRecord. Only orgs that are
// members of the specified collection can see this data.
const privateNote = {
  noteId: 'privnote_txid_9i0j1k2l',
  docType: 'PrivateNote',
  note: 'Patient mentioned confidential family history of heart conditions.',
  authorId: 'x509::/OU=client/OU=org1/OU=department1/CN=doctor@email.com::/C=US/ST=California/L=San Francisco/O=org1.example.com/CN=ca.org1.example.com',
  timestamp: '2023-10-27T12:00:00.000Z',
};
