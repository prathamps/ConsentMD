"use strict"

/**
 * Data Relationship Manager for maintaining referential integrity
 * Handles complex relationships between patients, doctors, records, and consents
 */
class RelationshipManager {
	constructor() {
		this.initializeGlobalRelationships()

		// Relationship validation rules
		this.relationshipRules = {
			patientRecord: {
				requiredFields: ["patientId", "recordId"],
				constraints: ["patientMustExist", "recordMustBeUnique"],
			},
			medicalRecord: {
				requiredFields: ["doctorId", "recordId", "patientId"],
				constraints: [
					"doctorMustExist",
					"patientMustExist",
					"recordMustBeUnique",
				],
			},
			consent: {
				requiredFields: ["patientId", "doctorId", "recordId", "consentId"],
				constraints: [
					"patientMustExist",
					"doctorMustExist",
					"recordMustExist",
					"noDuplicateConsent",
				],
			},
			privateNote: {
				requiredFields: ["doctorId", "recordId", "noteId"],
				constraints: [
					"doctorMustExist",
					"recordMustExist",
					"doctorMustHaveConsent",
				],
			},
		}
	}

	/**
	 * Initialize global relationship tracking
	 */
	initializeGlobalRelationships() {
		if (typeof global.relationshipData === "undefined") {
			global.relationshipData = {
				// Patient -> Records mapping
				patientRecords: new Map(),
				// Doctor -> Records mapping
				doctorRecords: new Map(),
				// Record -> Consents mapping
				recordConsents: new Map(),
				// Patient -> Doctor relationships
				patientDoctorRelations: new Map(),
				// Consent chains (patient -> doctor -> record)
				consentChains: new Map(),
				// Private data collections
				privateDataCollections: new Map(),
				// Dependency graph for transaction ordering
				dependencyGraph: new Map(),
			}
		}
	}

	/**
	 * Create patient-record relationship
	 */
	createPatientRecordRelation(patientId, recordId, metadata = {}) {
		this.validateRelationship("patientRecord", { patientId, recordId })

		// Add to patient records mapping
		if (!global.relationshipData.patientRecords.has(patientId)) {
			global.relationshipData.patientRecords.set(patientId, [])
		}
		global.relationshipData.patientRecords.get(patientId).push({
			recordId: recordId,
			createdAt: new Date().toISOString(),
			metadata: metadata,
		})

		// Update dependency graph
		this.addDependency(patientId, recordId, "owns")

		return { patientId, recordId, relationship: "owns" }
	}

	/**
	 * Create doctor-record relationship (medical record creation)
	 */
	createDoctorRecordRelation(doctorId, recordId, patientId, metadata = {}) {
		this.validateRelationship("medicalRecord", {
			doctorId,
			recordId,
			patientId,
		})

		// Add to doctor records mapping
		if (!global.relationshipData.doctorRecords.has(doctorId)) {
			global.relationshipData.doctorRecords.set(doctorId, [])
		}
		global.relationshipData.doctorRecords.get(doctorId).push({
			recordId: recordId,
			patientId: patientId,
			createdAt: new Date().toISOString(),
			metadata: metadata,
		})

		// Create patient-doctor relationship if not exists
		this.createPatientDoctorRelation(patientId, doctorId, recordId)

		// Update dependency graph
		this.addDependency(doctorId, recordId, "created")
		this.addDependency(patientId, recordId, "subject")

		return { doctorId, recordId, patientId, relationship: "created" }
	}

	/**
	 * Create consent relationship
	 */
	createConsentRelation(
		patientId,
		doctorId,
		recordId,
		consentId,
		metadata = {}
	) {
		this.validateRelationship("consent", {
			patientId,
			doctorId,
			recordId,
			consentId,
		})

		// Add to record consents mapping
		if (!global.relationshipData.recordConsents.has(recordId)) {
			global.relationshipData.recordConsents.set(recordId, [])
		}
		global.relationshipData.recordConsents.get(recordId).push({
			consentId: consentId,
			patientId: patientId,
			doctorId: doctorId,
			status: "granted",
			grantedAt: new Date().toISOString(),
			revokedAt: null,
			metadata: metadata,
		})

		// Create consent chain
		const chainKey = `${patientId}-${doctorId}-${recordId}`
		global.relationshipData.consentChains.set(chainKey, {
			consentId: consentId,
			patientId: patientId,
			doctorId: doctorId,
			recordId: recordId,
			status: "granted",
			createdAt: new Date().toISOString(),
		})

		// Update patient-doctor relationship
		this.updatePatientDoctorRelation(
			patientId,
			doctorId,
			recordId,
			"consent_granted"
		)

		// Update dependency graph
		this.addDependency(consentId, recordId, "authorizes")
		this.addDependency(patientId, consentId, "granted")
		this.addDependency(doctorId, consentId, "received")

		return { patientId, doctorId, recordId, consentId, relationship: "consent" }
	}

