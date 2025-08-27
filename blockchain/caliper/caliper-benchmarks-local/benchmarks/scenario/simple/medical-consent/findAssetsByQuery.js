"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

class FindAssetsByQueryWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.queryPatterns = [
			{ type: "simple", weight: 0.4, complexity: "low" },
			{ type: "range", weight: 0.3, complexity: "medium" },
			{ type: "complex", weight: 0.2, complexity: "high" },
			{ type: "compound", weight: 0.1, complexity: "very_high" },
		]
		this.performanceMetrics = {
			simple: { count: 0, totalTime: 0, totalResults: 0, errors: 0 },
			range: { count: 0, totalTime: 0, totalResults: 0, errors: 0 },
			complex: { count: 0, totalTime: 0, totalResults: 0, errors: 0 },
			compound: { count: 0, totalTime: 0, totalResults: 0, errors: 0 },
		}
		this.medicalConditions = [
			"hypertension",
			"diabetes",
			"asthma",
			"arthritis",
			"migraine",
			"allergic-reaction",
			"chest-pain",
			"back-pain",
			"anxiety",
			"depression",
		]
		this.fileTypes = [
			"medical-report",
			"lab-results",
			"x-ray-scan",
			"mri-scan",
			"blood-test",
		]
	}

	/**
	 * Select query pattern based on weighted distribution
	 */
	selectQueryPattern() {
		const random = Math.random()
		let cumulativeWeight = 0

		for (const pattern of this.queryPatterns) {
			cumulativeWeight += pattern.weight
			if (random <= cumulativeWeight) {
				return pattern
			}
		}
		return this.queryPatterns[0] // fallback
	}

	/**
	 * Generate simple CouchDB query (single field match)
	 */
	generateSimpleQuery() {
		const queries = [
			{
				selector: { docType: "PatientRecord" },
				description: "Find all patient records",
			},
			{
				selector: { docType: "MedicalRecord" },
				description: "Find all medical records",
			},
			{
				selector: {
					docType: "PatientRecord",
					details: {
						$regex:
							this.medicalConditions[
								Math.floor(Math.random() * this.medicalConditions.length)
							],
					},
				},
				description: "Find records by medical condition",
			},
		]
		return queries[Math.floor(Math.random() * queries.length)]
	}

	/**
	 * Generate range query (date/time ranges, numeric ranges)
	 */
	generateRangeQuery() {
		const currentTime = new Date().toISOString()
		const pastTime = new Date(
			Date.now() - 30 * 24 * 60 * 60 * 1000
		).toISOString() // 30 days ago

		const queries = [
			{
				selector: {
					docType: "PatientRecord",
					timestamp: {
						$gte: pastTime,
						$lte: currentTime,
					},
				},
				description: "Find records within date range",
			},
			{
				selector: {
					docType: "MedicalRecord",
					createdAt: { $gte: pastTime },
				},
				description: "Find recent medical records",
			},
			{
				selector: {
					docType: { $in: ["PatientRecord", "MedicalRecord"] },
					timestamp: { $exists: true },
				},
				description: "Find all records with timestamps",
			},
		]
		return queries[Math.floor(Math.random() * queries.length)]
	}

	/**
	 * Generate complex query (multiple conditions, nested logic)
	 */
	generateComplexQuery() {
		const condition =
			this.medicalConditions[
				Math.floor(Math.random() * this.medicalConditions.length)
			]
		const fileType =
			this.fileTypes[Math.floor(Math.random() * this.fileTypes.length)]

		const queries = [
			{
				selector: {
					$and: [
						{ docType: "PatientRecord" },
						{
							$or: [
								{ details: { $regex: condition } },
								{ fileName: { $regex: fileType } },
							],
						},
					],
				},
				description: "Find records with condition OR file type",
			},
			{
				selector: {
					docType: "PatientRecord",
					$and: [
						{ details: { $exists: true } },
						{ fileName: { $exists: true } },
						{ fileHash: { $exists: true } },
					],
				},
				description: "Find complete patient records",
			},
			{
				selector: {
					$or: [
						{
							$and: [
								{ docType: "PatientRecord" },
								{ details: { $regex: condition } },
							],
						},
						{
							$and: [
								{ docType: "MedicalRecord" },
								{ fileName: { $regex: fileType } },
							],
						},
					],
				},
				description: "Complex OR with nested AND conditions",
			},
		]
		return queries[Math.floor(Math.random() * queries.length)]
	}

	/**
	 * Generate compound query (multiple operators, sorting, limits)
	 */
	generateCompoundQuery() {
		const queries = [
			{
				selector: {
					$and: [
						{ docType: { $in: ["PatientRecord", "MedicalRecord"] } },
						{ timestamp: { $exists: true } },
						{
							$or: [
								{ details: { $regex: ".*" } },
								{ fileName: { $exists: true } },
							],
						},
					],
				},
				sort: [{ timestamp: "desc" }],
				limit: 10,
				description: "Complex query with sorting and limit",
			},
			{
				selector: {
					$and: [
						{ docType: "PatientRecord" },
						{
							$or: this.medicalConditions.map((condition) => ({
								details: { $regex: condition },
							})),
						},
					],
				},
				fields: ["recordId", "details", "timestamp"],
				description: "Query with field selection",
			},
			{
				selector: {
					docType: { $ne: "DoctorProfile" },
					$and: [
						{ timestamp: { $exists: true } },
						{
							$or: [
								{ details: { $size: { $gt: 10 } } },
								{ fileName: { $regex: ".*\\.(pdf|jpg|png)$" } },
							],
						},
					],
				},
				sort: [{ timestamp: "asc" }],
				limit: 25,
				description: "Advanced compound query with exclusions",
			},
		]
		return queries[Math.floor(Math.random() * queries.length)]
	}

	/**
	 * Generate query based on pattern type
	 */
	generateQuery(patternType) {
		switch (patternType) {
			case "simple":
				return this.generateSimpleQuery()
			case "range":
				return this.generateRangeQuery()
			case "complex":
				return this.generateComplexQuery()
			case "compound":
				return this.generateCompoundQuery()
			default:
				return this.generateSimpleQuery()
		}
	}

	/**
	 * Validate query results
	 */
	validateQueryResults(results, query, patternType) {
		try {
			const parsedResults = JSON.parse(results)
			const resultCount = Array.isArray(parsedResults)
				? parsedResults.length
				: 0

			// Basic validation
			if (resultCount < 0) {
				return { valid: false, count: 0, message: "Invalid result count" }
			}

			// Pattern-specific validation
			switch (patternType) {
				case "simple":
					// Simple queries should return some results if data exists
					return {
						valid: true,
						count: resultCount,
						message: `Simple query returned ${resultCount} results`,
					}

				case "range":
					// Range queries might return fewer results
					return {
						valid: true,
						count: resultCount,
						message: `Range query returned ${resultCount} results`,
					}

				case "complex":
					// Complex queries might have more specific results
					return {
						valid: true,
						count: resultCount,
						message: `Complex query returned ${resultCount} results`,
					}

				case "compound":
					// Compound queries with limits should respect limits
					const hasLimit = query.limit !== undefined
					if (hasLimit && resultCount > query.limit) {
						return {
							valid: false,
							count: resultCount,
							message: `Compound query exceeded limit: ${resultCount} > ${query.limit}`,
						}
					}
					return {
						valid: true,
						count: resultCount,
						message: `Compound query returned ${resultCount} results`,
					}

				default:
					return { valid: true, count: resultCount, message: "Query completed" }
			}
		} catch (error) {
			return {
				valid: false,
				count: 0,
				message: `Result parsing failed: ${error.message}`,
			}
		}
	}

	/**
	 * Update performance metrics
	 */
	updatePerformanceMetrics(patternType, duration, resultCount, isError) {
		if (this.performanceMetrics[patternType]) {
			this.performanceMetrics[patternType].count++
			this.performanceMetrics[patternType].totalTime += duration
			this.performanceMetrics[patternType].totalResults += resultCount
			if (isError) {
				this.performanceMetrics[patternType].errors++
			}
		}
	}

	/**
	 * Log performance summary periodically
	 */
	logPerformanceSummary() {
		if (this.txIndex % 25 === 0) {
			// Log every 25 transactions
			console.log("=== FindAssetsByQuery Performance Summary ===")
			for (const [pattern, metrics] of Object.entries(
				this.performanceMetrics
			)) {
				if (metrics.count > 0) {
					const avgTime = metrics.totalTime / metrics.count
					const avgResults = metrics.totalResults / metrics.count
					const errorRate = (metrics.errors / metrics.count) * 100
					console.log(
						`${pattern.toUpperCase()}: Count=${
							metrics.count
						}, AvgTime=${avgTime.toFixed(2)}ms, AvgResults=${avgResults.toFixed(
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

		// Select query pattern and generate query
		const pattern = this.selectQueryPattern()
		const queryObj = this.generateQuery(pattern.type)
		const queryString = JSON.stringify(queryObj.selector || queryObj)

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "findAssetsByQuery",
			contractArguments: [queryString],
			readOnly: true,
		}

		try {
			const results = await this.sutAdapter.sendRequests(myArgs)
			const endTime = Date.now()
			const duration = endTime - startTime

			for (const result of results) {
				let resultCount = 0
				let isError = false
				let validationMessage = ""

				if (result.GetStatus() === "SUCCESS") {
					const resultString = result.GetResult().toString()
					const validation = this.validateQueryResults(
						resultString,
						queryObj,
						pattern.type
					)
					resultCount = validation.count
					isError = !validation.valid
					validationMessage = validation.message
				} else {
					isError = true
					validationMessage = `Query failed: ${result.GetResult().toString()}`
				}

				// Update performance metrics
				this.updatePerformanceMetrics(
					pattern.type,
					duration,
					resultCount,
					isError
				)

				// Log detailed results
				console.log(
					`Transaction ${
						this.txIndex
					} [${pattern.type.toUpperCase()}]: Query="${
						queryObj.description
					}", Duration=${duration}ms, Results=${resultCount}, Status=${result.GetStatus()}, Validation=${validationMessage}`
				)

				if (isError) {
					console.warn(`Query validation failed: ${validationMessage}`)
				}
			}

			// Log performance summary periodically
			this.logPerformanceSummary()
		} catch (error) {
			const endTime = Date.now()
			const duration = endTime - startTime

			// Update metrics for error case
			this.updatePerformanceMetrics(pattern.type, duration, 0, true)

			console.error(
				`Error in findAssetsByQuery [${pattern.type}]: ${error.message}`
			)
			throw error
		}
	}
}

function createWorkloadModule() {
	return new FindAssetsByQueryWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
