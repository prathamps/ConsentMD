"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

// Global arrays to track created records and consents
if (typeof global.recordIds === "undefined") {
	global.recordIds = []
}
if (typeof global.medicalRecordIds === "undefined") {
	global.medicalRecordIds = []
}
if (typeof global.consentIds === "undefined") {
	global.consentIds = []
}

class GrantConsentWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.consentReasons = [
			"routine-checkup",
			"specialist-consultation",
			"emergency-treatment",
			"second-opinion",
			"follow-up-care",
			"diagnostic-review",
			"treatment-planning",
			"surgical-consultation",
			"medication-review",
			"therapy-assessment",
		]
		this.doctorSpecialties = [
			"cardiology",
			"neurology",
			"orthopedics",
			"dermatology",
			"psychiatry",
			"gastroenterology",
			"pulmonology",
			"endocrinology",
			"oncology",
			"pediatrics",
			"radiology",
			"pathology",
		]
	}

	/**
	 * Get a random record ID from existing patient or medical records
	 */
	getRandomRecordId() {
		const allRecords = [...global.recordIds, ...global.medicalRecordIds]
		if (allRecords.length === 0) {
			// If no records exist, create a mock reference for testing
			return `record_${this.workerIndex}_${Date.now()}`
		}
		const randomIndex = Math.floor(Math.random() * allRecords.length)
		return allRecords[randomIndex]
	}

	/**
	 * Generate realistic doctor ID for consent granting
	 */
	generateDoctorId() {
		const specialtyIndex = Math.floor(
			Math.random() * this.doctorSpecialties.length
		)
		const specialty = this.doctorSpecialties[specialtyIndex]
		return `doctor_${specialty}_${this.workerIndex}_${this.txIndex}`
	}

	/**
	 * Validate patient role context for consent granting
	 */
	validatePatientRole(patientId) {
		// In a real scenario, this would verify the caller's identity
		// For benchmarking, we simulate role validation
		if (!patientId || !patientId.startsWith("patient_")) {
			throw new Error(`Invalid patient ID format: ${patientId}`)
		}
		return true
	}

	/**
	 * Validate doctor ID format and existence
	 */
	validateDoctorId(doctorId) {
		if (!doctorId || !doctorId.startsWith("doctor_")) {
			throw new Error(`Invalid doctor ID format: ${doctorId}`)
		}
		return true
	}

	/**
	 * Validate patient-doctor relationship for consent granting
	 */
	async validatePatientDoctorRelationship(patientId, doctorId, recordId) {
		// Validate patient role
		this.validatePatientRole(patientId)

		// Validate doctor ID
		this.validateDoctorId(doctorId)

		// Validate record reference exists
		if (!recordId) {
			throw new Error("Record ID is required for consent granting")
		}

		// In a real scenario, we would:
		// 1. Verify the record exists and belongs to the patient
		// 2. Verify the doctor profile exists
		// 3. Check if consent already exists for this doctor-record pair
		// For benchmarking, we simulate these validations
		return true
	}

	/**
	 * Generate realistic consent scenario data
	 */
	generateConsentScenario(patientId, doctorId, recordId) {
		const reason =
			this.consentReasons[
				Math.floor(Math.random() * this.consentReasons.length)
			]

		return {
			scenario: `Patient ${patientId} granting consent to ${doctorId} for ${reason}`,
			reason: reason,
			recordId: recordId,
			expectedOutcome: "granted",
		}
	}

	async submitTransaction() {
		this.txIndex++
		const patientId = `patient_${this.workerIndex}_${this.txIndex}`
		const doctorId = this.generateDoctorId()
		const recordId = this.getRandomRecordId()

		try {
			// Validate patient-doctor relationship for consent granting
			await this.validatePatientDoctorRelationship(
				patientId,
				doctorId,
				recordId
			)

			// Generate realistic consent scenario
			const consentScenario = this.generateConsentScenario(
				patientId,
				doctorId,
				recordId
			)

			const myArgs = {
				contractId: "medicalconsent",
				contractFunction: "grantConsent",
				contractArguments: [recordId, doctorId],
				readOnly: false,
			}

			const results = await this.sutAdapter.sendRequests(myArgs)

			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					try {
						const consent = JSON.parse(result.GetResult().toString())
						if (consent && consent.consentId) {
							global.consentIds.push(consent.consentId)
							console.log(
								`Successfully granted consent: ${consent.consentId} for record: ${recordId} to doctor: ${doctorId}`
							)

							// Validate consent data structure
							if (consent.status !== "granted") {
								console.warn(`Unexpected consent status: ${consent.status}`)
							}
							if (consent.recordId !== recordId) {
								console.warn(
									`Record ID mismatch in consent: expected ${recordId}, got ${consent.recordId}`
								)
							}
							if (consent.doctorId !== doctorId) {
								console.warn(
									`Doctor ID mismatch in consent: expected ${doctorId}, got ${consent.doctorId}`
								)
							}
						}
					} catch (err) {
						console.error(
							`Could not parse response for successful transaction: ${result
								.GetResult()
								.toString()}`
						)
						throw new Error(`JSON parsing failed: ${err.message}`)
					}
				} else {
					const errorMsg = result.GetResult()
						? result.GetResult().toString()
						: "Unknown error"
					console.error(
						`Transaction failed for patient ${patientId}, doctor ${doctorId}, record ${recordId}: ${errorMsg}`
					)
					throw new Error(`Transaction failed: ${errorMsg}`)
				}
			}
		} catch (error) {
			console.error(
				`Error in grantConsent for patient ${patientId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new GrantConsentWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
