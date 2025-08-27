"use strict"

/**
 * Identity Management utilities for blockchain benchmarking
 * Handles patient and doctor identity contexts with proper role validation
 */
class IdentityManager {
	constructor() {
		// Global storage for identity tracking across workloads
		this.initializeGlobalStorage()

		// Identity validation patterns
		this.identityPatterns = {
			patient: /^patient_\d+_\d+_\d+_\d{3}$/,
			doctor: /^doctor_[A-Z]{2}_\d+_\d+_\d+_\d{3}$/,
			record: /^record_\d+_\d+_\d+_\d{3}$/,
			consent: /^consent_\d+_\d+_\d+_\d{3}$/,
		}

		// Role-based permissions matrix
		this.permissions = {
			patient: {
				canCreate: ["patientRecord"],
				canRead: ["ownRecords", "ownConsents"],
				canUpdate: ["ownRecords"],
				canGrant: ["consent"],
				canRevoke: ["ownConsent"],
			},
			doctor: {
				canCreate: ["medicalRecord", "doctorProfile"],
				canRead: ["authorizedRecords", "patientRecords"],
				canUpdate: ["authorizedRecords"],
				canAccess: ["consentedRecords"],
				canAdd: ["privateNotes"],
			},
		}
	}

	/**
	 * Initialize global storage for cross-workload identity tracking
	 */
	initializeGlobalStorage() {
		if (typeof global.identityRegistry === "undefined") {
			global.identityRegistry = {
				patients: new Map(),
				doctors: new Map(),
				records: new Map(),
				consents: new Map(),
				relationships: new Map(), // patient-doctor relationships
			}
		}
	}

	/**
	 * Register a new patient identity
	 */
	registerPatient(patientId, metadata = {}) {
		if (!this.validatePatientId(patientId)) {
			throw new Error(`Invalid patient ID format: ${patientId}`)
		}

		const patientData = {
			id: patientId,
			role: "patient",
			registeredAt: new Date().toISOString(),
			recordIds: [],
			consentIds: [],
			metadata: metadata,
		}

		global.identityRegistry.patients.set(patientId, patientData)
		return patientData
	}

	/**
	 * Register a new doctor identity
	 */
	registerDoctor(doctorId, profileData = {}) {
		if (!this.validateDoctorId(doctorId)) {
			throw new Error(`Invalid doctor ID format: ${doctorId}`)
		}

		const doctorData = {
			id: doctorId,
			role: "doctor",
			registeredAt: new Date().toISOString(),
			profileId: profileData.profileId || null,
			specialization: profileData.specialization || "General Medicine",
			authorizedRecords: [],
			consentIds: [],
			metadata: profileData,
		}

		global.identityRegistry.doctors.set(doctorId, doctorData)
		return doctorData
	}

	/**
	 * Register a medical record with ownership
	 */
	registerRecord(recordId, ownerId, recordType = "patient", metadata = {}) {
		if (!recordId) {
			throw new Error("Record ID is required")
		}

		const recordData = {
			id: recordId,
			ownerId: ownerId,
			recordType: recordType,
			createdAt: new Date().toISOString(),
			authorizedDoctors: [],
			consentIds: [],
			metadata: metadata,
		}

		global.identityRegistry.records.set(recordId, recordData)

		// Update owner's record list
		if (
			recordType === "patient" &&
			global.identityRegistry.patients.has(ownerId)
		) {
			global.identityRegistry.patients.get(ownerId).recordIds.push(recordId)
		} else if (
			recordType === "medical" &&
			global.identityRegistry.doctors.has(ownerId)
		) {
			global.identityRegistry.doctors
				.get(ownerId)
				.authorizedRecords.push(recordId)
		}

		return recordData
	}

	/**
	 * Register a consent relationship
	 */
	registerConsent(consentId, patientId, doctorId, recordId, metadata = {}) {
		const consentData = {
			id: consentId,
			patientId: patientId,
			doctorId: doctorId,
			recordId: recordId,
			status: "granted",
			grantedAt: new Date().toISOString(),
			revokedAt: null,
			metadata: metadata,
		}

		global.identityRegistry.consents.set(consentId, consentData)

		// Update patient's consent list
		if (global.identityRegistry.patients.has(patientId)) {
			global.identityRegistry.patients.get(patientId).consentIds.push(consentId)
		}

		// Update doctor's consent list
		if (global.identityRegistry.doctors.has(doctorId)) {
			global.identityRegistry.doctors.get(doctorId).consentIds.push(consentId)
		}

		// Update record's consent list
		if (global.identityRegistry.records.has(recordId)) {
			global.identityRegistry.records.get(recordId).consentIds.push(consentId)
			global.identityRegistry.records
				.get(recordId)
				.authorizedDoctors.push(doctorId)
		}

		// Register patient-doctor relationship
		this.registerRelationship(patientId, doctorId, recordId)

		return consentData
	}

	/**
	 * Register patient-doctor relationship
	 */
	registerRelationship(patientId, doctorId, recordId) {
		const relationshipKey = `${patientId}-${doctorId}`

		if (!global.identityRegistry.relationships.has(relationshipKey)) {
			global.identityRegistry.relationships.set(relationshipKey, {
				patientId: patientId,
				doctorId: doctorId,
				recordIds: [],
				establishedAt: new Date().toISOString(),
			})
		}

		const relationship =
			global.identityRegistry.relationships.get(relationshipKey)
		if (!relationship.recordIds.includes(recordId)) {
			relationship.recordIds.push(recordId)
		}

		return relationship
	}

