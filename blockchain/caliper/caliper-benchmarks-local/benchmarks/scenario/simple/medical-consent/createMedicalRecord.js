"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")
const crypto = require("crypto")

// Global arrays to track created records and medical records
if (typeof global.recordIds === "undefined") {
	global.recordIds = []
}
if (typeof global.medicalRecordIds === "undefined") {
	global.medicalRecordIds = []
}

class CreateMedicalRecordWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.medicalRecordTypes = [
			"diagnosis",
			"treatment-plan",
			"medication-prescription",
			"lab-order",
			"referral",
			"progress-note",
			"discharge-plan",
			"surgical-plan",
			"therapy-recommendation",
			"follow-up-instruction",
		]
		this.medicalSpecialties = [
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
		]
		this.treatmentTypes = [
			"medication",
			"physical-therapy",
			"surgery",
			"counseling",
			"monitoring",
			"lifestyle-changes",
			"diagnostic-testing",
			"specialist-referral",
		]
	}

	/**
	 * Get a random patient record ID from existing records
	 */
	getRandomPatientRecordId() {
		if (global.recordIds.length === 0) {
			// If no patient records exist, create a mock reference
			return `patient_record_${this.workerIndex}_${Date.now()}`
		}
		const randomIndex = Math.floor(Math.random() * global.recordIds.length)
		return global.recordIds[randomIndex]
	}

	/**
	 * Generate realistic medical record file name
	 */
	generateMedicalRecordFileName(doctorId, recordType) {
		const timestamp = new Date().toISOString().split("T")[0]
		return `${recordType}-${doctorId}-${timestamp}-${Math.floor(
			Math.random() * 1000
		)}.pdf`
	}

	/**
	 * Generate S3 object key for medical records
	 */
	generateS3ObjectKey(patientRecordId, fileName) {
		const year = new Date().getFullYear()
		const month = String(new Date().getMonth() + 1).padStart(2, "0")
		return `medical-records/${year}/${month}/patient-${patientRecordId}/doctor-records/${fileName}`
	}

	/**
	 * Generate file hash for medical record
	 */
	generateFileHash(fileName, doctorId, patientRecordId) {
		const content = `${fileName}-${doctorId}-${patientRecordId}-${Date.now()}-${Math.random()}`
		return crypto.createHash("sha256").update(content).digest("hex")
	}

	/**
	 * Generate comprehensive medical record details
	 */
	generateMedicalRecordDetails(doctorId, patientRecordId, recordType) {
		const specialty =
			this.medicalSpecialties[
				Math.floor(Math.random() * this.medicalSpecialties.length)
			]
		const treatment =
			this.treatmentTypes[
				Math.floor(Math.random() * this.treatmentTypes.length)
			]

		const detailTemplates = [
			`Dr. ${doctorId} (${specialty}) created ${recordType} for patient record ${patientRecordId}. Recommended ${treatment} based on clinical assessment.`,
			`Medical ${recordType} documented by Dr. ${doctorId} following ${specialty} consultation. Patient record ${patientRecordId} updated with ${treatment} plan.`,
			`${specialty} specialist Dr. ${doctorId} has documented ${recordType} for patient record ${patientRecordId}. Treatment approach: ${treatment}.`,
			`Clinical ${recordType} by Dr. ${doctorId} indicates need for ${treatment}. Patient record ${patientRecordId} shows positive response to intervention.`,
		]

		return detailTemplates[Math.floor(Math.random() * detailTemplates.length)]
	}

	/**
	 * Validate doctor role and patient record reference
	 */
	async validateDoctorAndPatientRecord(doctorId, patientRecordId) {
		// Validate doctor ID format
		if (!doctorId || !doctorId.startsWith("doctor_")) {
			throw new Error(`Invalid doctor ID format: ${doctorId}`)
		}

		// Validate patient record reference exists
		if (!patientRecordId) {
			throw new Error(
				"Patient record ID is required for medical record creation"
			)
		}

		// In a real scenario, we would query the blockchain to verify the patient record exists
		// For benchmarking, we simulate this validation
		return true
	}

	async submitTransaction() {
		this.txIndex++
		const doctorId = `doctor_${this.workerIndex}_${this.txIndex}`
		const patientRecordId = this.getRandomPatientRecordId()

		try {
			// Validate doctor role and patient record reference
			await this.validateDoctorAndPatientRecord(doctorId, patientRecordId)

			// Generate realistic medical record data
			const recordType =
				this.medicalRecordTypes[
					Math.floor(Math.random() * this.medicalRecordTypes.length)
				]
			const fileName = this.generateMedicalRecordFileName(doctorId, recordType)
			const s3ObjectKey = this.generateS3ObjectKey(patientRecordId, fileName)
			const fileHash = this.generateFileHash(
				fileName,
				doctorId,
				patientRecordId
			)
			const details = this.generateMedicalRecordDetails(
				doctorId,
				patientRecordId,
				recordType
			)

			const myArgs = {
				contractId: "medicalconsent",
				contractFunction: "createMedicalRecord",
				contractArguments: [
					patientRecordId,
					fileName,
					s3ObjectKey,
					fileHash,
					details,
				],
				readOnly: false,
			}

			const results = await this.sutAdapter.sendRequests(myArgs)

			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					try {
						const record = JSON.parse(result.GetResult().toString())
						if (record && record.recordId) {
							global.medicalRecordIds.push(record.recordId)
							console.log(
								`Successfully created medical record: ${record.recordId} for patient record: ${patientRecordId}`
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
						`Transaction failed for doctor ${doctorId}, patient record ${patientRecordId}: ${errorMsg}`
					)
					throw new Error(`Transaction failed: ${errorMsg}`)
				}
			}
		} catch (error) {
			console.error(
				`Error in createMedicalRecord for doctor ${doctorId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new CreateMedicalRecordWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