	/**
	 * Create patient-doctor relationship
	 */
	createPatientDoctorRelation(patientId, doctorId, recordId) {
		const relationKey = `${patientId}-${doctorId}`

		if (!global.relationshipData.patientDoctorRelations.has(relationKey)) {
			global.relationshipData.patientDoctorRelations.set(relationKey, {
				patientId: patientId,
				doctorId: doctorId,
				recordIds: [],
				consentIds: [],
				establishedAt: new Date().toISOString(),
				lastInteraction: new Date().toISOString(),
			})
		}

		const relation =
			global.relationshipData.patientDoctorRelations.get(relationKey)
		if (!relation.recordIds.includes(recordId)) {
			relation.recordIds.push(recordId)
		}
		relation.lastInteraction = new Date().toISOString()

		return relation
	}

	/**
	 * Update patient-doctor relationship
	 */
	updatePatientDoctorRelation(patientId, doctorId, recordId, action) {
		const relationKey = `${patientId}-${doctorId}`
		const relation =
			global.relationshipData.patientDoctorRelations.get(relationKey)

		if (relation) {
			relation.lastInteraction = new Date().toISOString()

			if (action === "consent_granted" && recordId) {
				if (!relation.recordIds.includes(recordId)) {
					relation.recordIds.push(recordId)
				}
			}
		}

		return relation
	}

	/**
	 * Create private data collection relationship
	 */
	createPrivateDataRelation(doctorId, recordId, noteId, metadata = {}) {
		this.validateRelationship("privateNote", { doctorId, recordId, noteId })

		// Check if doctor has consent for this record
		if (!this.hasConsentAccess(doctorId, recordId)) {
			throw new Error(
				`Doctor ${doctorId} does not have consent to access record ${recordId}`
			)
		}

		const pdcKey = `${recordId}-${doctorId}`
		if (!global.relationshipData.privateDataCollections.has(pdcKey)) {
			global.relationshipData.privateDataCollections.set(pdcKey, [])
		}

		global.relationshipData.privateDataCollections.get(pdcKey).push({
			noteId: noteId,
			doctorId: doctorId,
			recordId: recordId,
			createdAt: new Date().toISOString(),
			metadata: metadata,
		})

		// Update dependency graph
		this.addDependency(noteId, recordId, "annotates")
		this.addDependency(doctorId, noteId, "authored")

		return { doctorId, recordId, noteId, relationship: "private_note" }
	}

	/**
	 * Revoke consent relationship
	 */
	revokeConsentRelation(patientId, doctorId, recordId, consentId) {
		// Update record consents
		const recordConsents = global.relationshipData.recordConsents.get(recordId)
		if (recordConsents) {
			const consent = recordConsents.find((c) => c.consentId === consentId)
			if (consent) {
				consent.status = "revoked"
				consent.revokedAt = new Date().toISOString()
			}
		}

		// Update consent chain
		const chainKey = `${patientId}-${doctorId}-${recordId}`
		const consentChain = global.relationshipData.consentChains.get(chainKey)
		if (consentChain) {
			consentChain.status = "revoked"
			consentChain.revokedAt = new Date().toISOString()
		}

		return { patientId, doctorId, recordId, consentId, status: "revoked" }
	}

	/**
	 * Check if doctor has consent access to record
	 */
	hasConsentAccess(doctorId, recordId) {
		const recordConsents = global.relationshipData.recordConsents.get(recordId)
		if (!recordConsents) {
			return false
		}

		return recordConsents.some(
			(consent) => consent.doctorId === doctorId && consent.status === "granted"
		)
	}

	/**
	 * Get all records for a patient
	 */
	getPatientRecords(patientId) {
		return global.relationshipData.patientRecords.get(patientId) || []
	}

	/**
	 * Get all records created by a doctor
	 */
	getDoctorRecords(doctorId) {
		return global.relationshipData.doctorRecords.get(doctorId) || []
	}

	/**
	 * Get all consents for a record
	 */
	getRecordConsents(recordId) {
		return global.relationshipData.recordConsents.get(recordId) || []
	}

	/**
	 * Get patient-doctor relationship
	 */
	getPatientDoctorRelation(patientId, doctorId) {
		const relationKey = `${patientId}-${doctorId}`
		return global.relationshipData.patientDoctorRelations.get(relationKey)
	}

	/**
	 * Get consent chain
	 */
	getConsentChain(patientId, doctorId, recordId) {
		const chainKey = `${patientId}-${doctorId}-${recordId}`
		return global.relationshipData.consentChains.get(chainKey)
	}

	/**
	 * Get private data collections for a record
	 */
	getPrivateDataCollections(recordId, doctorId = null) {
		if (doctorId) {
			const pdcKey = `${recordId}-${doctorId}`
			return global.relationshipData.privateDataCollections.get(pdcKey) || []
		}

		// Return all PDCs for the record
		const allPDCs = []
		for (const [key, pdcs] of global.relationshipData.privateDataCollections) {
			if (key.startsWith(`${recordId}-`)) {
				allPDCs.push(...pdcs)
			}
		}
		return allPDCs
	}

