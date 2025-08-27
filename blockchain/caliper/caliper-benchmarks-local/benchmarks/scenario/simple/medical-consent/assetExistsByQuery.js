"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

class AssetExistsByQueryWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.existenceScenarios = [
			{ type: "existing_asset", weight: 0.6 }, // 60% existing assets
			{ type: "nonexistent_asset", weight: 0.3 }, // 30% non-existent assets
			{ type: "optimized_query", weight: 0.1 }, // 10% optimized existence queries
		]
		this.performanceMetrics = {
			existing_asset: {
				count: 0,
				totalTime: 0,
				truePositives: 0,
				falseNegatives: 0,
				errors: 0,
			},
			nonexistent_asset: {
				count: 0,
				totalTime: 0,
				trueNegatives: 0,
				falsePositives: 0,
				errors: 0,
			},
			optimized_query: { count: 0, totalTime: 0, totalResults: 0, errors: 0 },
		}
		this.queryOptimizations = [
			"index_hint",
			"field_selection",
			"limit_one",
			"boolean_only",
		]
	}

	/**
	 * Select existence scenario based on weighted distribution
	 */
	selectExistenceScenario() {
		const random = Math.random()
		let cumulativeWeight = 0

		for (const scenario of this.existenceScenarios) {
			cumulativeWeight += scenario.weight
			if (random <= cumulativeWeight) {
				return scenario.type
			}
		}
		return "existing_asset" // fallback
	}

	/**
	 * Generate existence query for existing assets
	 */
	generateExistingAssetQuery() {
		if (!global.recordIds || global.recordIds.length === 0) {
			return null
		}

		const randomIndex = Math.floor(Math.random() * global.recordIds.length)
		const recordId = global.recordIds[randomIndex]

		const queries = [
			{
				selector: { recordId: recordId },
				description: `Check existence by recordId: ${recordId}`,
				expectedExists: true,
			},
			{
				selector: {
					docType: "PatientRecord",
					recordId: recordId,
				},
				description: `Check PatientRecord existence: ${recordId}`,
				expectedExists: true,
			},
			{
				selector: {
					$and: [{ recordId: recordId }, { docType: { $exists: true } }],
				},
				description: `Complex existence check: ${recordId}`,
				expectedExists: true,
			},
		]

		return queries[Math.floor(Math.random() * queries.length)]
	}

	/**
	 * Generate existence query for non-existent assets
	 */
	generateNonExistentAssetQuery() {
		const nonExistentId = `nonexistent_${this.workerIndex}_${
			this.txIndex
		}_${Date.now()}`

		const queries = [
			{
				selector: { recordId: nonExistentId },
				description: `Check non-existent recordId: ${nonExistentId}`,
				expectedExists: false,
			},
			{
				selector: {
					docType: "PatientRecord",
					recordId: nonExistentId,
				},
				description: `Check non-existent PatientRecord: ${nonExistentId}`,
				expectedExists: false,
			},
			{
				selector: {
					$and: [
						{ recordId: nonExistentId },
						{ fileName: "impossible-file-name-that-should-not-exist.xyz" },
					],
				},
				description: `Complex non-existence check: ${nonExistentId}`,
				expectedExists: false,
			},
		]

		return queries[Math.floor(Math.random() * queries.length)]
	}

	/**
	 * Generate optimized existence queries
	 */
	generateOptimizedQuery() {
		const optimization =
			this.queryOptimizations[
				Math.floor(Math.random() * this.queryOptimizations.length)
			]

		switch (optimization) {
			case "index_hint":
				return {
					selector: {
						docType: "PatientRecord",
						timestamp: { $exists: true },
					},
					use_index: ["_design/indexDocTypeTimestamp", "indexDocTypeTimestamp"],
					description: "Optimized query with index hint",
					optimization: "index_hint",
					expectedExists: null, // Variable
				}

			case "field_selection":
				return {
					selector: { docType: { $in: ["PatientRecord", "MedicalRecord"] } },
					fields: ["recordId"],
					description: "Optimized query with field selection",
					optimization: "field_selection",
					expectedExists: null, // Variable
				}

			case "limit_one":
				return {
					selector: { docType: "PatientRecord" },
					limit: 1,
					description: "Optimized query with limit 1 for existence check",
					optimization: "limit_one",
					expectedExists: null, // Variable
				}

			case "boolean_only":
				return {
					selector: {
						$and: [
							{ docType: { $exists: true } },
							{ recordId: { $exists: true } },
						],
					},
					limit: 1,
					fields: ["recordId"],
					description: "Boolean existence query (optimized for speed)",
					optimization: "boolean_only",
					expectedExists: null, // Variable
				}

			default:
				return this.generateExistingAssetQuery()
		}
	}

	/**
	 * Generate query based on scenario type
	 */
	generateQuery(scenario) {
		switch (scenario) {
			case "existing_asset":
				return this.generateExistingAssetQuery()
			case "nonexistent_asset":
				return this.generateNonExistentAssetQuery()
			case "optimized_query":
				return this.generateOptimizedQuery()
			default:
				return this.generateExistingAssetQuery()
		}
	}

	/**
	 * Validate existence query results
	 */
	validateExistenceResults(resultString, query, scenario) {
		try {
			const results = JSON.parse(resultString)
			const exists = Array.isArray(results)
				? results.length > 0
				: Boolean(results)
			const resultCount = Array.isArray(results)
				? results.length
				: exists
				? 1
				: 0

			switch (scenario) {
				case "existing_asset":
					if (query.expectedExists === true) {
						if (exists) {
							return {
								valid: true,
								exists: exists,
								count: resultCount,
								accuracy: "true_positive",
								message: `Correctly found existing asset (${resultCount} results)`,
							}
						} else {
							return {
								valid: false,
								exists: exists,
								count: resultCount,
								accuracy: "false_negative",
								message: "Failed to find existing asset (false negative)",
							}
						}
					}
					break

				case "nonexistent_asset":
					if (query.expectedExists === false) {
						if (!exists) {
							return {
								valid: true,
								exists: exists,
								count: resultCount,
								accuracy: "true_negative",
								message: "Correctly identified non-existent asset",
							}
						} else {
							return {
								valid: false,
								exists: exists,
								count: resultCount,
								accuracy: "false_positive",
								message: `Incorrectly found non-existent asset (${resultCount} results)`,
							}
						}
					}
					break

				case "optimized_query":
					// For optimized queries, we mainly care about performance and valid structure
					return {
						valid: true,
						exists: exists,
						count: resultCount,
						accuracy: "optimized",
						message: `Optimized query returned ${resultCount} results (${query.optimization})`,
					}

				default:
					return {
						valid: true,
						exists: exists,
						count: resultCount,
						accuracy: "unknown",
						message: `Query returned ${resultCount} results`,
					}
			}

			// Fallback validation
			return {
				valid: true,
				exists: exists,
				count: resultCount,
				accuracy: "validated",
				message: `Query completed with ${resultCount} results`,
			}
		} catch (error) {
			return {
				valid: false,
				exists: false,
				count: 0,
				accuracy: "error",
				message: `Result parsing failed: ${error.message}`,
			}
		}
	}

	/**
	 * Update performance metrics with accuracy tracking
	 */
	updatePerformanceMetrics(scenario, duration, validation, isError) {
		if (this.performanceMetrics[scenario]) {
			this.performanceMetrics[scenario].count++
			this.performanceMetrics[scenario].totalTime += duration

			if (isError) {
				this.performanceMetrics[scenario].errors++
			} else {
				// Track accuracy metrics
				switch (validation.accuracy) {
					case "true_positive":
						this.performanceMetrics[scenario].truePositives++
						break
					case "false_negative":
						this.performanceMetrics[scenario].falseNegatives++
						break
					case "true_negative":
						this.performanceMetrics[scenario].trueNegatives++
						break
					case "false_positive":
						this.performanceMetrics[scenario].falsePositives++
						break
					case "optimized":
						this.performanceMetrics[scenario].totalResults += validation.count
						break
				}
			}
		}
	}

	/**
	 * Log performance summary with accuracy metrics
	 */
	logPerformanceSummary() {
		if (this.txIndex % 30 === 0) {
			// Log every 30 transactions
			console.log("=== AssetExistsByQuery Performance Summary ===")
			for (const [scenario, metrics] of Object.entries(
				this.performanceMetrics
			)) {
				if (metrics.count > 0) {
					const avgTime = metrics.totalTime / metrics.count
					const errorRate = (metrics.errors / metrics.count) * 100

					let accuracyInfo = ""
					if (scenario === "existing_asset") {
						const totalAccuracy = metrics.truePositives + metrics.falseNegatives
						const accuracy =
							totalAccuracy > 0
								? (metrics.truePositives / totalAccuracy) * 100
								: 0
						accuracyInfo = `, Accuracy=${accuracy.toFixed(1)}% (TP=${
							metrics.truePositives
						}, FN=${metrics.falseNegatives})`
					} else if (scenario === "nonexistent_asset") {
						const totalAccuracy = metrics.trueNegatives + metrics.falsePositives
						const accuracy =
							totalAccuracy > 0
								? (metrics.trueNegatives / totalAccuracy) * 100
								: 0
						accuracyInfo = `, Accuracy=${accuracy.toFixed(1)}% (TN=${
							metrics.trueNegatives
						}, FP=${metrics.falsePositives})`
					} else if (scenario === "optimized_query") {
						const avgResults = metrics.totalResults / metrics.count
						accuracyInfo = `, AvgResults=${avgResults.toFixed(1)}`
					}

					console.log(
						`${scenario.toUpperCase()}: Count=${
							metrics.count
						}, AvgTime=${avgTime.toFixed(2)}ms, ErrorRate=${errorRate.toFixed(
							1
						)}%${accuracyInfo}`
					)
				}
			}
		}
	}

	async submitTransaction() {
		this.txIndex++
		const startTime = Date.now()

		// Select scenario and generate appropriate query
		const scenario = this.selectExistenceScenario()
		const queryObj = this.generateQuery(scenario)

		if (!queryObj) {
			console.log(
				`No query could be generated for scenario ${scenario}, skipping transaction. Ensure record creation rounds have run first.`
			)
			return
		}

		const queryString = JSON.stringify(queryObj.selector || queryObj)

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "assetExistsByQuery",
			contractArguments: [queryString],
			readOnly: true,
		}

		try {
			const results = await this.sutAdapter.sendRequests(myArgs)
			const endTime = Date.now()
			const duration = endTime - startTime

			for (const result of results) {
				let validation = {
					valid: false,
					exists: false,
					count: 0,
					accuracy: "error",
					message: "Unknown error",
				}
				let isError = false

				if (result.GetStatus() === "SUCCESS") {
					const resultString = result.GetResult().toString()
					validation = this.validateExistenceResults(
						resultString,
						queryObj,
						scenario
					)
					isError = !validation.valid
				} else {
					isError = true
					validation.message = `Existence query failed: ${result
						.GetResult()
						.toString()}`
				}

				// Update performance metrics
				this.updatePerformanceMetrics(scenario, duration, validation, isError)

				// Log detailed results
				console.log(
					`Transaction ${this.txIndex} [${scenario.toUpperCase()}]: Query="${
						queryObj.description
					}", Duration=${duration}ms, Exists=${validation.exists}, Count=${
						validation.count
					}, Status=${result.GetStatus()}, Accuracy=${
						validation.accuracy
					}, Validation=${validation.message}`
				)

				if (isError) {
					console.warn(`Existence validation failed: ${validation.message}`)
				}
			}

			// Log performance summary periodically
			this.logPerformanceSummary()
		} catch (error) {
			const endTime = Date.now()
			const duration = endTime - startTime

			// Update metrics for error case
			const errorValidation = {
				valid: false,
				exists: false,
				count: 0,
				accuracy: "error",
				message: error.message,
			}
			this.updatePerformanceMetrics(scenario, duration, errorValidation, true)

			console.error(
				`Error in assetExistsByQuery [${scenario}]: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new AssetExistsByQueryWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
