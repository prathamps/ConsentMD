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

		// Configuration from benchmark config (support legacy keys too)
		this.patientCount =
			this.roundArguments.patientCount ||
			this.roundArguments.patientsPerWorker ||
			10
		this.doctorCount =
			this.roundArguments.doctorCount ||
			this.roundArguments.doctorsPerWorker ||
			5
		this.recordsPerPatient =
			this.roundArguments.recordsPerPatient ||
			this.roundArguments.recordsPerWorker ||
			3

		console.log(
			`Worker ${workerIndex}: Initializing consent granting workload with ${this.patientCount} patients, ${this.doctorCount} doctors, ${this.recordsPerPatient} records per patient`
		)

		// Only seed test data once (or when explicitly running initialization mode)
		const currentMode =
			(this.roundArguments.mode || "initialization").toString().toLowerCase()
		const shouldSeedData =
			currentMode === "initialization" ||
			this.testPatients.length === 0 ||
			this.testDoctors.length === 0 ||
			this.testRecords.length === 0

		if (shouldSeedData) {
			// Reset local caches before (re)building dataset to avoid duplication
			this.testPatients = []
			this.testDoctors = []
			this.testRecords = []

			await this.createTestData(currentMode)
		}
	}

	/**
	 * Create test patients, doctors, and medical records.
	 */
	async createTestData(seedMode = "initialization") {
		try {
			const logContext = `${seedMode}::worker-${this.workerIndex}`
			// Create test patients
			for (let i = 0; i < this.patientCount; i++) {
				const patientAlias = this.generatePatientId(i)
				this.testPatients.push({
					patientId: patientAlias, // will be replaced with ledger identity when available
						alias: patientAlias,
						invokerIdentity: patientAlias,
						email: patientAlias,
						role: "patient",
						ledgerId: null,
					})
				}

				// Create test doctors
				for (let i = 0; i < this.doctorCount; i++) {
					const doctorAlias = this.generateDoctorId(i)
					const doctorProfile = {
						doctorId: doctorAlias,
						alias: doctorAlias,
						invokerIdentity: doctorAlias,
						email: doctorAlias,
						name: `Dr. Test ${this.workerIndex}_${i}`,
						specialization: "General Practice",
						role: "doctor",
						ledgerId: null,
					}

				// Register doctor profile on blockchain
				await this.registerDoctorProfile(doctorProfile)
				this.testDoctors.push(doctorProfile)
			}

			// Create medical records for each patient
			for (const patient of this.testPatients) {
				for (let i = 0; i < this.recordsPerPatient; i++) {
					const seededRecordId = this.generateRecordId(
						patient.alias || patient.patientId,
						i
					)
					const recordInput = {
						recordId: seededRecordId,
						patientId: patient.patientId,
						patientAlias: patient.alias || patient.invokerIdentity,
						details: `Benchmark test medical record ${i} for patient ${patient.patientId}`,
						fileName: `test_file_${this.workerIndex}_${i}.pdf`,
						s3ObjectKey: `test/${this.workerIndex}/${seededRecordId}`,
						fileHash: this.generateTestHash(seededRecordId),
					}

					// Create record on blockchain and track the actual ledger ID
					const createdRecord = await this.createPatientRecord(
						patient,
						recordInput
					)
					const normalizedRecord = {
						...recordInput,
						...createdRecord,
					}
					this.testRecords.push(normalizedRecord)
				}
			}

			console.log(
				`Worker ${this.workerIndex}: Seeded dataset (${logContext}) -> ${this.testPatients.length} patients, ${this.testDoctors.length} doctors, ${this.testRecords.length} records`
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
			const currentMode =
				(this.roundArguments.mode || "granting").toString().toLowerCase()
			if (currentMode === "initialization" || currentMode === "cleanup") {
				return ErrorHandler.createSuccessResponse(
					null,
					`${currentMode}-noop`,
					0,
					{
						note: `Skipping consent transaction during ${currentMode} mode`,
					}
				)
			}

			// Select random patient and doctor
			const patient = this.getRandomPatient()
			const doctor = this.getRandomDoctor()

			// Select random record belonging to the patient
			const patientLedgerId = patient.ledgerId || patient.patientId
			const patientAlias = patient.alias || patient.invokerIdentity || patientLedgerId
			const patientRecords = this.testRecords.filter(
				(record) =>
					record.patientId === patientLedgerId ||
					record.patientAlias === patientAlias
			)
			if (patientRecords.length === 0) {
				throw new Error(`No records found for patient ${patient.patientId}`)
			}

			const record =
				patientRecords[Math.floor(Math.random() * patientRecords.length)]
			const doctorLedgerId = doctor.ledgerId || doctor.doctorId
			if (!doctorLedgerId) {
				throw new Error(`Doctor ${doctor.alias || doctor.invokerIdentity} has no ledger identity`)
			}

			// Execute transaction with retry logic for network timeouts
			const executeTransaction = async () => {
				const request = {
					contractId: "medicalconsent",
					contractFunction: "grantConsent",
					contractArguments: [record.recordId, doctorLedgerId],
					invokerIdentity: patient.invokerIdentity,
					invokerMspId: "Org1MSP", // Patients are in Org1MSP based on network config
					readOnly: false,
				}

				const startTime = Date.now()
				const txStatus = await this.sutAdapter.sendRequests(request)
				this.ensureSuccessfulTx(txStatus, "grantConsent")
				const endTime = Date.now()

				return {
					txStatus: txStatus,
					payload: this.parseTxResult(txStatus),
					latency: endTime - startTime,
				}
			}

			// Execute with retry logic
			const { txStatus, payload, latency } = await ErrorHandler.executeWithRetry(
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
				txStatus,
				"grantConsent",
				latency,
				{
					patientId: patientLedgerId,
					patientAlias: patientAlias,
					doctorId: doctorLedgerId,
					doctorAlias: doctor.alias || doctor.invokerIdentity,
					recordId: record.recordId,
					txResult: payload,
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
            // Collect test data IDs grouped by the identity that created them
            const recordIdsByIdentity = {}
            for (const record of this.testRecords) {
                const identityKey =
                    record.patientAlias || record.patientInvoker || record.patientId
                if (!identityKey) {
                    continue
                }

                if (!recordIdsByIdentity[identityKey]) {
                    recordIdsByIdentity[identityKey] = []
                }
                recordIdsByIdentity[identityKey].push(record.recordId)
            }

            if (this.testDoctors.length > 0) {
                console.log(
                    `Worker ${this.workerIndex}: Skipping doctor cleanup verification - query function not available`
                )
            }

            const totalTestData =
                this.testPatients.length +
                this.testDoctors.length +
                this.testRecords.length

            // Clear local arrays so the worker releases references
            this.testPatients = []
            this.testDoctors = []
            this.testRecords = []

            console.log(
                `Worker ${this.workerIndex}: Cleared ${totalTestData} local test data items`
            )

            // Verify cleanup if we have identities and test data
            if (Object.keys(recordIdsByIdentity).length > 0 && totalTestData > 0) {
                console.log(
                    `Worker ${this.workerIndex}: Verifying test data cleanup...`
                )

                // Wait a moment for any pending operations to complete
                await CleanupVerifier.waitForCleanup(1500, this.workerIndex)

                // Perform cleanup verification grouped per identity
                const verificationResults =
                    await CleanupVerifier.verifyComprehensiveCleanup(
                        this.sutAdapter,
                        {
                            recordIdsByIdentity,
                            doctorIds: [],
                        },
                        null,
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


	ensureSuccessfulTx(txStatus, operationName) {
		if (!txStatus || typeof txStatus.IsCommitted !== "function") {
			throw new Error(
				`No transaction status returned for ${operationName}`
			)
		}

		if (!txStatus.IsCommitted()) {
			const errors =
				typeof txStatus.GetErrMsg === "function"
					? txStatus.GetErrMsg()
					: []
			const reason =
				Array.isArray(errors) && errors.length > 0
					? errors.join("; ")
					: "Transaction was not committed"
			const error = new Error(`${operationName} failed: ${reason}`)
			error.txStatus = txStatus
			throw error
		}
	}

	parseTxResult(txStatus) {
		if (!txStatus || typeof txStatus.GetResult !== "function") {
			return null
		}

		const rawResult = txStatus.GetResult()
		if (!rawResult) {
			return null
		}

		let resultString
		if (Buffer.isBuffer(rawResult)) {
			if (!rawResult.length) {
				return null
			}
			resultString = rawResult.toString()
		} else if (rawResult instanceof Uint8Array) {
			if (!rawResult.length) {
				return null
			}
			resultString = Buffer.from(rawResult).toString()
		} else if (ArrayBuffer.isView(rawResult)) {
			const viewBuffer = Buffer.from(rawResult.buffer)
			if (!viewBuffer.length) {
				return null
			}
			resultString = viewBuffer.toString()
		} else if (rawResult instanceof ArrayBuffer) {
			const buf = Buffer.from(rawResult)
			if (!buf.length) {
				return null
			}
			resultString = buf.toString()
		} else if (typeof rawResult === "string") {
			resultString = rawResult
		} else if (typeof rawResult === "object") {
			return rawResult
		} else {
			return null
		}

		const trimmed = resultString.trim()
		if (!trimmed) {
			return null
		}

		try {
			return JSON.parse(trimmed)
		} catch (parseError) {
			console.warn(
				`Worker ${this.workerIndex}: Unable to parse transaction result JSON: ${parseError.message}`
			)
			return null
		}
	}

	deriveRecordIdFromTx(txStatus) {
		if (!txStatus || typeof txStatus.GetID !== "function") {
			return null
		}

		const txId = txStatus.GetID()
		if (!txId) {
			return null
		}

		return `record_${txId}`
	}

	/**
	 * Generate a unique patient ID for this worker.
	 */
	generatePatientId(patientIndex) {
		// Use basic Org1MSP identities for now to test functionality
		const availableIdentities = ["User1", "Admin"]
		return availableIdentities[patientIndex % availableIdentities.length]
	}

	/**
	 * Generate a unique doctor ID for this worker.
	 */
	generateDoctorId(doctorIndex) {
		// Use basic Org1MSP identities for now to test functionality
		const availableIdentities = ["User1", "Admin"]
		return availableIdentities[doctorIndex % availableIdentities.length]
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
				invokerIdentity: doctor.invokerIdentity,
				invokerMspId: "Org1MSP", // Using Org1MSP identities for testing
				readOnly: false,
			}

			const txStatus = await this.sutAdapter.sendRequests(request)
			this.ensureSuccessfulTx(txStatus, "registerDoctorProfile")
			const profile = this.parseTxResult(txStatus)
			if (profile && profile.doctorId) {
				doctor.doctorId = profile.doctorId
				doctor.ledgerId = profile.doctorId
				doctor.profileId = profile.profileId || null
			}
			doctor.ledgerId = doctor.ledgerId || doctor.doctorId

			console.log(
				`Worker ${this.workerIndex}: Registered doctor profile for ${doctor.alias} (ledger ID: ${doctor.doctorId})`
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
				invokerIdentity: patient.invokerIdentity,
				invokerMspId: "Org1MSP", // Patients are in Org1MSP
				readOnly: false,
			}

			const txStatus = await this.sutAdapter.sendRequests(request)
			this.ensureSuccessfulTx(txStatus, "createPatientRecord")
			const parsedRecord = this.parseTxResult(txStatus) || {}
			const recordId =
				parsedRecord.recordId || this.deriveRecordIdFromTx(txStatus) || record.recordId
			const patientLedgerId = parsedRecord.patientId || patient.ledgerId || patient.patientId
			const normalizedRecord = {
				...record,
				...parsedRecord,
				recordId: recordId,
				patientId: patientLedgerId,
				patientAlias: patient.alias || patient.invokerIdentity || record.patientAlias,
			}

			if (!patient.ledgerId) {
				patient.ledgerId = patientLedgerId
			}
			patient.ledgerId = patient.ledgerId || patient.patientId

			console.log(
				`Worker ${this.workerIndex}: Created record ${normalizedRecord.recordId} for patient ${
					patient.alias || patient.invokerIdentity
				}`
			)
			return normalizedRecord
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
