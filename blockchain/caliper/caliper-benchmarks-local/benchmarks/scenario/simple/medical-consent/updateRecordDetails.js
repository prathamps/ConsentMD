"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

// Use global arrays to access existing records
if (typeof global.recordIds === "undefined") {
	global.recordIds = []
}
if (typeof global.medicalRecordIds === "undefined") {
	global.medicalRecordIds = []
}

class UpdateRecordDetailsWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.updateScenarios = [
			"corrected-diagnosis",
			"updated-treatment-plan",
			"additional-symptoms",
			"medication-adjustment",
			"test-results-added",
			"progress-update",
			"complication-noted",
			"recovery-milestone",
			"specialist-consultation",
			"emergency-update",
		]
		this.updateReasons = [
			"Clinical review revealed additional information",
			"Patient reported new symptoms during follow-up",
			"Laboratory results required treatment modification",
			"Specialist consultation provided new insights",
			"Patient response to treatment exceeded expectations",
			"Adverse reaction required immediate plan adjustment",
			"Routine monitoring detected significant changes",
			"Patient compliance issues necessitated plan revision",
		]
	}

	/**
	 * Get a random record ID from existing records (patient or medical records)
	 */
	getRandomRecordId() {
		const allRecords = [...global.recordIds, ...global.medicalRecordIds]
		if (allRecords.length === 0) {
			// If no records exist, create a mock reference
			return `record_${this.workerIndex}_${Date.now()}`
		}
		const randomIndex = Math.floor(Math.random() * allRecords.length)
		return allRecords[randomIndex]
	}

	/**
	 * Generate realistic medical update details
	 */
	generateUpdateDetails(recordId, scenario) {
		const reason =
			this.updateReasons[Math.floor(Math.random() * this.updateReasons.length)]
		const timestamp = new Date().toISOString()
		const updateId = `update_${this.workerIndex}_${this.txIndex}_${Date.now()}`

		const updateTemplates = [
			`Record ${recordId} updated (${scenario}): ${reason}. Update ID: ${updateId}. Timestamp: ${timestamp}`,
			`Medical record ${recordId} revision (${scenario}): ${reason}. Version updated at ${timestamp}. Reference: ${updateId}`,
			`Clinical update for record ${recordId} (${scenario}): ${reason}. Documentation updated ${timestamp}. Tracking: ${updateId}`,
			`Patient record ${recordId} modified (${scenario}): ${reason}. Last modified: ${timestamp}. Update reference: ${updateId}`,
		]

		return updateTemplates[Math.floor(Math.random() * updateTemplates.length)]
	}

	/**
	 * Validate authorization for record update
	 */
	validateUpdateAuthorization(recordId, updaterId) {
		// Validate updater ID format (could be doctor or patient)
		if (
			!updaterId ||
			(!updaterId.startsWith("doctor_") && !updaterId.startsWith("patient_"))
		) {
			throw new Error(`Invalid updater ID format: ${updaterId}`)
		}

		// Validate record ID exists
		if (!recordId) {
			throw new Error("Record ID is required for update operation")
		}

		// In a real scenario, we would verify ownership/permission on the blockchain
		// For benchmarking, we simulate authorization validation
		return true
	}

	/**
	 * Simulate data consistency validation
	 */
	validateDataConsistency(recordId, newDetails) {
		// Check for required fields in update details
		if (!newDetails || newDetails.trim().length === 0) {
			throw new Error("Update details cannot be empty")
		}

		// Validate update details length (simulate business rules)
		if (newDetails.length > 2000) {
			throw new Error("Update details exceed maximum length limit")
		}

		// Simulate version tracking validation
		const hasVersionInfo =
			newDetails.includes("update_") && newDetails.includes("Timestamp:")
		if (!hasVersionInfo) {
			throw new Error(
				"Update details must include version tracking information"
			)
		}

		return true
	}

	async submitTransaction() {
		this.txIndex++
		const recordId = this.getRandomRecordId()
		const updaterId =
			Math.random() > 0.5
				? `doctor_${this.workerIndex}_${this.txIndex}`
				: `patient_${this.workerIndex}_${this.txIndex}`

		try {
			// Validate authorization for update
			this.validateUpdateAuthorization(recordId, updaterId)

			// Generate realistic update scenario and details
			const scenario =
				this.updateScenarios[
					Math.floor(Math.random() * this.updateScenarios.length)
				]
			const newDetails = this.generateUpdateDetails(recordId, scenario)

			// Validate data consistency
			this.validateDataConsistency(recordId, newDetails)

			const myArgs = {
				contractId: "medicalconsent",
				contractFunction: "updateRecordDetails",
				contractArguments: [recordId, newDetails],
				readOnly: false,
			}

			const results = await this.sutAdapter.sendRequests(myArgs)

			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					try {
						const response = result.GetResult().toString()
						// The response might be a simple success message or updated record
						console.log(
							`Successfully updated record ${recordId} by ${updaterId}: ${scenario}`
						)

						// If response is JSON, try to parse it
						if (response.startsWith("{")) {
							const updatedRecord = JSON.parse(response)
							if (updatedRecord.recordId) {
								console.log(`Updated record version: ${updatedRecord.recordId}`)
							}
						}
					} catch (err) {
						// If parsing fails, it might be a simple success message
						console.log(
							`Record update completed for ${recordId}: ${result
								.GetResult()
								.toString()}`
						)
					}
				} else {
					const errorMsg = result.GetResult()
						? result.GetResult().toString()
						: "Unknown error"
					console.error(
						`Update failed for record ${recordId} by ${updaterId}: ${errorMsg}`
					)
					throw new Error(`Transaction failed: ${errorMsg}`)
				}
			}
		} catch (error) {
			console.error(
				`Error in updateRecordDetails for record ${recordId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new UpdateRecordDetailsWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
