"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")
const crypto = require("crypto")

class AddPrivateNoteToRecordWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.privateDataScenarios = [
			{ type: "doctor_note", weight: 0.4 }, // 40% doctor private notes
			{ type: "sensitive_data", weight: 0.3 }, // 30% sensitive medical data
			{ type: "large_note", weight: 0.2 }, // 20% large private notes
			{ type: "encrypted_note", weight: 0.1 }, // 10% encrypted private notes
		]
		this.performanceMetrics = {
			doctor_note: { count: 0, totalTime: 0, totalDataSize: 0, errors: 0 },
			sensitive_data: { count: 0, totalTime: 0, totalDataSize: 0, errors: 0 },
			large_note: { count: 0, totalTime: 0, totalDataSize: 0, errors: 0 },
			encrypted_note: { count: 0, totalTime: 0, totalDataSize: 0, errors: 0 },
		}
		this.medicalTerminology = [
			"hypertension",
			"diabetes mellitus",
			"myocardial infarction",
			"pneumonia",
			"chronic obstructive pulmonary disease",
			"acute respiratory distress",
			"congestive heart failure",
			"atrial fibrillation",
			"deep vein thrombosis",
			"pulmonary embolism",
			"acute kidney injury",
			"sepsis",
			"stroke",
		]
		this.sensitiveDataTypes = [
			"psychiatric_evaluation",
			"substance_abuse_history",
			"genetic_testing",
			"fertility_treatment",
			"mental_health_assessment",
			"family_history",
		]
	}

	/**
	 * Select private data scenario based on weighted distribution
	 */
	selectPrivateDataScenario() {
		const random = Math.random()
		let cumulativeWeight = 0

		for (const scenario of this.privateDataScenarios) {
			cumulativeWeight += scenario.weight
			if (random <= cumulativeWeight) {
				return scenario.type
			}
		}
		return "doctor_note" // fallback
	}

	/**
	 * Generate doctor private note
	 */
	generateDoctorNote(recordId) {
		const condition =
			this.medicalTerminology[
				Math.floor(Math.random() * this.medicalTerminology.length)
			]
		const timestamp = new Date().toISOString()

		const notes = [
			`Private consultation notes for ${recordId}: Patient presents with symptoms consistent with ${condition}. Recommend further evaluation and monitoring.`,
			`Confidential assessment: ${condition} diagnosis confirmed. Treatment plan adjusted accordingly. Follow-up required in 2 weeks.`,
			`Internal note: Patient ${recordId} showing improvement in ${condition} management. Continue current medication regimen.`,
			`Private observation: Discussed ${condition} prognosis with patient. Patient understands treatment options and risks.`,
			`Confidential update: ${condition} treatment response positive. Consider reducing medication dosage in next visit.`,
		]

		const selectedNote = notes[Math.floor(Math.random() * notes.length)]

		return {
			noteType: "doctor_private_note",
			content: selectedNote,
			timestamp: timestamp,
			confidentialityLevel: "high",
			dataSize: Buffer.byteLength(selectedNote, "utf8"),
		}
	}

	/**
	 * Generate sensitive medical data
	 */
	generateSensitiveData(recordId) {
		const dataType =
			this.sensitiveDataTypes[
				Math.floor(Math.random() * this.sensitiveDataTypes.length)
			]
		const timestamp = new Date().toISOString()

		const sensitiveContent = {
			psychiatric_evaluation: `Psychiatric evaluation for ${recordId}: Patient exhibits signs of anxiety and depression. Recommend therapy and possible medication. Confidential assessment completed.`,
			substance_abuse_history: `Substance abuse history: Patient ${recordId} reports previous alcohol dependency. Currently in recovery for 18 months. Support system in place.`,
			genetic_testing: `Genetic testing results: Patient ${recordId} carries genetic markers for hereditary conditions. Family counseling recommended. Results strictly confidential.`,
			fertility_treatment: `Fertility treatment notes: Patient ${recordId} undergoing IVF treatment. Current cycle status and hormone levels documented. Highly sensitive information.`,
			mental_health_assessment: `Mental health assessment: Patient ${recordId} diagnosed with bipolar disorder. Medication compliance good. Regular monitoring required.`,
			family_history: `Family history: Patient ${recordId} has significant family history of cardiac disease and diabetes. Genetic counseling provided. Confidential family data.`,
		}

		const content =
			sensitiveContent[dataType] ||
			`Sensitive medical data for ${recordId}: Confidential information requiring special handling.`

		return {
			noteType: "sensitive_medical_data",
			dataType: dataType,
			content: content,
			timestamp: timestamp,
			confidentialityLevel: "maximum",
			dataSize: Buffer.byteLength(content, "utf8"),
		}
	}

	/**
	 * Generate large private note (for performance testing)
	 */
	generateLargeNote(recordId) {
		const timestamp = new Date().toISOString()
		const baseContent = `Comprehensive medical assessment for ${recordId}: `

		// Generate large content by repeating medical observations
		const observations = [
			"Patient vital signs stable throughout examination period.",
			"Detailed physical examination reveals no acute abnormalities.",
			"Laboratory results indicate normal ranges for most parameters.",
			"Imaging studies show expected findings for patient age group.",
			"Patient history thoroughly reviewed and documented.",
			"Treatment response monitored and adjusted as necessary.",
			"Side effects minimal and well-tolerated by patient.",
			"Patient education provided regarding condition management.",
			"Follow-up appointments scheduled at appropriate intervals.",
			"Coordination with other specialists completed as needed.",
		]

		let largeContent = baseContent
		// Repeat observations to create large content (target ~2-5KB)
		for (let i = 0; i < 50; i++) {
			const observation = observations[i % observations.length]
			largeContent += ` ${observation}`
		}

		largeContent += ` Assessment completed on ${timestamp}. All findings documented in private data collection for enhanced security and compliance.`

		return {
			noteType: "comprehensive_assessment",
			content: largeContent,
			timestamp: timestamp,
			confidentialityLevel: "high",
			dataSize: Buffer.byteLength(largeContent, "utf8"),
		}
	}

	/**
	 * Generate encrypted private note
	 */
	generateEncryptedNote(recordId) {
		const timestamp = new Date().toISOString()
		const plainContent = `Highly confidential medical note for ${recordId}: Contains sensitive diagnostic information and treatment recommendations that require maximum security protection.`

		// Simulate encryption (in real scenario, use proper encryption)
		const encryptionKey = crypto.randomBytes(32).toString("hex")
		const cipher = crypto.createCipher("aes-256-cbc", encryptionKey)
		let encryptedContent = cipher.update(plainContent, "utf8", "hex")
		encryptedContent += cipher.final("hex")

		return {
			noteType: "encrypted_private_note",
			content: encryptedContent,
			encryptionKey: encryptionKey, // In real scenario, this would be stored securely
			timestamp: timestamp,
			confidentialityLevel: "maximum",
			encrypted: true,
			dataSize: Buffer.byteLength(encryptedContent, "utf8"),
		}
	}

	/**
	 * Generate private data based on scenario
	 */
	generatePrivateData(scenario, recordId) {
		switch (scenario) {
			case "doctor_note":
				return this.generateDoctorNote(recordId)
			case "sensitive_data":
				return this.generateSensitiveData(recordId)
			case "large_note":
				return this.generateLargeNote(recordId)
			case "encrypted_note":
				return this.generateEncryptedNote(recordId)
			default:
				return this.generateDoctorNote(recordId)
		}
	}

	/**
	 * Validate private data collection operation
	 */
	validatePrivateDataOperation(result, privateData, scenario) {
		if (result.GetStatus() !== "SUCCESS") {
			return {
				valid: false,
				message: `Private data operation failed: ${result
					.GetResult()
					.toString()}`,
			}
		}

		try {
			const response = result.GetResult().toString()

			// Check if response indicates successful private data storage
			if (
				response.includes("success") ||
				response.includes("added") ||
				response.includes("stored")
			) {
				return {
					valid: true,
					message: `Private data successfully stored (${scenario}, ${privateData.dataSize} bytes)`,
				}
			}

			// For some chaincode implementations, success might be indicated differently
			if (response.length === 0 || response === "{}") {
				// Empty response often indicates success in Fabric
				return {
					valid: true,
					message: `Private data operation completed (${scenario}, ${privateData.dataSize} bytes)`,
				}
			}

			return {
				valid: true,
				message: `Private data operation response: ${response.substring(
					0,
					100
				)}...`,
			}
		} catch (error) {
			return {
				valid: false,
				message: `Response validation failed: ${error.message}`,
			}
		}
	}

	/**
	 * Validate access control for private data
	 */
	validatePrivateDataAccess(privateData, scenario) {
		// Simulate access control validation
		const validationChecks = {
			hasConfidentialityLevel: privateData.confidentialityLevel !== undefined,
			hasTimestamp: privateData.timestamp !== undefined,
			hasProperNoteType: privateData.noteType !== undefined,
			isEncryptedIfRequired:
				scenario === "encrypted_note" ? privateData.encrypted === true : true,
			hasReasonableSize:
				privateData.dataSize > 0 && privateData.dataSize < 100000, // Max 100KB
		}

		const failedChecks = Object.entries(validationChecks)
			.filter(([check, passed]) => !passed)
			.map(([check]) => check)

		if (failedChecks.length > 0) {
			return {
				valid: false,
				message: `Access control validation failed: ${failedChecks.join(", ")}`,
			}
		}

		return {
			valid: true,
			message: `Access control validation passed for ${scenario}`,
		}
	}

	/**
	 * Update performance metrics
	 */
	updatePerformanceMetrics(scenario, duration, dataSize, isError) {
		if (this.performanceMetrics[scenario]) {
			this.performanceMetrics[scenario].count++
			this.performanceMetrics[scenario].totalTime += duration
			this.performanceMetrics[scenario].totalDataSize += dataSize
			if (isError) {
				this.performanceMetrics[scenario].errors++
			}
		}
	}

	/**
	 * Log performance summary with PDC-specific metrics
	 */
	logPerformanceSummary() {
		if (this.txIndex % 15 === 0) {
			// Log every 15 transactions
			console.log("=== AddPrivateNoteToRecord Performance Summary ===")
			for (const [scenario, metrics] of Object.entries(
				this.performanceMetrics
			)) {
				if (metrics.count > 0) {
					const avgTime = metrics.totalTime / metrics.count
					const avgDataSize = metrics.totalDataSize / metrics.count
					const errorRate = (metrics.errors / metrics.count) * 100
					const throughputKBps =
						metrics.totalDataSize / 1024 / (metrics.totalTime / 1000)

					console.log(
						`${scenario.toUpperCase()}: Count=${
							metrics.count
						}, AvgTime=${avgTime.toFixed(2)}ms, AvgSize=${avgDataSize.toFixed(
							0
						)}B, Throughput=${throughputKBps.toFixed(
							2
						)}KB/s, ErrorRate=${errorRate.toFixed(1)}%`
					)
				}
			}
		}
	}

	async submitTransaction() {
		this.txIndex++
		const startTime = Date.now()

		if (!global.recordIds || global.recordIds.length === 0) {
			console.log(
				"No record IDs available for private note addition, skipping transaction. The record creation rounds must run first."
			)
			return
		}

		// Select scenario and target record
		const scenario = this.selectPrivateDataScenario()
		const randomIndex = Math.floor(Math.random() * global.recordIds.length)
		const recordId = global.recordIds[randomIndex]

		// Generate private data
		const privateData = this.generatePrivateData(scenario, recordId)

		// Validate access control before submission
		const accessValidation = this.validatePrivateDataAccess(
			privateData,
			scenario
		)
		if (!accessValidation.valid) {
			console.warn(
				`Access control validation failed: ${accessValidation.message}`
			)
		}

		// Prepare transient data for private data collection
		const transientData = {
			privateNote: Buffer.from(JSON.stringify(privateData)),
		}

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "addPrivateNoteToRecord",
			contractArguments: [recordId],
			transientMap: transientData,
			readOnly: false,
		}

		try {
			const results = await this.sutAdapter.sendRequests(myArgs)
			const endTime = Date.now()
			const duration = endTime - startTime

			for (const result of results) {
				// Validate the private data operation
				const validation = this.validatePrivateDataOperation(
					result,
					privateData,
					scenario
				)
				const isError = !validation.valid

				// Update performance metrics
				this.updatePerformanceMetrics(
					scenario,
					duration,
					privateData.dataSize,
					isError
				)

				// Log detailed results
				console.log(
					`Transaction ${
						this.txIndex
					} [${scenario.toUpperCase()}]: RecordId=${recordId}, Duration=${duration}ms, DataSize=${
						privateData.dataSize
					}B, Status=${result.GetStatus()}, Validation=${validation.message}`
				)

				if (!accessValidation.valid) {
					console.warn(`Access Control: ${accessValidation.message}`)
				}

				if (isError) {
					console.warn(`Private data validation failed: ${validation.message}`)
				}

				// Log encryption details for encrypted notes
				if (scenario === "encrypted_note") {
					console.log(
						`Encryption: Key length=${privateData.encryptionKey.length}, Encrypted size=${privateData.dataSize}B`
					)
				}
			}

			// Log performance summary periodically
			this.logPerformanceSummary()
		} catch (error) {
			const endTime = Date.now()
			const duration = endTime - startTime

			// Update metrics for error case
			this.updatePerformanceMetrics(
				scenario,
				duration,
				privateData.dataSize,
				true
			)

			console.error(
				`Error in addPrivateNoteToRecord [${scenario}] for record ${recordId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new AddPrivateNoteToRecordWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
