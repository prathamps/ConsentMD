"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")
const ErrorHandler = require("../src/error-handler")
const CleanupVerifier = require("../src/cleanup-verifier")

/**
 * Workload module for benchmarking record access operations.
 * Tests both authorized and unauthorized access scenarios for medical records.
 */
class RecordAccessWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.testPatients = []
		this.testDoctors = []
		this.testRecords = []
		this.consentGrants = []
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
		this.unauthorizedAccessRatio =
			this.roundArguments.unauthorizedAccessRatio || 0.2 // 20% unauthorized attempts

		console.log(
			`Worker ${workerIndex}: Initializing record access workload with ${this.patientCount} patients, ${this.doctorCount} doctors, ${this.recordsPerPatient} records per patient`
		)

		// Create test data and consent relationships
		await this.createTestData()
	}

	/**
	 * Create test patients, doctors, medical records, and consent grants.
	 */
	async createTestData() {
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

			// Create consent grants for authorized access scenarios
			// Grant consent for approximately 70% of doctor-record combinations
			for (const record of this.testRecords) {
				for (const doctor of this.testDoctors) {
					if (Math.random() < 0.7) {
						// 70% chance of consent
						await this.grantConsent(record, doctor)
						this.consentGrants.push({
							recordId: record.recordId,
							doctorId: doctor.doctorId,
							patientId: record.patientId,
						})
					}
				}
			}

			console.log(
				`Worker ${this.workerIndex}: Created ${this.testPatients.length} patients, ${this.testDoctors.length} doctors, ${this.testRecords.length} records, ${this.consentGrants.length} consent grants`
			)
		} catch (error) {
			console.error(
				`Worker ${this.workerIndex}: Error creating test data:`,
				error
			)
			throw error
		}
	}

	/**
	 * Submit a record access transaction (both authorized and unauthorized) with error handling and retry logic.
	 */
	async submitTransaction() {
		try {
			const isUnauthorizedAttempt = Math.random() < this.unauthorizedAccessRatio
			let doctor, record, isAuthorized

			if (isUnauthorizedAttempt) {
				// Select a random doctor and record combination that doesn't have consent
				doctor = this.getRandomDoctor()
				record = this.getRandomRecord()

				// Check if this combination has consent
				isAuthorized = this.consentGrants.some(
					(grant) =>
						grant.doctorId === doctor.doctorId &&
						grant.recordId === record.recordId
				)

				// If it's authorized, try to find an unauthorized combination
				if (isAuthorized) {
					const unauthorizedCombination = this.findUnauthorizedCombination()
					if (unauthorizedCombination) {
						doctor = unauthorizedCombination.doctor
						record = unauthorizedCombination.record
						isAuthorized = false
					}
				}
			} else {
				// Select an authorized doctor-record combination
				const authorizedCombination = this.getRandomAuthorizedCombination()
				if (authorizedCombination) {
					doctor = this.testDoctors.find(
						(d) => d.doctorId === authorizedCombination.doctorId
					)
					record = this.testRecords.find(
						(r) => r.recordId === authorizedCombination.recordId
					)
					isAuthorized = true
				} else {
					// Fallback to random selection if no authorized combinations available
					doctor = this.getRandomDoctor()
					record = this.getRandomRecord()
					isAuthorized = this.consentGrants.some(
						(grant) =>
							grant.doctorId === doctor.doctorId &&
							grant.recordId === record.recordId
					)
				}
			}

			// Execute transaction with retry logic for network timeouts
			const executeTransaction = async () => {
				const request = {
					contractId: "medicalconsent",
					contractFunction: "getRecordById",
					contractArguments: [record.recordId],
					invokerIdentity: doctor.doctorId,
					invokerMspId: "Org2MSP", // Doctors are in Org2MSP based on network config
					readOnly: true,
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
					retryDelay: 500, // Shorter delay for read operations
					retryableCategories: ["NETWORK", "TIMEOUT"],
				},
				"recordAccess",
				this.workerIndex
			)

			// Determine if the result matches expected authorization
			const accessGranted = result.status === "success"
			const expectedResult = isAuthorized
			const correctResult = accessGranted === expectedResult

			// Return standardized success response
			return ErrorHandler.createSuccessResponse(
				result,
				"recordAccess",
				latency,
				{
					doctorId: doctor.doctorId,
					recordId: record.recordId,
					patientId: record.patientId,
					isAuthorized: isAuthorized,
					accessGranted: accessGranted,
					correctResult: correctResult,
					attemptType: isUnauthorizedAttempt ? "unauthorized" : "authorized",
				}
			)
		} catch (error) {
			// Handle error gracefully with categorization
			return ErrorHandler.handleTransactionError(
				error,
				"recordAccess",
				this.workerIndex,
				{
					attemptType: "error",
				}
			)
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
				this.consentGrants.length

			// Clear local arrays
			this.testPatients = []
			this.testDoctors = []
			this.testRecords = []
			this.consentGrants = []

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
		return `doctor_${this.workerIndex}_${doctorIndex}@org2.example.com`
	}

	/**
	 * Generate a unique record ID.
	 */
	generateRecordId(patientId, recordIndex) {
		return `record_${this.workerIndex}_${patientId}_${recordIndex}`
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
	 * Get a random record from test data.
	 */
	getRandomRecord() {
		if (this.testRecords.length === 0) {
			throw new Error("No test records available")
		}
		return this.testRecords[Math.floor(Math.random() * this.testRecords.length)]
	}

	/**
	 * Get a random authorized doctor-record combination.
	 */
	getRandomAuthorizedCombination() {
		if (this.consentGrants.length === 0) {
			return null
		}
		return this.consentGrants[
			Math.floor(Math.random() * this.consentGrants.length)
		]
	}

	/**
	 * Find an unauthorized doctor-record combination.
	 */
	findUnauthorizedCombination() {
		// Try to find a combination that doesn't have consent
		for (let attempts = 0; attempts < 10; attempts++) {
			const doctor = this.getRandomDoctor()
			const record = this.getRandomRecord()

			const hasConsent = this.consentGrants.some(
				(grant) =>
					grant.doctorId === doctor.doctorId &&
					grant.recordId === record.recordId
			)

			if (!hasConsent) {
				return { doctor, record }
			}
		}

		// If we can't find an unauthorized combination, return null
		return null
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
	return new RecordAccessWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
