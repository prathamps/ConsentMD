"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

// Use global arrays to access existing records
if (typeof global.recordIds === "undefined") {
	global.recordIds = []
}
if (typeof global.medicalRecordIds === "undefined") {
	global.medicalRecordIds = []
}
if (typeof global.archivedRecordIds === "undefined") {
	global.archivedRecordIds = []
}

class ArchiveMedicalRecordWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.archivalReasons = [
			"treatment-completed",
			"patient-discharged",
			"case-closed",
			"transferred-to-specialist",
			"long-term-storage",
			"regulatory-compliance",
			"patient-request",
			"data-retention-policy",
			"legal-requirement",
			"clinical-trial-ended",
		]
		this.archivalCategories = [
			"routine-archival",
			"emergency-archival",
			"compliance-archival",
			"patient-initiated",
			"doctor-initiated",
			"system-initiated",
			"legal-hold",
			"research-complete",
		]
	}

	/**
	 * Get a random record ID from existing records (prefer medical records for archival)
	 */
	getRandomRecordForArchival() {
		// Prefer medical records for archival, but can archive patient records too
		const availableRecords =
			global.medicalRecordIds.length > 0
				? global.medicalRecordIds
				: global.recordIds

		if (availableRecords.length === 0) {
			// If no records exist, create a mock reference
			return `record_${this.workerIndex}_${Date.now()}`
		}

		// Don't archive already archived records
		const nonArchivedRecords = availableRecords.filter(
			(id) => !global.archivedRecordIds.includes(id)
		)

		if (nonArchivedRecords.length === 0) {
			// If all records are archived, use any available record
			const randomIndex = Math.floor(Math.random() * availableRecords.length)
			return availableRecords[randomIndex]
		}

		const randomIndex = Math.floor(Math.random() * nonArchivedRecords.length)
		return nonArchivedRecords[randomIndex]
	}

	/**
	 * Generate archival metadata and reason
	 */
	generateArchivalMetadata(recordId, archiverId) {
		const reason =
			this.archivalReasons[
				Math.floor(Math.random() * this.archivalReasons.length)
			]
		const category =
			this.archivalCategories[
				Math.floor(Math.random() * this.archivalCategories.length)
			]
		const timestamp = new Date().toISOString()
		const archivalId = `archive_${this.workerIndex}_${
			this.txIndex
		}_${Date.now()}`

		return {
			archivalId,
			reason,
			category,
			timestamp,
			archivedBy: archiverId,
			originalRecordId: recordId,
			retentionPeriod: Math.floor(Math.random() * 10) + 5, // 5-15 years
			accessLevel: Math.random() > 0.7 ? "restricted" : "standard",
		}
	}

	/**
	 * Validate ownership and authorization for archival
	 */
	validateArchivalAuthorization(recordId, archiverId) {
		// Validate archiver ID format (should be doctor or system admin)
		if (
			!archiverId ||
			(!archiverId.startsWith("doctor_") && !archiverId.startsWith("admin_"))
		) {
			throw new Error(
				`Invalid archiver ID format: ${archiverId}. Only doctors and admins can archive records.`
			)
		}

		// Validate record ID exists
		if (!recordId) {
			throw new Error("Record ID is required for archival operation")
		}

		// Check if record is already archived
		if (global.archivedRecordIds.includes(recordId)) {
			console.warn(
				`Record ${recordId} is already archived, proceeding with re-archival`
			)
		}

		// In a real scenario, we would verify ownership/permission on the blockchain
		// For benchmarking, we simulate authorization validation
		return true
	}

	/**
	 * Validate archival business rules
	 */
	validateArchivalRules(recordId, metadata) {
		// Check retention period is valid
		if (metadata.retentionPeriod < 1 || metadata.retentionPeriod > 50) {
			throw new Error("Retention period must be between 1 and 50 years")
		}

		// Validate access level
		if (
			!["standard", "restricted", "confidential"].includes(metadata.accessLevel)
		) {
			throw new Error("Invalid access level for archived record")
		}

		// Simulate business rule validation
		if (
			metadata.reason === "patient-request" &&
			!metadata.archivedBy.startsWith("patient_")
		) {
			// Allow doctors to archive on patient request
			if (!metadata.archivedBy.startsWith("doctor_")) {
				throw new Error(
					"Patient-requested archival must be performed by patient or authorized doctor"
				)
			}
		}

		return true
	}

	async submitTransaction() {
		this.txIndex++
		const recordId = this.getRandomRecordForArchival()
		const archiverId =
			Math.random() > 0.3
				? `doctor_${this.workerIndex}_${this.txIndex}`
				: `admin_${this.workerIndex}_${this.txIndex}`

		try {
			// Validate authorization for archival
			this.validateArchivalAuthorization(recordId, archiverId)

			// Generate archival metadata
			const metadata = this.generateArchivalMetadata(recordId, archiverId)

			// Validate archival business rules
			this.validateArchivalRules(recordId, metadata)

			// Create archival details string
			const archivalDetails = JSON.stringify(metadata)

			const myArgs = {
				contractId: "medicalconsent",
				contractFunction: "archiveMedicalRecord",
				contractArguments: [recordId, archivalDetails],
				readOnly: false,
			}

			const results = await this.sutAdapter.sendRequests(myArgs)

			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					try {
						const response = result.GetResult().toString()

						// Track archived record
						if (!global.archivedRecordIds.includes(recordId)) {
							global.archivedRecordIds.push(recordId)
						}

						console.log(
							`Successfully archived record ${recordId} by ${archiverId} (${metadata.reason})`
						)

						// If response is JSON, try to parse it
						if (response.startsWith("{")) {
							const archivedRecord = JSON.parse(response)
							if (archivedRecord.status === "archived") {
								console.log(`Record ${recordId} status updated to archived`)
							}
						}
					} catch (err) {
						// If parsing fails, it might be a simple success message
						console.log(
							`Record archival completed for ${recordId}: ${result
								.GetResult()
								.toString()}`
						)

						// Still track as archived even if parsing fails
						if (!global.archivedRecordIds.includes(recordId)) {
							global.archivedRecordIds.push(recordId)
						}
					}
				} else {
					const errorMsg = result.GetResult()
						? result.GetResult().toString()
						: "Unknown error"
					console.error(
						`Archival failed for record ${recordId} by ${archiverId}: ${errorMsg}`
					)
					throw new Error(`Transaction failed: ${errorMsg}`)
				}
			}
		} catch (error) {
			console.error(
				`Error in archiveMedicalRecord for record ${recordId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new ArchiveMedicalRecordWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
