"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")
const ErrorHandler = require("../src/error-handler")
const CleanupVerifier = require("../src/cleanup-verifier")

/**
 * Workload module for benchmarking mixed consent management operations.
 * Combines consent granting, record access, and revocation in a single workload
 * using simple random selection between operation types.
 */
class MixedWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.testPatients = []
		this.testDoctors = []
		this.testRecords = []
		this.activeConsents = [] // Consents that can be revoked
		this.revokedConsents = [] // Track revoked consents
		this.workerIndex = 0
		this.totalWorkers = 1

		// Operation type distribution (can be configured via roundArguments)
		this.operationWeights = {
			grantConsent: 0.4, // 40% consent granting
			recordAccess: 0.4, // 40% record access
			revokeConsent: 0.2, // 20% consent revocation
		}

		// Performance metrics tracking per operation type
		this.operationMetrics = {
			grantConsent: { count: 0, totalLatency: 0, errors: 0 },
			recordAccess: { count: 0, totalLatency: 0, errors: 0 },
			revokeConsent: { count: 0, totalLatency: 0, errors: 0 },
		}
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

		// Override operation weights if provided in configuration
		if (this.roundArguments.operationWeights) {
			this.operationWeights = {
				...this.operationWeights,
				...this.roundArguments.operationWeights,
			}
		}

		console.log(
			`Worker ${workerIndex}: Initializing mixed workload with ${this.patientCount} patients, ${this.doctorCount} doctors, ${this.recordsPerPatient} records per patient`
		)
		console.log(
			`Worker ${workerIndex}: Operation weights - Grant: ${this.operationWeights.grantConsent}, Access: ${this.operationWeights.recordAccess}, Revoke: ${this.operationWeights.revokeConsent}`
		)

		// Create test data and establish some initial consent grants
		await this.createTestData()
	}

	/**
	 * Create test patients, doctors, medical records, and some initial consent grants.
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

			// Create some initial consent grants to enable record access and revocation operations
			// Grant consent for approximately 50% of doctor-record combinations
			for (const record of this.testRecords) {
				for (const doctor of this.testDoctors) {
					if (Math.random() < 0.5) {
						// 50% chance of initial consent
						await this.grantConsent(record, doctor)

						// Track this consent as available for revocation and access
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
				`Worker ${this.workerIndex}: Created ${this.testPatients.length} patients, ${this.testDoctors.length} doctors, ${this.testRecords.length} records, ${this.activeConsents.length} initial consent grants`
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
	 * Submit a mixed workload transaction by randomly selecting operation type.
	 */
	async submitTransaction() {
		try {
			// Select operation type based on weights
			const operationType = this.selectOperationType()

			// Execute the selected operation
			let result
			switch (operationType) {
				case "grantConsent":
					result = await this.executeConsentGranting()
					break
				case "recordAccess":
					result = await this.executeRecordAccess()
					break
				case "revokeConsent":
					result = await this.executeConsentRevocation()
					break
				default:
					throw new Error(`Unknown operation type: ${operationType}`)
			}

			// Update operation metrics
			this.updateOperationMetrics(operationType, result)

			return result
		} catch (error) {
			console.error(
				`Worker ${this.workerIndex}: Error in submitTransaction:`,
				error
			)
			return {
				status: "failed",
				error: error.message,
				operationType: "mixed",
			}
		}
	}

	/**
	 * Select operation type based on configured weights.
	 */
	selectOperationType() {
		const random = Math.random()
		let cumulativeWeight = 0

		for (const [operationType, weight] of Object.entries(
			this.operationWeights
		)) {
			cumulativeWeight += weight
			if (random <= cumulativeWeight) {
				return operationType
			}
		}

		// Fallback to consent granting if weights don't sum to 1
		return "grantConsent"
	}

	/**
	 * Execute a consent granting operation with error handling and retry logic.
	 */
	async executeConsentGranting() {
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

			// Check if consent already exists to avoid duplicates
			const existingConsent = this.activeConsents.find(
				(consent) =>
					consent.recordId === record.recordId &&
					consent.doctorId === doctor.doctorId
			)

			if (existingConsent) {
				// Skip if consent already exists
				return {
					status: "skipped",
					reason: "consent_already_exists",
					operationType: "grantConsent",
					patientId: patient.patientId,
					doctorId: doctor.doctorId,
					recordId: record.recordId,
					latency: 0,
					timestamp: new Date().toISOString(),
				}
			}

			// Execute transaction with retry logic for network timeouts
			const executeTransaction = async () => {
				const request = {
					contractId: "medicalconsent",
					contractFunction: "grantConsent",
					contractArguments: [record.recordId, doctor.doctorId],
					invokerIdentity: patient.patientId,
					invokerMspId: "Org1MSP",
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

			// If successful, track the new consent
			if (result.status === "success") {
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
			return ErrorHandler.handleTransactionError(
				error,
				"grantConsent",
				this.workerIndex,
				{
					latency: 0,
				}
			)
		}
	}

	/**
	 * Execute a record access operation with error handling and retry logic.
	 */
	async executeRecordAccess() {
		try {
			let doctor, record, isAuthorized

			// 80% of the time, try to access an authorized record
			if (Math.random() < 0.8 && this.activeConsents.length > 0) {
				// Select from existing consents for authorized access
				const consent =
					this.activeConsents[
						Math.floor(Math.random() * this.activeConsents.length)
					]
				doctor = this.testDoctors.find((d) => d.doctorId === consent.doctorId)
				record = this.testRecords.find((r) => r.recordId === consent.recordId)
				isAuthorized = true
			} else {
				// Random access (may be unauthorized)
				doctor = this.getRandomDoctor()
				record = this.getRandomRecord()
				isAuthorized = this.activeConsents.some(
					(consent) =>
						consent.doctorId === doctor.doctorId &&
						consent.recordId === record.recordId
				)
			}

			// Execute transaction with retry logic for network timeouts
			const executeTransaction = async () => {
				const request = {
					contractId: "medicalconsent",
					contractFunction: "getRecordById",
					contractArguments: [record.recordId],
					invokerIdentity: doctor.doctorId,
					invokerMspId: "Org2MSP",
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
			const correctResult = accessGranted === isAuthorized

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
				}
			)
		} catch (error) {
			return ErrorHandler.handleTransactionError(
				error,
				"recordAccess",
				this.workerIndex,
				{
					latency: 0,
				}
			)
		}
	}

	/**
	 * Execute a consent revocation operation with error handling and retry logic.
	 */
	async executeConsentRevocation() {
		try {
			// Check if we have any active consents to revoke
			if (this.activeConsents.length === 0) {
				return {
					status: "skipped",
					reason: "no_active_consents",
					operationType: "revokeConsent",
					latency: 0,
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
					invokerMspId: "Org1MSP",
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

			// Track the revoked consent for cleanup
			if (result.status === "success") {
				consentToRevoke.status = "revoked"
				this.revokedConsents.push(consentToRevoke)
			} else {
				// If revocation failed, put the consent back in active list
				this.activeConsents.push(consentToRevoke)
			}

			return ErrorHandler.createSuccessResponse(
				result,
				"revokeConsent",
				latency,
				{
					consentId: consentToRevoke.consentId,
					patientId: consentToRevoke.patientId,
					doctorId: consentToRevoke.doctorId,
					recordId: consentToRevoke.recordId,
					remainingActiveConsents: this.activeConsents.length,
				}
			)
		} catch (error) {
			return ErrorHandler.handleTransactionError(
				error,
				"revokeConsent",
				this.workerIndex,
				{
					latency: 0,
				}
			)
		}
	}

	/**
	 * Update performance metrics for each operation type.
	 */
	updateOperationMetrics(operationType, result) {
		if (!this.operationMetrics[operationType]) {
			this.operationMetrics[operationType] = {
				count: 0,
				totalLatency: 0,
				errors: 0,
			}
		}

		const metrics = this.operationMetrics[operationType]
		metrics.count++

		if (result.status === "success") {
			metrics.totalLatency += result.latency || 0
		} else if (result.status === "failed") {
			metrics.errors++
		}
		// Skip operations don't count as errors or add to latency
	}

	/**
	 * Clean up test data after benchmark completion with verification.
	 */
	async cleanupWorkloadModule() {
		console.log(`Worker ${this.workerIndex}: Starting cleanup of test data`)

		try {
			// Log final operation metrics
			console.log(
				`Worker ${this.workerIndex}: Final operation metrics:`,
				JSON.stringify(this.operationMetrics, null, 2)
			)

			// Calculate and log average latencies with error handling metrics
			for (const [operationType, metrics] of Object.entries(
				this.operationMetrics
			)) {
				const avgLatency =
					metrics.count > 0 ? metrics.totalLatency / metrics.count : 0
				const errorRate =
					metrics.count > 0 ? (metrics.errors / metrics.count) * 100 : 0

				ErrorHandler.logPerformanceMetrics(this.workerIndex, operationType, {
					count: metrics.count,
					avgLatency: parseFloat(avgLatency.toFixed(2)),
					errorRate: parseFloat(errorRate.toFixed(2)),
					totalLatency: metrics.totalLatency,
					errors: metrics.errors,
				})
			}

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

			// Clear all test data
			this.testPatients = []
			this.testDoctors = []
			this.testRecords = []
			this.activeConsents = []
			this.revokedConsents = []

			// Reset metrics
			this.operationMetrics = {
				grantConsent: { count: 0, totalLatency: 0, errors: 0 },
				recordAccess: { count: 0, totalLatency: 0, errors: 0 },
				revokeConsent: { count: 0, totalLatency: 0, errors: 0 },
			}

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
				await CleanupVerifier.waitForCleanup(2000, this.workerIndex) // Longer wait for mixed workload

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

	// Utility methods (shared with other workload modules)

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
	 * Get a random record from test data.
	 */
	getRandomRecord() {
		if (this.testRecords.length === 0) {
			throw new Error("No test records available")
		}
		return this.testRecords[Math.floor(Math.random() * this.testRecords.length)]
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
				invokerMspId: "Org2MSP",
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
				invokerMspId: "Org1MSP",
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
				invokerMspId: "Org1MSP",
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
	return new MixedWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