	/**
	 * Validate patient identity and permissions
	 */
	validatePatientAccess(patientId, action, resourceId = null) {
		if (!this.validatePatientId(patientId)) {
			throw new Error(`Invalid patient ID format: ${patientId}`)
		}

		const patient = global.identityRegistry.patients.get(patientId)
		if (!patient) {
			throw new Error(`Patient not found: ${patientId}`)
		}

		// Check role-based permissions
		const allowedActions = this.permissions.patient

		switch (action) {
			case "createRecord":
				return allowedActions.canCreate.includes("patientRecord")
			case "readOwnRecords":
				return allowedActions.canRead.includes("ownRecords")
			case "updateOwnRecord":
				return (
					allowedActions.canUpdate.includes("ownRecords") &&
					patient.recordIds.includes(resourceId)
				)
			case "grantConsent":
				return allowedActions.canGrant.includes("consent")
			case "revokeConsent":
				return (
					allowedActions.canRevoke.includes("ownConsent") &&
					patient.consentIds.includes(resourceId)
				)
			default:
				return false
		}
	}

	/**
	 * Validate doctor identity and permissions
	 */
	validateDoctorAccess(doctorId, action, resourceId = null) {
		if (!this.validateDoctorId(doctorId)) {
			throw new Error(`Invalid doctor ID format: ${doctorId}`)
		}

		const doctor = global.identityRegistry.doctors.get(doctorId)
		if (!doctor) {
			throw new Error(`Doctor not found: ${doctorId}`)
		}

		// Check role-based permissions
		const allowedActions = this.permissions.doctor

		switch (action) {
			case "createMedicalRecord":
				return allowedActions.canCreate.includes("medicalRecord")
			case "createProfile":
				return allowedActions.canCreate.includes("doctorProfile")
			case "readAuthorizedRecords":
				return allowedActions.canRead.includes("authorizedRecords")
			case "accessConsentedRecord":
				return (
					allowedActions.canAccess.includes("consentedRecords") &&
					doctor.authorizedRecords.includes(resourceId)
				)
			case "addPrivateNote":
				return allowedActions.canAdd.includes("privateNotes")
			default:
				return false
		}
	}

	/**
	 * Check if doctor has consent to access patient record
	 */
	hasConsentAccess(doctorId, recordId) {
		const record = global.identityRegistry.records.get(recordId)
		if (!record) {
			return false
		}

		return record.authorizedDoctors.includes(doctorId)
	}

	/**
	 * Get patient-doctor relationship
	 */
	getRelationship(patientId, doctorId) {
		const relationshipKey = `${patientId}-${doctorId}`
		return global.identityRegistry.relationships.get(relationshipKey)
	}

	/**
	 * Get random existing patient ID for testing
	 */
	getRandomPatientId() {
		const patientIds = Array.from(global.identityRegistry.patients.keys())
		if (patientIds.length === 0) {
			return null
		}
		return patientIds[Math.floor(Math.random() * patientIds.length)]
	}

	/**
	 * Get random existing doctor ID for testing
	 */
	getRandomDoctorId() {
		const doctorIds = Array.from(global.identityRegistry.doctors.keys())
		if (doctorIds.length === 0) {
			return null
		}
		return doctorIds[Math.floor(Math.random() * doctorIds.length)]
	}

	/**
	 * Get random existing record ID for testing
	 */
	getRandomRecordId() {
		const recordIds = Array.from(global.identityRegistry.records.keys())
		if (recordIds.length === 0) {
			return null
		}
		return recordIds[Math.floor(Math.random() * recordIds.length)]
	}

	/**
	 * Get records owned by a patient
	 */
	getPatientRecords(patientId) {
		const patient = global.identityRegistry.patients.get(patientId)
		return patient ? patient.recordIds : []
	}

	/**
	 * Get records authorized for a doctor
	 */
	getDoctorAuthorizedRecords(doctorId) {
		const doctor = global.identityRegistry.doctors.get(doctorId)
		return doctor ? doctor.authorizedRecords : []
	}

	/**
	 * Get active consents for a patient
	 */
	getPatientConsents(patientId) {
		const patient = global.identityRegistry.patients.get(patientId)
		if (!patient) return []

		return patient.consentIds
			.map((consentId) => global.identityRegistry.consents.get(consentId))
			.filter((consent) => consent && consent.status === "granted")
	}

	// Validation methods
	validatePatientId(patientId) {
		return this.identityPatterns.patient.test(patientId)
	}

	validateDoctorId(doctorId) {
		return this.identityPatterns.doctor.test(doctorId)
	}

	validateRecordId(recordId) {
		return this.identityPatterns.record.test(recordId)
	}

	validateConsentId(consentId) {
		return this.identityPatterns.consent.test(consentId)
	}

	/**
	 * Get identity registry statistics for monitoring
	 */
	getRegistryStats() {
		return {
			patients: global.identityRegistry.patients.size,
			doctors: global.identityRegistry.doctors.size,
			records: global.identityRegistry.records.size,
			consents: global.identityRegistry.consents.size,
			relationships: global.identityRegistry.relationships.size,
		}
	}

	/**
	 * Clear all identity data (for testing cleanup)
	 */
	clearRegistry() {
		global.identityRegistry.patients.clear()
		global.identityRegistry.doctors.clear()
		global.identityRegistry.records.clear()
		global.identityRegistry.consents.clear()
		global.identityRegistry.relationships.clear()
	}
}

module.exports = { IdentityManager }
