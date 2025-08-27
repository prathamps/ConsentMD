"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

class GetAssetHistoryWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.historyScenarios = [
			{ type: "existing_record", weight: 0.7 }, // 70% existing records
			{ type: "modified_record", weight: 0.2 }, // 20% records that have been modified
			{ type: "nonexistent_record", weight: 0.1 }, // 10% non-existent records
		]
		this.performanceMetrics = {
			existing_record: {
				count: 0,
				totalTime: 0,
				totalHistoryEntries: 0,
				errors: 0,
			},
			modified_record: {
				count: 0,
				totalTime: 0,
				totalHistoryEntries: 0,
				errors: 0,
			},
			nonexistent_record: {
				count: 0,
				totalTime: 0,
				totalHistoryEntries: 0,
				errors: 0,
			},
		}
	}

	/**
	 * Select history scenario based on weighted distribution
	 */
	selectHistoryScenario() {
		const random = Math.random()
		let cumulativeWeight = 0

		for (const scenario of this.historyScenarios) {
			cumulativeWeight += scenario.weight
			if (random <= cumulativeWeight) {
				return scenario.type
			}
		}
		return "existing_record" // fallback
	}

	/**
	 * Get record ID based on scenario type
	 */
	getRecordIdForScenario(scenario) {
		switch (scenario) {
			case "existing_record":
				// Use any existing record ID
				if (global.recordIds && global.recordIds.length > 0) {
					const randomIndex = Math.floor(
						Math.random() * global.recordIds.length
					)
					return global.recordIds[randomIndex]
				}
				return null

			case "modified_record":
				// Prefer records that might have been modified (updated records)
				if (global.updatedRecordIds && global.updatedRecordIds.length > 0) {
					const randomIndex = Math.floor(
						Math.random() * global.updatedRecordIds.length
					)
					return global.updatedRecordIds[randomIndex]
				} else if (global.recordIds && global.recordIds.length > 0) {
					// Fallback to any existing record
					const randomIndex = Math.floor(
						Math.random() * global.recordIds.length
					)
					return global.recordIds[randomIndex]
				}
				return null

			case "nonexistent_record":
				// Generate a non-existent record ID
				return `nonexistent_history_${this.workerIndex}_${
					this.txIndex
				}_${Date.now()}`

			default:
				return null
		}
	}

	/**
	 * Validate history data structure and content
	 */
	validateHistoryData(historyString, recordId, scenario) {
		try {
			const history = JSON.parse(historyString)

			// Basic structure validation
			if (!Array.isArray(history)) {
				return {
					valid: false,
					entryCount: 0,
					message: "History is not an array",
				}
			}

			const entryCount = history.length

			// Scenario-specific validation
			switch (scenario) {
				case "existing_record":
					if (entryCount === 0) {
						return {
							valid: false,
							entryCount: 0,
							message: "Existing record should have at least one history entry",
						}
					}

					// Validate history entry structure
					for (let i = 0; i < history.length; i++) {
						const entry = history[i]
						if (!entry.txId || !entry.timestamp || !entry.value) {
							return {
								valid: false,
								entryCount: entryCount,
								message: `History entry ${i} missing required fields (txId, timestamp, value)`,
							}
						}

						// Validate that the record ID matches
						try {
							const value = JSON.parse(entry.value)
							if (value.recordId && value.recordId !== recordId) {
								return {
									valid: false,
									entryCount: entryCount,
									message: `History entry ${i} recordId mismatch: expected ${recordId}, got ${value.recordId}`,
								}
							}
						} catch (parseError) {
							// Value might not be JSON, which is acceptable
						}
					}

					return {
						valid: true,
						entryCount: entryCount,
						message: `Valid history with ${entryCount} entries`,
					}

				case "modified_record":
					if (entryCount < 2) {
						return {
							valid: false,
							entryCount: entryCount,
							message: "Modified record should have multiple history entries",
						}
					}

					// Check for chronological order (most recent first)
					for (let i = 0; i < history.length - 1; i++) {
						const currentTimestamp = new Date(history[i].timestamp)
						const nextTimestamp = new Date(history[i + 1].timestamp)
						if (currentTimestamp < nextTimestamp) {
							return {
								valid: false,
								entryCount: entryCount,
								message:
									"History entries not in chronological order (most recent first)",
							}
						}
					}

					return {
						valid: true,
						entryCount: entryCount,
						message: `Valid modified record history with ${entryCount} entries`,
					}

				case "nonexistent_record":
					if (entryCount > 0) {
						return {
							valid: false,
							entryCount: entryCount,
							message: "Non-existent record should have empty history",
						}
					}

					return {
						valid: true,
						entryCount: 0,
						message: "Non-existent record correctly returned empty history",
					}

				default:
					return {
						valid: true,
						entryCount: entryCount,
						message: "History retrieved successfully",
					}
			}
		} catch (error) {
			return {
				valid: false,
				entryCount: 0,
				message: `History parsing failed: ${error.message}`,
			}
		}
	}

	/**
	 * Analyze history patterns for insights
	 */
	analyzeHistoryPatterns(historyString, recordId) {
		try {
			const history = JSON.parse(historyString)
			if (!Array.isArray(history) || history.length === 0) {
				return { analysis: "No history data to analyze" }
			}

			const analysis = {
				totalEntries: history.length,
				timeSpan: null,
				modifications: 0,
				uniqueTransactors: new Set(),
				operationTypes: {},
			}

			// Analyze timestamps and operations
			const timestamps = []
			for (const entry of history) {
				if (entry.timestamp) {
					timestamps.push(new Date(entry.timestamp))
				}

				if (entry.txId) {
					analysis.uniqueTransactors.add(entry.txId.substring(0, 8)) // First 8 chars of txId
				}

				// Try to determine operation type from value changes
				try {
					const value = JSON.parse(entry.value)
					if (value.docType) {
						const opType = value.docType
						analysis.operationTypes[opType] =
							(analysis.operationTypes[opType] || 0) + 1
					}
				} catch (parseError) {
					// Value parsing failed, skip operation type analysis
				}
			}

			// Calculate time span
			if (timestamps.length > 1) {
				timestamps.sort((a, b) => a - b)
				const timeSpanMs = timestamps[timestamps.length - 1] - timestamps[0]
				analysis.timeSpan = `${Math.round(timeSpanMs / (1000 * 60))} minutes`
			}

			analysis.uniqueTransactors = analysis.uniqueTransactors.size
			analysis.modifications = Math.max(0, history.length - 1) // Subtract initial creation

			return { analysis: JSON.stringify(analysis, null, 2) }
		} catch (error) {
			return { analysis: `Analysis failed: ${error.message}` }
		}
	}

	/**
	 * Update performance metrics
	 */
	updatePerformanceMetrics(scenario, duration, entryCount, isError) {
		if (this.performanceMetrics[scenario]) {
			this.performanceMetrics[scenario].count++
			this.performanceMetrics[scenario].totalTime += duration
			this.performanceMetrics[scenario].totalHistoryEntries += entryCount
			if (isError) {
				this.performanceMetrics[scenario].errors++
			}
		}
	}

	/**
	 * Log performance summary periodically
	 */
	logPerformanceSummary() {
		if (this.txIndex % 20 === 0) {
			// Log every 20 transactions
			console.log("=== GetAssetHistory Performance Summary ===")
			for (const [scenario, metrics] of Object.entries(
				this.performanceMetrics
			)) {
				if (metrics.count > 0) {
					const avgTime = metrics.totalTime / metrics.count
					const avgEntries = metrics.totalHistoryEntries / metrics.count
					const errorRate = (metrics.errors / metrics.count) * 100
					console.log(
						`${scenario.toUpperCase()}: Count=${
							metrics.count
						}, AvgTime=${avgTime.toFixed(2)}ms, AvgEntries=${avgEntries.toFixed(
							1
						)}, ErrorRate=${errorRate.toFixed(1)}%`
					)
				}
			}
		}
	}

	async submitTransaction() {
		this.txIndex++
		const startTime = Date.now()

		// Select scenario and get appropriate record ID
		const scenario = this.selectHistoryScenario()
		const recordId = this.getRecordIdForScenario(scenario)

		if (!recordId) {
			console.log(
				`No record ID available for scenario ${scenario}, skipping transaction. Ensure record creation rounds have run first.`
			)
			return
		}

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "getAssetHistory",
			contractArguments: [recordId],
			readOnly: true,
		}

		try {
			const results = await this.sutAdapter.sendRequests(myArgs)
			const endTime = Date.now()
			const duration = endTime - startTime

			for (const result of results) {
				let entryCount = 0
				let isError = false
				let validationMessage = ""
				let analysisResult = ""

				if (result.GetStatus() === "SUCCESS") {
					const historyString = result.GetResult().toString()

					// Validate history data
					const validation = this.validateHistoryData(
						historyString,
						recordId,
						scenario
					)
					entryCount = validation.entryCount
					isError = !validation.valid
					validationMessage = validation.message

					// Perform additional analysis for successful queries
					if (!isError && entryCount > 0) {
						const analysis = this.analyzeHistoryPatterns(
							historyString,
							recordId
						)
						analysisResult = analysis.analysis
					}
				} else {
					isError = true
					validationMessage = `History query failed: ${result
						.GetResult()
						.toString()}`
				}

				// Update performance metrics
				this.updatePerformanceMetrics(scenario, duration, entryCount, isError)

				// Log detailed results
				console.log(
					`Transaction ${
						this.txIndex
					} [${scenario.toUpperCase()}]: RecordId=${recordId}, Duration=${duration}ms, Entries=${entryCount}, Status=${result.GetStatus()}, Validation=${validationMessage}`
				)

				if (analysisResult) {
					console.log(`History Analysis: ${analysisResult}`)
				}

				if (isError) {
					console.warn(`History validation failed: ${validationMessage}`)
				}
			}

			// Log performance summary periodically
			this.logPerformanceSummary()
		} catch (error) {
			const endTime = Date.now()
			const duration = endTime - startTime

			// Update metrics for error case
			this.updatePerformanceMetrics(scenario, duration, 0, true)

			console.error(
				`Error in getAssetHistory [${scenario}] for record ${recordId}: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new GetAssetHistoryWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
