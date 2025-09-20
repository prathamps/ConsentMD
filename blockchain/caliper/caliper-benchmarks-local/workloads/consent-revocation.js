"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")
const ErrorHandler = require("../src/error-handler")
const CleanupVerifier = require("../src/cleanup-verifier")

/**
 * Workload module for benchmarking consent revocation operations.
 * Revokes existing consent grants and verifies status changes from granted to revoked.
 */
class ConsentRevocationWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.testPatients = []
		this.testDoctors = []
		this.testRecords = []
		this.activeConsents = [] // Consents that can be revoked
		this.revokedConsents = [] // Track revoked consents for cleanup
		this.workerIndex = 0
		this.totalWorkers = 1
	}

	/**
	 * Initialize the workload module.
	 */
	async initializeWorkloadModule(
		workerIndex,
		totalWorkers,
		roundIndex,
		roundArguments,
		sutAdapter,
		sutContext
	) {
		await super.initializeWorkloadModule(
			workerIndex,
			totalWorkers,
			roundIndex,
			roundArguments,
			sutAdapter,
			sutContext
		)

		this.workerIndex = workerIndex
		this.totalWorkers = totalWorkers
		this.roundArguments = roundArguments || {}

		// Configuration from benchmark config
		this.patientCount = this.roundArguments.patientCount || 10
		this.doctorCount = this.roundArguments.doctorCount || 5
		this.recordsPerPatient = this.roundArguments.recordsPerPatient || 3
		this.consentRatio = this.roundArguments.consentRatio || 0.8 // 80% of records have consent

		console.log(
			`Worker ${workerIndex}: Initializing consent revocation workload with ${this.patientCount} patients, ${this.doctorCount} doctors, ${this.recordsPerPatient} records per patient`
		)

		// Create test data and establish consent grants that can be revoked
		await this.createTestDataWithConsents()
	}

	/**
	 * Create test patients, doctors, medical records, and consent grants.
	 */
	async createTestDataWithConsents() {
		try {
			// Create test patients
			for (let i = 0; i < this.patientCount; i++) {
				const patientId = this.generatePatientId(i)
				this.testPatients.push({
					patientId: patientId,
					email: patientId,
					role: "patient",
				})
			}

			// Create test doctors
			for (let i = 0; i < this.doctorCount; i++) {
				const doctorId = this.generateDoctorId(i)
				const doctorProfile = {
					doctorId: doctorId,
					email: doctorId,
					name: `Dr. Test ${this.workerIndex}_${i}`,
					specialization: "General Practice",
					role: "doctor",
				}

				// Register doctor profile on blockchain
				await this.registerDoctorProfile(doctorProfile)
				this.testDoctors.push(doctorProfile)
			}

			// Create medical records for each patient
			for (const patient of this.testPatients) {
				for (let i = 0; i < this.recordsPerPatient; i++) {
					const recordId = this.generateRecordId(patient.patientId, i)
					const record = {
						recordId: recordId,
						patientId: patient.patientId,
						details: `Benchmark test medical record ${i} for patient ${patient.patientId}`,
						fileName: `test_file_${this.workerIndex}_${i}.pdf`,
						s3ObjectKey: `test/${this.workerIndex}/${recordId}`,
						fileHash: this.generateTestHash(recordId),
					}

					// Create record on blockchain
					await this.createPatientRecord(patient, record)
					this.testRecords.push(record)
				}
			}

			// Create consent grants that can be revoked
			// Each record gets consent from multiple doctors to ensure we have enough to revoke
			for (const record of this.testRecords) {
				for (const doctor of this.testDoctors) {
					if (Math.random() < this.consentRatio) {
						// Grant consent
						await this.grantConsent(record, doctor)

						// Track this consent as available for revocation
						const consentId = this.generateConsentId(
							record.recordId,
							doctor.doctorId
						)
						this.activeConsents.push({
							consentId: consentId,
							recordId: record.recordId,
							doctorId: doctor.doctorId,
							patientId: record.patientId,
							status: "granted",
						})
					}
				}
			}

			console.log(
				`Worker ${this.workerIndex}: Created ${this.testPatients.length} patients, ${this.testDoctors.length} doctors, ${this.testRecords.length} records, ${this.activeConsents.length} active consents available for revocation`
			)
		} catch (error) {
			console.error(
				`Worker ${this.workerIndex}: Error creating test data with consents:`,
				error
			)
			throw error
		}
	}

	/**
	 * Submit a consent revocation transaction with error handling and retry logic.
	 */
	async submitTransaction() {
		try {
			// Check if we have any active consents to revoke
			if (this.activeConsents.length === 0) {
				console.warn(
					`Worker ${this.workerIndex}: No active consents available for revocation`
				)
				return {
					status: "skipped",
					reason: "no_active_consents",
					operationType: "revokeConsent",
					timestamp: new Date().toISOString(),
				}
			}

			// Select a random active consent to revoke
			const consentIndex = Math.floor(
				Math.random() * this.activeConsents.length
			)
			const consentToRevoke = this.activeConsents[consentIndex]

			// Remove from active consents to avoid duplicate revocations
			this.activeConsents.splice(consentIndex, 1)

			// Find the patient who owns this consent
			const patient = this.testPatients.find(
				(p) => p.patientId === consentToRevoke.patientId
			)
			if (!patient) {
				throw new Error(
					`Patient not found for consent ${consentToRevoke.consentId}`
				)
			}

			// Execute transaction with retry logic for network timeouts
			const executeTransaction = async () => {
				const request = {
					contractId: "medicalconsent",
					contractFunction: "revokeConsent",
					contractArguments: [consentToRevoke.consentId],
					invokerIdentity: patient.patientId,
					invokerMspId: "Org1MSP", // Patients are in Org1MSP based on network config
					readOnly: false,
				}

				const startTime = Date.now()
				const result = await this.sutAdapter.sendRequests(request)
				const endTime = Date.now()

				return {
					result: result,
					latency: endTime - startTime,
				}
			}

			// Execute with retry logic
			const { result, latency } = await ErrorHandler.executeWithRetry(
				executeTransaction,
				{
					maxRetries: 2,
					retryDelay: 1000,
					retryableCategories: ["NETWORK", "TIMEOUT"],
				},
				"revokeConsent",
				this.workerIndex
			)

			// If successful, verify the consent status change
			let statusVerified = false
			if (result.status === "success") {
				try {
					statusVerified = await this.verifyConsentRevocation(consentToRevoke)
				} catch (verifyError) {
					console.warn(
						`Worker ${this.workerIndex}: Could not verify consent status change: ${verifyError.message}`
					)
				}
			}

			// Track the revoked consent for cleanup
			if (result.status === "success") {
				consentToRevoke.status = "revoked"
				this.revokedConsents.push(consentToRevoke)
			} else {
				// If revocation failed, put the consent back in active list
				this.activeConsents.push(consentToRevoke)
			}

			// Return standardized success response
			return ErrorHandler.createSuccessResponse(
				result,
				"revokeConsent",
				latency,
				{
					consentId: consentToRevoke.consentId,
					patientId: consentToRevoke.patientId,
					doctorId: consentToRevoke.doctorId,
					recordId: consentToRevoke.recordId,
					statusVerified: statusVerified,
					remainingActiveConsents: this.activeConsents.length,
				}
			)
		} catch (error) {
			// Handle error gracefully with categorization
			return ErrorHandler.handleTransactionError(
				error,
				"revokeConsent",
				this.workerIndex,
				{
					remainingActiveConsents: this.activeConsents.length,
				}
			)
		}
	}

	/**
	 * Verify that a consent has been successfully revoked by querying its status.
	 */
	async verifyConsentRevocation(consent) {
		try {
			// Query the consent status to verify it's been revoked
			const request = {
				contractId: "medicalconsent",
				contractFunction: "getConsentStatus",
				contractArguments: [consent.consentId],
				invokerIdentity: consent.patientId,
				invokerMspId: "Org1MSP",
				readOnly: true,
			}

			const result = await this.sutAdapter.sendRequests(request)

			if (result.status === "success" && result.result) {
				// Parse the result to check if status is "revoked"
				const consentData = JSON.parse(result.result)
				return consentData.status === "revoked"
			}

			return false
		} catch (error) {
			console.warn(
				`Worker ${this.workerIndex}: Error verifying consent revocation for ${consent.consentId}: ${error.message}`
			)
			return false
		}
	}

	/**
	 * Clean up test data after benchmark completion with verification.
	 */
	async cleanupWorkloadModule() {
		console.log(`Worker ${this.workerIndex}: Starting cleanup of test data`)

		try {
			// Collect test data IDs for verification
			const testDataIds = {
				recordIds: this.testRecords.map((record) => record.recordId),
				doctorIds: this.testDoctors.map((doctor) => doctor.doctorId),
				consentIds: [
					...this.activeConsents.map((consent) => consent.consentId),
					...this.revokedConsents.map((consent) => consent.consentId),
				],
			}

			// Sample identities for cleanup verification
			const sampleIdentities = {
				patient:
					this.testPatients.length > 0 ? this.testPatients[0].patientId : null,
				doctor:
					this.testDoctors.length > 0 ? this.testDoctors[0].doctorId : null,
			}

			const totalTestData =
				this.testPatients.length +
				this.testDoctors.length +
				this.testRecords.length +
				this.activeConsents.length +
				this.revokedConsents.length

			console.log(
				`Worker ${this.workerIndex}: Cleaning up ${this.activeConsents.length} active consents and ${this.revokedConsents.length} revoked consents`
			)

			// Clear local arrays
			this.testPatients = []
			this.testDoctors = []
			this.testRecords = []
			this.activeConsents = []
			this.revokedConsents = []

			console.log(
				`Worker ${this.workerIndex}: Cleared ${totalTestData} local test data items`
			)

			// Verify cleanup if we have identities and test data
			if (
				sampleIdentities.patient &&
				sampleIdentities.doctor &&
				totalTestData > 0
			) {
				console.log(
					`Worker ${this.workerIndex}: Verifying test data cleanup...`
				)

				// Wait a moment for any pending operations to complete
				await CleanupVerifier.waitForCleanup(1500, this.workerIndex)

				// Perform cleanup verification
				const verificationResults =
					await CleanupVerifier.verifyComprehensiveCleanup(
						this.sutAdapter,
						testDataIds,
						sampleIdentities,
						this.workerIndex
					)

				// Generate and log cleanup report
				const report = CleanupVerifier.generateCleanupReport(
					verificationResults,
					this.workerIndex
				)
				console.log(report)

				// Log warning if cleanup was not complete
				if (!verificationResults.overall.success) {
					console.warn(
						`Worker ${this.workerIndex}: Cleanup verification failed - some test data may remain on the blockchain`
					)
				}
			} else {
				console.log(
					`Worker ${this.workerIndex}: Skipping cleanup verification - no test data or identities available`
				)
			}
		} catch (error) {
			const errorInfo = ErrorHandler.categorizeError(error, "cleanup")
			console.error(
				`Worker ${this.workerIndex}: Error during cleanup (${errorInfo.category}): ${error.message}`
			)
		}

		await super.cleanupWorkloadModule()
	}

	// Utility methods

	/**
	 * Generate a unique patient ID for this worker.
	 */
	generatePatientId(patientIndex) {
		return `patient_${this.workerIndex}_${patientIndex}@org1.example.com`
	}

	/**
	 * Generate a unique doctor ID for this worker.
	 */
	generateDoctorId(doctorIndex) {
		// Use existing Org2MSP identities instead of creating new ones
		const availableIdentities = ["_Org2MSP_User1", "_Org2MSP_Admin"]
		return availableIdentities[doctorIndex % availableIdentities.length]
	}

	/**
	 * Generate a unique record ID.
	 */
	generateRecordId(patientId, recordIndex) {
		return `record_${this.workerIndex}_${patientId}_${recordIndex}`
	}

	/**
	 * Generate a unique consent ID.
	 */
	generateConsentId(recordId, doctorId) {
		return `consent_${this.workerIndex}_${recordId}_${doctorId}`
	}

	/**
	 * Generate a test file hash.
	 */
	generateTestHash(recordId) {
		// Simple hash generation for testing
		return `hash_${recordId}_${Date.now()}`
	}

	/**
	 * Get a random patient from test data.
	 */
	getRandomPatient() {
		if (this.testPatients.length === 0) {
			throw new Error("No test patients available")
		}
		return this.testPatients[
			Math.floor(Math.random() * this.testPatients.length)
		]
	}

	/**
	 * Get a random doctor from test data.
	 */
	getRandomDoctor() {
		if (this.testDoctors.length === 0) {
			throw new Error("No test doctors available")
		}
		return this.testDoctors[Math.floor(Math.random() * this.testDoctors.length)]
	}

	/**
	 * Register a doctor profile on the blockchain.
	 */
	async registerDoctorProfile(doctor) {
		try {
			const request = {
				contractId: "medicalconsent",
				contractFunction: "registerDoctorProfile",
				contractArguments: [doctor.name, doctor.specialization],
				invokerIdentity: doctor.doctorId,
				invokerMspId: "Org2MSP", // Doctors are in Org2MSP
				readOnly: false,
			}

			await this.sutAdapter.sendRequests(request)
			console.log(
				`Worker ${this.workerIndex}: Registered doctor profile for ${doctor.doctorId}`
			)
		} catch (error) {
			console.error(
				`Worker ${this.workerIndex}: Error registering doctor profile for ${doctor.doctorId}:`,
				error
			)
			throw error
		}
	}

	/**
	 * Create a patient record on the blockchain.
	 */
	async createPatientRecord(patient, record) {
		try {
			const request = {
				contractId: "medicalconsent",
				contractFunction: "createPatientRecord",
				contractArguments: [
					record.fileName,
					record.s3ObjectKey,
					record.fileHash,
					record.details,
				],
				invokerIdentity: patient.patientId,
				invokerMspId: "Org1MSP", // Patients are in Org1MSP
				readOnly: false,
			}

			await this.sutAdapter.sendRequests(request)
			console.log(
				`Worker ${this.workerIndex}: Created record ${record.recordId} for patient ${patient.patientId}`
			)
		} catch (error) {
			console.error(
				`Worker ${this.workerIndex}: Error creating record ${record.recordId}:`,
				error
			)
			throw error
		}
	}

	/**
	 * Grant consent for a doctor to access a patient record.
	 */
	async grantConsent(record, doctor) {
		try {
			const patient = this.testPatients.find(
				(p) => p.patientId === record.patientId
			)
			if (!patient) {
				throw new Error(`Patient not found for record ${record.recordId}`)
			}

			const request = {
				contractId: "medicalconsent",
				contractFunction: "grantConsent",
				contractArguments: [record.recordId, doctor.doctorId],
				invokerIdentity: patient.patientId,
				invokerMspId: "Org1MSP", // Patients are in Org1MSP
				readOnly: false,
			}

			await this.sutAdapter.sendRequests(request)
			console.log(
				`Worker ${this.workerIndex}: Granted consent for doctor ${doctor.doctorId} to access record ${record.recordId}`
			)
		} catch (error) {
			console.error(
				`Worker ${this.workerIndex}: Error granting consent for record ${record.recordId} to doctor ${doctor.doctorId}:`,
				error
			)
			throw error
		}
	}
}

/**
 * Create a new instance of the workload module.
 */
function createWorkloadModule() {
	return new ConsentRevocationWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
