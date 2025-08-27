"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

// Use global arrays to access existing records
if (typeof global.recordIds === "undefined") {
	global.recordIds = []
}
if (typeof global.medicalRecordIds === "undefined") {
	global.medicalRecordIds = []
}
if (typeof global.removedFiles === "undefined") {
	global.removedFiles = []
}

class RemoveFileFromRecordWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.removalReasons = [
			"file-corrupted",
			"duplicate-file",
			"incorrect-upload",
			"patient-request",
			"privacy-compliance",
			"data-quality-issue",
			"outdated-information",
			"legal-requirement",
			"security-concern",
			"administrative-error",
		]
		this.fileTypes = [
			"medical-report",
			"lab-results",
			"x-ray-scan",
			"mri-scan",
			"blood-test",
			"consultation-notes",
			"prescription",
			"discharge-summary",
			"surgical-report",
			"pathology-report",
			"ecg-report",
			"ultrasound-scan",
		]
	}

	/**
	 * Get a random record ID from existing records
	 */
	getRandomRecordWithFiles() {
		const allRecords = [...global.recordIds, ...global.medicalRecordIds]
		if (allRecords.length === 0) {
			// If no records exist, create a mock reference
			return `record_${this.workerIndex}_${Date.now()}`
		}
		const randomIndex = Math.floor(Math.random() * allRecords.length)
		return allRecords[randomIndex]
	}

	/**
	 * Generate realistic file reference to remove
	 */
	generateFileReference(recordId) {
		const fileType =
			this.fileTypes[Math.floor(Math.random() * this.fileTypes.length)]
		const timestamp = new Date().toISOString().split("T")[0]
		const extension =
			Math.random() > 0.7 ? "pdf" : Math.random() > 0.5 ? "jpg" : "png"

		// Simulate different file naming patterns
		const patterns = [
			`${fileType}-${recordId}-${timestamp}.${extension}`,
			`${recordId}_${fileType}_${Date.now()}.${extension}`,
			`file_${fileType}_${this.workerIndex}_${this.txIndex}.${extension}`,
			`${fileType}-report-${timestamp}-${Math.floor(
				Math.random() * 1000
			)}.${extension}`,
		]

		return patterns[Math.floor(Math.random() * patterns.length)]
	}

	/**
	 * Generate S3 object key for file removal
	 */
	generateS3ObjectKey(recordId, fileName) {
		const year = new Date().getFullYear()
		const month = String(new Date().getMonth() + 1).padStart(2, "0")
		return `medical-records/${year}/${month}/patient-${recordId}/${fileName}`
	}

	/**
	 * Generate removal metadata
	 */
	generateRemovalMetadata(recordId, fileName, removerId) {
		const reason =
			this.removalReasons[
				Math.floor(Math.random() * this.removalReasons.length)
			]
		const timestamp = new Date().toISOString()
		const removalId = `removal_${this.workerIndex}_${
			this.txIndex
		}_${Date.now()}`

		return {
			removalId,
			recordId,
			fileName,
			reason,
			removedBy: removerId,
			removalTimestamp: timestamp,
			backupLocation: `backup/${year}/${month}/${removalId}`,
			recoverable: Math.random() > 0.3, // 70% of removals are recoverable
		}
	}

	/**
	 * Validate authorization for file removal
	 */
	validateRemovalAuthorization(recordId, fileName, removerId) {
		// Validate remover ID format (doctor, patient, or admin)
		if (
			!removerId ||
			(!removerId.startsWith("doctor_") &&
				!removerId.startsWith("patient_") &&
				!removerId.startsWith("admin_"))
		) {
			throw new Error(`Invalid remover ID format: ${removerId}`)
		}

		// Validate record ID exists
		if (!recordId) {
			throw new Error("Record ID is required for file removal operation")
		}

		// Validate file name
		if (!fileName || fileName.trim().length === 0) {
			throw new Error("File name is required for removal operation")
		}

		// Check if file was already removed
		const fileKey = `${recordId}:${fileName}`
		if (global.removedFiles.includes(fileKey)) {
			console.warn(
				`File ${fileName} from record ${recordId} was already removed`
			)
		}

		// In a real scenario, we would verify file exists and user has permission
		// For benchmarking, we simulate authorization validation
		return true
	}

	/**
	 * Validate file removal business rules
	 */
	validateRemovalRules(recordId, fileName, metadata) {
		// Check if removal reason is valid
		if (!this.removalReasons.includes(metadata.reason)) {
			throw new Error(`Invalid removal reason: ${metadata.reason}`)
		}

		// Simulate business rule: certain file types require special authorization
		const criticalFileTypes = [
			"surgical-report",
			"pathology-report",
			"discharge-summary",
		]
		const isCriticalFile = criticalFileTypes.some((type) =>
			fileName.includes(type)
		)

		if (
			isCriticalFile &&
			!metadata.removedBy.startsWith("doctor_") &&
			!metadata.removedBy.startsWith("admin_")
		) {
			throw new Error(
				"Critical medical files can only be removed by doctors or administrators"
			)
		}

		// Validate backup requirements for recoverable files
		if (metadata.recoverable && !metadata.backupLocation) {
			throw new Error(
				"Recoverable file removal requires backup location specification"
			)
		}

		return true
	}

	/**
	 * Simulate file cleanup operations
	 */
	simulateFileCleanup(fileName, s3ObjectKey, metadata) {
		// Simulate file system operations
		const operations = []

		// Mark file for removal
		operations.push(`Marking file ${fileName} for removal from ${s3ObjectKey}`)

		// Create backup if recoverable
		if (metadata.recoverable) {
			operations.push(`Creating backup at ${metadata.backupLocation}`)
		}

		// Update file index
		operations.push(`Updating file index to remove reference to ${fileName}`)

		// Log removal operation
		operations.push(`Logging removal operation ${metadata.removalId}`)

		console.log(
			`File cleanup operations for ${fileName}: ${operations.join(", ")}`
		)
		return operations
	}

	async submitTransaction() {
		this.txIndex++
		const recordId = this.getRandomRecordWithFiles()
		const removerId =
			Math.random() > 0.4
				? `doctor_${this.workerIndex}_${this.txIndex}`
				: Math.random() > 0.5
				? `patient_${this.workerIndex}_${this.txIndex}`
				: `admin_${this.workerIndex}_${this.txIndex}`

		try {
			// Generate file reference and metadata
			const fileName = this.generateFileReference(recordId)
			const s3ObjectKey = this.generateS3ObjectKey(recordId, fileName)
			const metadata = this.generateRemovalMetadata(
				recordId,
				fileName,
				removerId
			)

			// Validate authorization for file removal
			this.validateRemovalAuthorization(recordId, fileName, removerId)

			// Validate removal business rules
			this.validateRemovalRules(recordId, fileName, metadata)

			// Simulate file cleanup operations
			this.simulateFileCleanup(fileName, s3ObjectKey, metadata)

			const myArgs = {
				contractId: "medicalconsent",
				contractFunction: "removeFileFromRecord",
				contractArguments: [recordId, fileName, JSON.stringify(metadata)],
				readOnly: false,
			}

			const results = await this.sutAdapter.sendRequests(myArgs)

			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					try {
						const response = result.GetResult().toString()

						// Track removed file
						const fileKey = `${recordId}:${fileName}`
						if (!global.removedFiles.includes(fileKey)) {
							global.removedFiles.push(fileKey)
						}

						console.log(
							`Successfully removed file ${fileName} from record ${recordId} by ${removerId} (${metadata.reason})`
						)

						// If response is JSON, try to parse it
						if (response.startsWith("{")) {
							const removalResult = JSON.parse(response)
							if (removalResult.status === "removed") {
								console.log(`File ${fileName} status updated to removed`)
							}
						}
					} catch (err) {
						// If parsing fails, it might be a simple success message
						console.log(
							`File removal completed for ${fileName}: ${result
								.GetResult()
								.toString()}`
						)

						// Still track as removed even if parsing fails
						const fileKey = `${recordId}:${fileName}`
						if (!global.removedFiles.includes(fileKey)) {
							global.removedFiles.push(fileKey)
						}
					}
				} else {
					const errorMsg = result.GetResult()
						? result.GetResult().toString()
						: "Unknown error"
					console.error(
						`File removal failed for ${fileName} from record ${recordId} by ${removerId}: ${errorMsg}`
					)
					throw new Error(`Transaction failed: ${errorMsg}`)
				}
			}
		} catch (error) {
			console.error(
				`Error in removeFileFromRecord for record ${recordId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new RemoveFileFromRecordWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
