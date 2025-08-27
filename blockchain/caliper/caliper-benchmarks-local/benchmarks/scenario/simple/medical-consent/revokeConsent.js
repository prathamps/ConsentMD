"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

// Global arrays to track created consents
if (typeof global.consentIds === "undefined") {
	global.consentIds = []
}

class RevokeConsentWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.revocationReasons = [
			"treatment-completed",
			"patient-preference",
			"doctor-change",
			"privacy-concerns",
			"end-of-care",
			"second-opinion-obtained",
			"treatment-declined",
			"emergency-resolved",
			"consultation-finished",
			"patient-relocation",
		]
		this.revocationScenarios = [
			"routine-revocation",
			"immediate-revocation",
			"scheduled-revocation",
			"emergency-revocation",
			"policy-based-revocation",
		]
	}

	/**
	 * Get a random consent ID from existing consents
	 */
	getRandomConsentId() {
		if (global.consentIds.length === 0) {
			// If no consents exist, create a mock reference for testing
			return `consent_${this.workerIndex}_${Date.now()}`
		}
		const randomIndex = Math.floor(Math.random() * global.consentIds.length)
		return global.consentIds[randomIndex]
	}

	/**
	 * Validate patient role context for consent revocation
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
	 * Validate consent ID format and existence
	 */
	validateConsentId(consentId) {
		if (!consentId || !consentId.startsWith("consent_")) {
			throw new Error(`Invalid consent ID format: ${consentId}`)
		}
		return true
	}

	/**
	 * Validate consent ownership and authorization for revocation
	 */
	async validateConsentOwnership(patientId, consentId) {
		// Validate patient role
		this.validatePatientRole(patientId)

		// Validate consent ID
		this.validateConsentId(consentId)

		// In a real scenario, we would:
		// 1. Verify the consent exists
		// 2. Verify the consent belongs to the patient
		// 3. Verify the consent is currently in "granted" status
		// 4. Check if the patient has authorization to revoke this consent
		// For benchmarking, we simulate these validations
		return true
	}

	/**
	 * Generate realistic revocation scenario data
	 */
	generateRevocationScenario(patientId, consentId) {
		const reason =
			this.revocationReasons[
				Math.floor(Math.random() * this.revocationReasons.length)
			]
		const scenario =
			this.revocationScenarios[
				Math.floor(Math.random() * this.revocationScenarios.length)
			]

		return {
			scenario: `Patient ${patientId} revoking consent ${consentId} due to ${reason}`,
			reason: reason,
			revocationType: scenario,
			consentId: consentId,
			expectedOutcome: "revoked",
		}
	}

	/**
	 * Simulate consent lifecycle management validation
	 */
	validateConsentLifecycle(consentId, revocationScenario) {
		// In a real scenario, we would:
		// 1. Check consent history and current status
		// 2. Validate business rules for revocation timing
		// 3. Check for any active treatments that depend on this consent
		// 4. Validate revocation permissions based on consent type
		// For benchmarking, we simulate these lifecycle checks

		if (!consentId) {
			throw new Error("Consent ID is required for revocation")
		}

		if (!revocationScenario.reason) {
			throw new Error("Revocation reason is required")
		}

		return true
	}

	async submitTransaction() {
		this.txIndex++
		const patientId = `patient_${this.workerIndex}_${this.txIndex}`
		const consentId = this.getRandomConsentId()

		try {
			// Validate consent ownership and authorization
			await this.validateConsentOwnership(patientId, consentId)

			// Generate realistic revocation scenario
			const revocationScenario = this.generateRevocationScenario(
				patientId,
				consentId
			)

			// Validate consent lifecycle management
			this.validateConsentLifecycle(consentId, revocationScenario)

			const myArgs = {
				contractId: "medicalconsent",
				contractFunction: "revokeConsent",
				contractArguments: [consentId],
				readOnly: false,
			}

			const results = await this.sutAdapter.sendRequests(myArgs)

			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					try {
						const revokedConsent = JSON.parse(result.GetResult().toString())
						if (revokedConsent && revokedConsent.consentId) {
							console.log(
								`Successfully revoked consent: ${revokedConsent.consentId} with status: ${revokedConsent.status}`
							)

							// Validate revoked consent data structure
							if (revokedConsent.status !== "revoked") {
								console.warn(
									`Unexpected consent status after revocation: ${revokedConsent.status}`
								)
							}
							if (revokedConsent.consentId !== consentId) {
								console.warn(
									`Consent ID mismatch: expected ${consentId}, got ${revokedConsent.consentId}`
								)
							}
							if (!revokedConsent.revokedAt) {
								console.warn(
									`Missing revocation timestamp for consent: ${consentId}`
								)
							}

							// Remove revoked consent from active consents list
							const index = global.consentIds.indexOf(consentId)
							if (index > -1) {
								global.consentIds.splice(index, 1)
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
						`Transaction failed for patient ${patientId}, consent ${consentId}: ${errorMsg}`
					)
					throw new Error(`Transaction failed: ${errorMsg}`)
				}
			}
		} catch (error) {
			console.error(
				`Error in revokeConsent for patient ${patientId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new RevokeConsentWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