	/**
	 * Add dependency to graph
	 */
	addDependency(fromId, toId, relationshipType) {
		if (!global.relationshipData.dependencyGraph.has(fromId)) {
			global.relationshipData.dependencyGraph.set(fromId, [])
		}
		global.relationshipData.dependencyGraph.get(fromId).push({
			targetId: toId,
			relationshipType: relationshipType,
			createdAt: new Date().toISOString(),
		})
	}

	/**
	 * Get dependencies for an entity
	 */
	getDependencies(entityId) {
		return global.relationshipData.dependencyGraph.get(entityId) || []
	}

	/**
	 * Validate relationship according to rules
	 */
	validateRelationship(relationshipType, data) {
		const rules = this.relationshipRules[relationshipType]
		if (!rules) {
			throw new Error(`Unknown relationship type: ${relationshipType}`)
		}

		// Check required fields
		for (const field of rules.requiredFields) {
			if (!data[field]) {
				throw new Error(
					`Missing required field for ${relationshipType}: ${field}`
				)
			}
		}

		// Apply constraints
		for (const constraint of rules.constraints) {
			this.applyConstraint(constraint, data)
		}

		return true
	}

	/**
	 * Apply relationship constraint
	 */
	applyConstraint(constraint, data) {
		switch (constraint) {
			case "patientMustExist":
				// In a real scenario, we would check if patient exists in blockchain
				// For benchmarking, we simulate this validation
				if (!data.patientId || !data.patientId.startsWith("patient_")) {
					throw new Error(`Invalid patient ID: ${data.patientId}`)
				}
				break

			case "doctorMustExist":
				if (!data.doctorId || !data.doctorId.startsWith("doctor_")) {
					throw new Error(`Invalid doctor ID: ${data.doctorId}`)
				}
				break

			case "recordMustExist":
				if (!data.recordId) {
					throw new Error("Record ID is required")
				}
				break

			case "recordMustBeUnique":
				// Check if record already exists in our tracking
				const existingPatientRecords =
					global.relationshipData.patientRecords.get(data.patientId) || []
				if (existingPatientRecords.some((r) => r.recordId === data.recordId)) {
					throw new Error(
						`Record ${data.recordId} already exists for patient ${data.patientId}`
					)
				}
				break

			case "noDuplicateConsent":
				const chainKey = `${data.patientId}-${data.doctorId}-${data.recordId}`
				const existingChain =
					global.relationshipData.consentChains.get(chainKey)
				if (existingChain && existingChain.status === "granted") {
					throw new Error(
						`Active consent already exists for patient ${data.patientId}, doctor ${data.doctorId}, record ${data.recordId}`
					)
				}
				break

			case "doctorMustHaveConsent":
				if (!this.hasConsentAccess(data.doctorId, data.recordId)) {
					throw new Error(
						`Doctor ${data.doctorId} does not have consent to access record ${data.recordId}`
					)
				}
				break

			default:
				console.warn(`Unknown constraint: ${constraint}`)
		}
	}

	/**
	 * Get relationship statistics
	 */
	getRelationshipStats() {
		return {
			patientRecords: global.relationshipData.patientRecords.size,
			doctorRecords: global.relationshipData.doctorRecords.size,
			recordConsents: global.relationshipData.recordConsents.size,
			patientDoctorRelations:
				global.relationshipData.patientDoctorRelations.size,
			consentChains: global.relationshipData.consentChains.size,
			privateDataCollections:
				global.relationshipData.privateDataCollections.size,
			dependencies: global.relationshipData.dependencyGraph.size,
		}
	}

	/**
	 * Clear all relationship data
	 */
	clearRelationships() {
		global.relationshipData.patientRecords.clear()
		global.relationshipData.doctorRecords.clear()
		global.relationshipData.recordConsents.clear()
		global.relationshipData.patientDoctorRelations.clear()
		global.relationshipData.consentChains.clear()
		global.relationshipData.privateDataCollections.clear()
		global.relationshipData.dependencyGraph.clear()
	}

	/**
	 * Export relationship data for analysis
	 */
	exportRelationshipData() {
		return {
			patientRecords: Array.from(
				global.relationshipData.patientRecords.entries()
			),
			doctorRecords: Array.from(
				global.relationshipData.doctorRecords.entries()
			),
			recordConsents: Array.from(
				global.relationshipData.recordConsents.entries()
			),
			patientDoctorRelations: Array.from(
				global.relationshipData.patientDoctorRelations.entries()
			),
			consentChains: Array.from(
				global.relationshipData.consentChains.entries()
			),
			privateDataCollections: Array.from(
				global.relationshipData.privateDataCollections.entries()
			),
			dependencyGraph: Array.from(
				global.relationshipData.dependencyGraph.entries()
			),
		}
	}
}

module.exports = { RelationshipManager }
