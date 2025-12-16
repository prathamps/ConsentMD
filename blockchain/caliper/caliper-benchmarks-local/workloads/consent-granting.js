"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")
const ErrorHandler = require("../src/error-handler")
const CleanupVerifier = require("../src/cleanup-verifier")

/**
 * Workload module for benchmarking consent granting operations.
 * Creates test patients, doctors, and medical records, then grants consent between them.
 */
class ConsentGrantingWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.testPatients = []
		this.testDoctors = []
		this.testRecords = []
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

		console.log(
			`Worker ${workerIndex}: Initializing consent granting workload with ${this.patientCount} patients, ${this.doctorCount} doctors, ${this.recordsPerPatient} records per patient`
		)

		// Create test data
		await this.createTestData()
	}

	/**
	 * Create test patients, doctors, and medical records.
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

			console.log(
				`Worker ${this.workerIndex}: Created ${this.testPatients.length} patients, ${this.testDoctors.length} doctors, ${this.testRecords.length} records`
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
	 * Submit a consent granting transaction with error handling and retry logic.
	 */
	async submitTransaction() {
		try {
			// Select random patient and doctor
			const patient = this.getRandomPatient()
			const doctor = this.getRandomDoctor()

			// Select random record belonging to the patient
			const patientRecords = this.testRecords.filter(
				(record) => record.patientId === patient.patientId
			)
			if (patientRecords.length === 0) {
				throw new Error(`No records found for patient ${patient.patientId}`)
			}

			const record =
				patientRecords[Math.floor(Math.random() * patientRecords.length)]

			// Execute transaction with retry logic for network timeouts
			const executeTransaction = async () => {
				const request = {
					contractId: "medicalconsent",
					contractFunction: "grantConsent",
					contractArguments: [record.recordId, doctor.doctorId],
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
				"grantConsent",
				this.workerIndex
			)

			// Return standardized success response
			return ErrorHandler.createSuccessResponse(
				result,
				"grantConsent",
				latency,
				{
					patientId: patient.patientId,
					doctorId: doctor.doctorId,
					recordId: record.recordId,
				}
			)
		} catch (error) {
			// Handle error gracefully with categorization
			return ErrorHandler.handleTransactionError(
				error,
				"grantConsent",
				this.workerIndex
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
				this.testRecords.length

			// Clear local arrays
			this.testPatients = []
			this.testDoctors = []
			this.testRecords = []

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
}

/**
 * Create a new instance of the workload module.
 */
function createWorkloadModule() {
	return new ConsentGrantingWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
