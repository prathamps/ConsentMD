"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")
const crypto = require("crypto")

// A simple array to store created record IDs. This will be shared between rounds
// because we are using a single local worker.
if (typeof global.recordIds === "undefined") {
	global.recordIds = []
}

class CreatePatientRecordWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.medicalFileTypes = [
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
		this.medicalConditions = [
			"hypertension",
			"diabetes",
			"asthma",
			"arthritis",
			"migraine",
			"allergic-reaction",
			"chest-pain",
			"back-pain",
			"anxiety",
			"depression",
			"pneumonia",
			"bronchitis",
			"gastritis",
			"dermatitis",
			"sinusitis",
		]
	}

	/**
	 * Generate realistic medical file name with timestamp
	 */
	generateMedicalFileName(patientId) {
		const fileType =
			this.medicalFileTypes[
				Math.floor(Math.random() * this.medicalFileTypes.length)
			]
		const timestamp = new Date().toISOString().split("T")[0] // YYYY-MM-DD format
		const extension =
			Math.random() > 0.7 ? "pdf" : Math.random() > 0.5 ? "jpg" : "png"
		return `${fileType}-${patientId}-${timestamp}.${extension}`
	}

	/**
	 * Generate realistic S3 object key with proper structure
	 */
	generateS3ObjectKey(patientId, fileName) {
		const year = new Date().getFullYear()
		const month = String(new Date().getMonth() + 1).padStart(2, "0")
		return `medical-records/${year}/${month}/patient-${patientId}/${fileName}`
	}

	/**
	 * Generate SHA256 hash for file content simulation
	 */
	generateFileHash(fileName, patientId) {
		const content = `${fileName}-${patientId}-${Date.now()}-${Math.random()}`
		return crypto.createHash("sha256").update(content).digest("hex")
	}

	/**
	 * Generate realistic medical details
	 */
	generateMedicalDetails(patientId) {
		const condition =
			this.medicalConditions[
				Math.floor(Math.random() * this.medicalConditions.length)
			]
		const scenarios = [
			`Patient ${patientId} presented with symptoms of ${condition}. Initial assessment completed.`,
			`Follow-up consultation for ${patientId} regarding ${condition} treatment progress.`,
			`Diagnostic results for ${patientId} showing indicators related to ${condition}.`,
			`Treatment plan updated for ${patientId} based on ${condition} progression.`,
			`Emergency consultation for ${patientId} with acute ${condition} symptoms.`,
		]
		return scenarios[Math.floor(Math.random() * scenarios.length)]
	}

	/**
	 * Validate patient role context (simulation)
	 */
	validatePatientRole(patientId) {
		// In a real scenario, this would verify the caller's identity
		// For benchmarking, we simulate role validation
		if (!patientId || !patientId.startsWith("patient_")) {
			throw new Error(`Invalid patient ID format: ${patientId}`)
		}
		return true
	}

	async submitTransaction() {
		this.txIndex++
		const patientId = `patient_${this.workerIndex}_${this.txIndex}`

		try {
			// Validate patient role
			this.validatePatientRole(patientId)

			// Generate realistic medical data
			const fileName = this.generateMedicalFileName(patientId)
			const s3ObjectKey = this.generateS3ObjectKey(patientId, fileName)
			const fileHash = this.generateFileHash(fileName, patientId)
			const details = this.generateMedicalDetails(patientId)

			const myArgs = {
				contractId: "medicalconsent",
				contractFunction: "createPatientRecord",
				contractArguments: [fileName, s3ObjectKey, fileHash, details],
				readOnly: false,
			}

			const results = await this.sutAdapter.sendRequests(myArgs)

			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					try {
						const record = JSON.parse(result.GetResult().toString())
						if (record && record.recordId) {
							global.recordIds.push(record.recordId)
							console.log(
								`Successfully created patient record: ${record.recordId}`
							)
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
						`Transaction failed for patient ${patientId}: ${errorMsg}`
					)
					throw new Error(`Transaction failed: ${errorMsg}`)
				}
			}
		} catch (error) {
			console.error(
				`Error in createPatientRecord for ${patientId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new CreatePatientRecordWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
