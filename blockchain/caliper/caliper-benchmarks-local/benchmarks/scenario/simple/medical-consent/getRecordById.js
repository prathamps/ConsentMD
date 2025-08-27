"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

class GetRecordByIdWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.accessScenarios = [
			{ type: "authorized", weight: 0.7 }, // 70% authorized access
			{ type: "unauthorized", weight: 0.2 }, // 20% unauthorized access
			{ type: "nonexistent", weight: 0.1 }, // 10% non-existent records
		]
		this.performanceMetrics = {
			authorized: { count: 0, totalTime: 0, errors: 0 },
			unauthorized: { count: 0, totalTime: 0, errors: 0 },
			nonexistent: { count: 0, totalTime: 0, errors: 0 },
		}
	}

	/**
	 * Select access scenario based on weighted distribution
	 */
	selectAccessScenario() {
		const random = Math.random()
		let cumulativeWeight = 0

		for (const scenario of this.accessScenarios) {
			cumulativeWeight += scenario.weight
			if (random <= cumulativeWeight) {
				return scenario.type
			}
		}
		return "authorized" // fallback
	}

	/**
	 * Generate non-existent record ID for testing
	 */
	generateNonExistentRecordId() {
		return `nonexistent_record_${this.workerIndex}_${
			this.txIndex
		}_${Date.now()}`
	}

	/**
	 * Simulate unauthorized access by using different identity context
	 */
	simulateUnauthorizedAccess() {
		// In a real scenario, this would switch to a different user identity
		// For benchmarking, we simulate by adding a flag to track the scenario
		return { isUnauthorized: true }
	}

	/**
	 * Validate access control response
	 */
	validateAccessControl(result, scenario, recordId) {
		const resultString = result.GetResult().toString()

		switch (scenario) {
			case "authorized":
				if (result.GetStatus() === "SUCCESS") {
					try {
						const record = JSON.parse(resultString)
						if (record && record.recordId === recordId) {
							return { valid: true, message: "Authorized access successful" }
						}
					} catch (err) {
						return {
							valid: false,
							message: `JSON parsing failed: ${err.message}`,
						}
					}
				}
				return {
					valid: false,
					message: `Authorized access failed: ${resultString}`,
				}

			case "unauthorized":
				// Unauthorized access should fail or return limited data
				if (
					result.GetStatus() === "FAILED" ||
					resultString.includes("unauthorized") ||
					resultString.includes("access denied")
				) {
					return { valid: true, message: "Unauthorized access properly denied" }
				}
				return {
					valid: false,
					message: "Unauthorized access was not properly denied",
				}

			case "nonexistent":
				// Non-existent records should return appropriate error
				if (
					result.GetStatus() === "FAILED" ||
					resultString.includes("not found") ||
					resultString.includes("does not exist")
				) {
					return {
						valid: true,
						message: "Non-existent record properly handled",
					}
				}
				return {
					valid: false,
					message: "Non-existent record was not properly handled",
				}

			default:
				return { valid: false, message: "Unknown scenario type" }
		}
	}

	/**
	 * Update performance metrics for analysis
	 */
	updatePerformanceMetrics(scenario, duration, isError) {
		if (this.performanceMetrics[scenario]) {
			this.performanceMetrics[scenario].count++
			this.performanceMetrics[scenario].totalTime += duration
			if (isError) {
				this.performanceMetrics[scenario].errors++
			}
		}
	}

	/**
	 * Log performance summary periodically
	 */
	logPerformanceSummary() {
		if (this.txIndex % 50 === 0) {
			// Log every 50 transactions
			console.log("=== GetRecordById Performance Summary ===")
			for (const [scenario, metrics] of Object.entries(
				this.performanceMetrics
			)) {
				if (metrics.count > 0) {
					const avgTime = metrics.totalTime / metrics.count
					const errorRate = (metrics.errors / metrics.count) * 100
					console.log(
						`${scenario.toUpperCase()}: Count=${
							metrics.count
						}, AvgTime=${avgTime.toFixed(2)}ms, ErrorRate=${errorRate.toFixed(
							1
						)}%`
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
				'No record IDs available to query, skipping transaction. The "createPatientRecord" round must run first.'
			)
			return
		}

		// Select access scenario for this transaction
		const scenario = this.selectAccessScenario()
		let recordId
		let accessContext = {}

		// Prepare transaction based on scenario
		switch (scenario) {
			case "authorized":
				// Pick a random record ID from the created ones
				const randomIndex = Math.floor(Math.random() * global.recordIds.length)
				recordId = global.recordIds[randomIndex]
				break

			case "unauthorized":
				// Use existing record but simulate unauthorized access
				const unauthorizedIndex = Math.floor(
					Math.random() * global.recordIds.length
				)
				recordId = global.recordIds[unauthorizedIndex]
				accessContext = this.simulateUnauthorizedAccess()
				break

			case "nonexistent":
				// Use non-existent record ID
				recordId = this.generateNonExistentRecordId()
				break
		}

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "getRecordById",
			contractArguments: [recordId],
			readOnly: true,
		}

		try {
			const results = await this.sutAdapter.sendRequests(myArgs)
			const endTime = Date.now()
			const duration = endTime - startTime

			for (const result of results) {
				// Validate access control behavior
				const validation = this.validateAccessControl(
					result,
					scenario,
					recordId
				)
				const isError = !validation.valid

				// Update performance metrics
				this.updatePerformanceMetrics(scenario, duration, isError)

				// Log detailed results for analysis
				console.log(
					`Transaction ${
						this.txIndex
					} [${scenario.toUpperCase()}]: RecordId=${recordId}, Duration=${duration}ms, Status=${result.GetStatus()}, Validation=${
						validation.message
					}`
				)

				if (!validation.valid) {
					console.warn(
						`Access control validation failed: ${validation.message}`
					)
				}
			}

			// Log performance summary periodically
			this.logPerformanceSummary()
		} catch (error) {
			const endTime = Date.now()
			const duration = endTime - startTime

			// Update metrics for error case
			this.updatePerformanceMetrics(scenario, duration, true)

			console.error(
				`Error in getRecordById [${scenario}] for record ${recordId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new GetRecordByIdWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
