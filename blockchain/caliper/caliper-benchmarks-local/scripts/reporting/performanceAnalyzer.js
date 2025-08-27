/**
 * Performance Analysis Utilities for Blockchain Benchmarking
 * Provides statistical analysis, bottleneck identification, and performance recommendations
 */

const fs = require("fs")
const path = require("path")
const { StatisticalAnalyzer } = require("./statisticalAnalyzer")
const { BottleneckAnalyzer } = require("./bottleneckAnalyzer")
const { RegressionDetector } = require("./regressionDetector")

class PerformanceAnalyzer {
	constructor(options = {}) {
		this.options = {
			thresholds: {
				tpsWarning: 10,
				tpsCritical: 5,
				latencyWarning: 1000, // ms
				latencyCritical: 5000, // ms
				successRateWarning: 95, // %
				successRateCritical: 90, // %
				...options.thresholds,
			},
			historicalDataPath: options.historicalDataPath || "./reports/historical",
			...options,
		}

		// Initialize specialized analyzers
		this.statisticalAnalyzer = new StatisticalAnalyzer()
		this.bottleneckAnalyzer = new BottleneckAnalyzer(this.options)
		this.regressionDetector = new RegressionDetector(this.options)

		this.ensureHistoricalDirectory()
	}

	ensureHistoricalDirectory() {
		if (!fs.existsSync(this.options.historicalDataPath)) {
			fs.mkdirSync(this.options.historicalDataPath, { recursive: true })
		}
	}

	/**
	 * Analyze performance results and provide insights
	 * @param {Object} results - Caliper benchmark results
	 * @returns {Object} Analysis results with bottlenecks, recommendations, and trends
	 */
	async analyzeResults(results) {
		// Use specialized analyzers for comprehensive analysis
		const bottleneckAnalysis =
			this.bottleneckAnalyzer.analyzeBottlenecks(results)
		const regressionAnalysis = await this.regressionDetector.detectRegressions(
			results
		)

		const analysis = {
			bottlenecks: bottleneckAnalysis.bottlenecks,
			bottleneckDetails: bottleneckAnalysis,
			recommendations: this.generateRecommendations(
				results,
				bottleneckAnalysis
			),
			trends: await this.analyzeTrends(results),
			statistics: this.calculateStatistics(results),
			regressions: regressionAnalysis.regressions,
			regressionDetails: regressionAnalysis,
			alerts: this.generateAlerts(
				results,
				bottleneckAnalysis,
				regressionAnalysis
			),
		}

		// Save results for historical analysis
		await this.saveHistoricalData(results, analysis)

		return analysis
	}

	/**
	 * Identify performance bottlenecks in the system
	 */
	identifyBottlenecks(results) {
		const bottlenecks = []

		if (!results.rounds) return bottlenecks

		// Analyze each round for bottlenecks
		results.rounds.forEach((round, index) => {
			const perf = round.performance
			if (!perf) return

			const roundLabel = round.label || `Round ${index + 1}`

			// TPS bottlenecks
			if (perf.throughput?.tps < this.options.thresholds.tpsCritical) {
				bottlenecks.push(
					`Critical TPS bottleneck in ${roundLabel}: ${perf.throughput.tps.toFixed(
						2
					)} TPS (below ${this.options.thresholds.tpsCritical})`
				)
			} else if (perf.throughput?.tps < this.options.thresholds.tpsWarning) {
				bottlenecks.push(
					`TPS performance concern in ${roundLabel}: ${perf.throughput.tps.toFixed(
						2
					)} TPS (below ${this.options.thresholds.tpsWarning})`
				)
			}

			// Latency bottlenecks
			if (perf.latency?.avg > this.options.thresholds.latencyCritical) {
				bottlenecks.push(
					`Critical latency bottleneck in ${roundLabel}: ${perf.latency.avg.toFixed(
						2
					)}ms average (above ${this.options.thresholds.latencyCritical}ms)`
				)
			} else if (perf.latency?.avg > this.options.thresholds.latencyWarning) {
				bottlenecks.push(
					`Latency performance concern in ${roundLabel}: ${perf.latency.avg.toFixed(
						2
					)}ms average (above ${this.options.thresholds.latencyWarning}ms)`
				)
			}

			// High percentile latency issues
			if (perf.latency?.percentile?.["99"] > perf.latency?.avg * 5) {
				bottlenecks.push(
					`High latency variance in ${roundLabel}: 99th percentile (${perf.latency.percentile[
						"99"
					].toFixed(2)}ms) is ${(
						perf.latency.percentile["99"] / perf.latency.avg
					).toFixed(1)}x average`
				)
			}

			// Success rate bottlenecks
			const successRate =
				perf.throughput?.total > 0
					? (perf.throughput.successful / perf.throughput.total) * 100
					: 0
			if (successRate < this.options.thresholds.successRateCritical) {
				bottlenecks.push(
					`Critical success rate issue in ${roundLabel}: ${successRate.toFixed(
						1
					)}% (below ${this.options.thresholds.successRateCritical}%)`
				)
			} else if (successRate < this.options.thresholds.successRateWarning) {
				bottlenecks.push(
					`Success rate concern in ${roundLabel}: ${successRate.toFixed(
						1
					)}% (below ${this.options.thresholds.successRateWarning}%)`
				)
			}

			// Error pattern analysis
			if (round.errors && round.errors.length > 0) {
				const errorTypes = this.categorizeErrors(round.errors)
				Object.entries(errorTypes).forEach(([type, errors]) => {
					if (errors.length > 0) {
						bottlenecks.push(
							`${type} errors detected in ${roundLabel}: ${errors.length} occurrences`
						)
					}
				})
			}
		})

		// Cross-round analysis
		const tpsVariance = this.calculateTpsVariance(results)
		if (tpsVariance > 0.5) {
			bottlenecks.push(
				`High TPS variance across rounds: ${(tpsVariance * 100).toFixed(
					1
				)}% coefficient of variation indicates inconsistent performance`
			)
		}

		return bottlenecks
	}

	/**
	 * Generate performance improvement recommendations
	 */
	generateRecommendations(
		results,
		bottleneckAnalysis = null,
		regressionAnalysis = null
	) {
		const recommendations = []

		if (!results.rounds) return recommendations

		const stats = this.calculateStatistics(results)

		// Include recommendations from bottleneck analysis
		if (bottleneckAnalysis && bottleneckAnalysis.recommendations) {
			recommendations.push(...bottleneckAnalysis.recommendations)
		}

		// Include recommendations from regression analysis
		if (regressionAnalysis && regressionAnalysis.recommendations) {
			recommendations.push(...regressionAnalysis.recommendations)
		}

		// TPS recommendations
		if (stats.avgTps < this.options.thresholds.tpsWarning) {
			recommendations.push(
				"Consider increasing worker count or optimizing chaincode logic to improve transaction throughput"
			)
			recommendations.push(
				"Review network configuration and ensure adequate peer resources (CPU, memory)"
			)
			recommendations.push(
				"Analyze endorsement policy complexity and consider optimization"
			)
		}

		// Latency recommendations
		if (stats.avgLatency > this.options.thresholds.latencyWarning) {
			recommendations.push(
				"Investigate network latency between Caliper and blockchain nodes"
			)
			recommendations.push(
				"Consider optimizing chaincode execution time and database queries"
			)
			recommendations.push(
				"Review block creation time and transaction batching configuration"
			)
		}

		// High latency variance recommendations
		if (stats.latencyVariance > stats.avgLatency * 2) {
			recommendations.push(
				"High latency variance detected - investigate intermittent performance issues"
			)
			recommendations.push(
				"Consider implementing connection pooling and load balancing"
			)
			recommendations.push(
				"Review system resource utilization patterns during peak loads"
			)
		}

		// Error-based recommendations
		const totalErrors = results.rounds.reduce(
			(sum, round) => sum + (round.errors?.length || 0),
			0
		)
		if (totalErrors > 0) {
			recommendations.push(
				"Address identified errors to improve overall system reliability"
			)
			recommendations.push(
				"Implement proper error handling and retry mechanisms in workload modules"
			)
			recommendations.push(
				"Review chaincode validation logic and input data quality"
			)
		}

		// Success rate recommendations
		if (stats.avgSuccessRate < this.options.thresholds.successRateWarning) {
			recommendations.push(
				"Investigate causes of transaction failures and implement appropriate fixes"
			)
			recommendations.push(
				"Review timeout configurations and adjust based on network conditions"
			)
			recommendations.push(
				"Consider implementing exponential backoff for failed transactions"
			)
		}

		// Scalability recommendations
		const rounds = results.rounds.filter((r) => r.performance?.throughput?.tps)
		if (rounds.length > 1) {
			const tpsGrowth = this.calculateTpsGrowthRate(rounds)
			if (tpsGrowth < 0.5) {
				recommendations.push(
					"TPS scaling appears sublinear - investigate resource constraints and bottlenecks"
				)
				recommendations.push(
					"Consider horizontal scaling of blockchain network components"
				)
				recommendations.push(
					"Review database performance and consider optimization strategies"
				)
			}
		}

		// Resource utilization recommendations
		recommendations.push(
			"Monitor system resource utilization (CPU, memory, disk I/O) during tests"
		)
		recommendations.push(
			"Consider implementing performance monitoring and alerting for production environments"
		)
		recommendations.push(
			"Establish baseline performance metrics for regression testing"
		)

		return recommendations
	}

	/**
	 * Analyze performance trends over time
	 */
	async analyzeTrends(results) {
		const historicalData = await this.loadHistoricalData()

		if (historicalData.length < 2) {
			return "Insufficient historical data for trend analysis. Run more tests to establish trends."
		}

		const trends = []

		// TPS trend analysis
		const tpsTrend = this.calculateTrend(
			historicalData.map((d) => d.stats.avgTps)
		)
		if (tpsTrend.slope > 0.1) {
			trends.push(
				`TPS showing positive trend: ${(tpsTrend.slope * 100).toFixed(
					1
				)}% improvement per test`
			)
		} else if (tpsTrend.slope < -0.1) {
			trends.push(
				`TPS showing negative trend: ${(Math.abs(tpsTrend.slope) * 100).toFixed(
					1
				)}% degradation per test`
			)
		} else {
			trends.push("TPS performance remains stable across recent tests")
		}

		// Latency trend analysis
		const latencyTrend = this.calculateTrend(
			historicalData.map((d) => d.stats.avgLatency)
		)
		if (latencyTrend.slope > 10) {
			trends.push(
				`Latency showing concerning upward trend: ${latencyTrend.slope.toFixed(
					1
				)}ms increase per test`
			)
		} else if (latencyTrend.slope < -10) {
			trends.push(
				`Latency showing positive improvement: ${Math.abs(
					latencyTrend.slope
				).toFixed(1)}ms reduction per test`
			)
		} else {
			trends.push("Latency performance remains stable across recent tests")
		}

		return trends.join(". ")
	}

	/**
	 * Calculate comprehensive performance statistics
	 */
	calculateStatistics(results) {
		if (!results.rounds) return {}

		const validRounds = results.rounds.filter((r) => r.performance?.throughput)

		const tpsValues = validRounds.map((r) => r.performance.throughput.tps)
		const latencyValues = validRounds.map(
			(r) => r.performance.latency?.avg || 0
		)
		const successRates = validRounds.map((r) => {
			const throughput = r.performance.throughput
			return throughput.total > 0
				? (throughput.successful / throughput.total) * 100
				: 0
		})

		return {
			avgTps: this.calculateMean(tpsValues),
			medianTps: this.calculateMedian(tpsValues),
			tpsStdDev: this.calculateStandardDeviation(tpsValues),
			tpsVariance: this.calculateVariance(tpsValues),

			avgLatency: this.calculateMean(latencyValues),
			medianLatency: this.calculateMedian(latencyValues),
			latencyStdDev: this.calculateStandardDeviation(latencyValues),
			latencyVariance: this.calculateVariance(latencyValues),

			avgSuccessRate: this.calculateMean(successRates),
			minSuccessRate: Math.min(...successRates),
			maxSuccessRate: Math.max(...successRates),

			totalTransactions: validRounds.reduce(
				(sum, r) => sum + r.performance.throughput.total,
				0
			),
			totalErrors: validRounds.reduce(
				(sum, r) => sum + r.performance.throughput.failed,
				0
			),
		}
	}

	/**
	 * Detect performance regressions compared to historical data
	 */
	async detectRegressions(results) {
		const historicalData = await this.loadHistoricalData()
		const regressions = []

		if (historicalData.length === 0) {
			return regressions
		}

		const currentStats = this.calculateStatistics(results)
		const historicalStats = historicalData[historicalData.length - 1].stats

		// TPS regression detection
		const tpsRegression =
			((historicalStats.avgTps - currentStats.avgTps) /
				historicalStats.avgTps) *
			100
		if (tpsRegression > 10) {
			regressions.push(
				`TPS regression detected: ${tpsRegression.toFixed(
					1
				)}% decrease from previous test`
			)
		}

		// Latency regression detection
		const latencyRegression =
			((currentStats.avgLatency - historicalStats.avgLatency) /
				historicalStats.avgLatency) *
			100
		if (latencyRegression > 20) {
			regressions.push(
				`Latency regression detected: ${latencyRegression.toFixed(
					1
				)}% increase from previous test`
			)
		}

		// Success rate regression detection
		const successRateRegression =
			historicalStats.avgSuccessRate - currentStats.avgSuccessRate
		if (successRateRegression > 5) {
			regressions.push(
				`Success rate regression detected: ${successRateRegression.toFixed(
					1
				)}% decrease from previous test`
			)
		}

		return regressions
	}

	/**
	 * Generate performance alerts based on thresholds
	 */
	generateAlerts(
		results,
		bottleneckAnalysis = null,
		regressionAnalysis = null
	) {
		const alerts = []
		const stats = this.calculateStatistics(results)

		// Include alerts from bottleneck analysis
		if (bottleneckAnalysis && bottleneckAnalysis.categories) {
			Object.values(bottleneckAnalysis.categories)
				.flat()
				.forEach((bottleneck) => {
					if (
						bottleneck.severity === "high" ||
						bottleneck.severity === "critical"
					) {
						alerts.push({
							level: bottleneck.severity,
							type: "bottleneck",
							message: bottleneck.description,
							category: bottleneck.type,
							impact: bottleneck.impact,
						})
					}
				})
		}

		// Include alerts from regression analysis
		if (regressionAnalysis && regressionAnalysis.regressions) {
			regressionAnalysis.regressions.forEach((regression) => {
				if (
					regression.severity === "high" ||
					regression.severity === "critical"
				) {
					alerts.push({
						level: regression.severity,
						type: "regression",
						message: regression.description,
						metric: regression.metric,
						impact: regression.impact,
					})
				}
			})
		}

		if (stats.avgTps < this.options.thresholds.tpsCritical) {
			alerts.push({
				level: "critical",
				message: `TPS below critical threshold: ${stats.avgTps.toFixed(2)} < ${
					this.options.thresholds.tpsCritical
				}`,
				metric: "tps",
				value: stats.avgTps,
				threshold: this.options.thresholds.tpsCritical,
			})
		}

		if (stats.avgLatency > this.options.thresholds.latencyCritical) {
			alerts.push({
				level: "critical",
				message: `Latency above critical threshold: ${stats.avgLatency.toFixed(
					2
				)}ms > ${this.options.thresholds.latencyCritical}ms`,
				metric: "latency",
				value: stats.avgLatency,
				threshold: this.options.thresholds.latencyCritical,
			})
		}

		if (stats.avgSuccessRate < this.options.thresholds.successRateCritical) {
			alerts.push({
				level: "critical",
				message: `Success rate below critical threshold: ${stats.avgSuccessRate.toFixed(
					1
				)}% < ${this.options.thresholds.successRateCritical}%`,
				metric: "successRate",
				value: stats.avgSuccessRate,
				threshold: this.options.thresholds.successRateCritical,
			})
		}

		return alerts
	}

	// Utility methods for statistical calculations

	calculateMean(values) {
		if (values.length === 0) return 0
		return values.reduce((sum, val) => sum + val, 0) / values.length
	}

	calculateMedian(values) {
		if (values.length === 0) return 0
		const sorted = [...values].sort((a, b) => a - b)
		const mid = Math.floor(sorted.length / 2)
		return sorted.length % 2 === 0
			? (sorted[mid - 1] + sorted[mid]) / 2
			: sorted[mid]
	}

	calculateStandardDeviation(values) {
		if (values.length === 0) return 0
		const mean = this.calculateMean(values)
		const squaredDiffs = values.map((val) => Math.pow(val - mean, 2))
		return Math.sqrt(this.calculateMean(squaredDiffs))
	}

	calculateVariance(values) {
		if (values.length === 0) return 0
		const mean = this.calculateMean(values)
		return this.calculateMean(values.map((val) => Math.pow(val - mean, 2)))
	}

	calculateTpsVariance(results) {
		if (!results.rounds) return 0
		const tpsValues = results.rounds
			.filter((r) => r.performance?.throughput?.tps)
			.map((r) => r.performance.throughput.tps)

		if (tpsValues.length === 0) return 0

		const mean = this.calculateMean(tpsValues)
		const stdDev = this.calculateStandardDeviation(tpsValues)
		return mean > 0 ? stdDev / mean : 0 // Coefficient of variation
	}

	calculateTpsGrowthRate(rounds) {
		if (rounds.length < 2) return 0

		const firstTps = rounds[0].performance.throughput.tps
		const lastTps = rounds[rounds.length - 1].performance.throughput.tps

		return firstTps > 0 ? (lastTps - firstTps) / firstTps : 0
	}

	calculateTrend(values) {
		if (values.length < 2) return { slope: 0, intercept: 0 }

		const n = values.length
		const x = Array.from({ length: n }, (_, i) => i)
		const sumX = x.reduce((a, b) => a + b, 0)
		const sumY = values.reduce((a, b) => a + b, 0)
		const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0)
		const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)

		const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
		const intercept = (sumY - slope * sumX) / n

		return { slope, intercept }
	}

	categorizeErrors(errors) {
		const categories = {
			network: [],
			chaincode: [],
			timeout: [],
			authorization: [],
			other: [],
		}

		errors.forEach((error) => {
			const errorMsg = error.message || error.toString()
			if (errorMsg.includes("timeout") || errorMsg.includes("TIMEOUT")) {
				categories.timeout.push(error)
			} else if (
				errorMsg.includes("network") ||
				errorMsg.includes("connection")
			) {
				categories.network.push(error)
			} else if (
				errorMsg.includes("chaincode") ||
				errorMsg.includes("endorsement")
			) {
				categories.chaincode.push(error)
			} else if (
				errorMsg.includes("authorization") ||
				errorMsg.includes("access")
			) {
				categories.authorization.push(error)
			} else {
				categories.other.push(error)
			}
		})

		return categories
	}

	// Historical data management

	async saveHistoricalData(results, analysis) {
		const timestamp = new Date().toISOString()
		const historicalEntry = {
			timestamp,
			stats: this.calculateStatistics(results),
			analysis: {
				bottlenecks: analysis.bottlenecks,
				alerts: analysis.alerts,
			},
		}

		const filePath = path.join(
			this.options.historicalDataPath,
			"performance-history.json"
		)

		let historicalData = []
		if (fs.existsSync(filePath)) {
			try {
				const content = fs.readFileSync(filePath, "utf8")
				historicalData = JSON.parse(content)
			} catch (error) {
				console.warn("Could not read historical data:", error.message)
			}
		}

		historicalData.push(historicalEntry)

		// Keep only last 50 entries to prevent file from growing too large
		if (historicalData.length > 50) {
			historicalData = historicalData.slice(-50)
		}

		fs.writeFileSync(filePath, JSON.stringify(historicalData, null, 2))
	}

	async loadHistoricalData() {
		const filePath = path.join(
			this.options.historicalDataPath,
			"performance-history.json"
		)

		if (!fs.existsSync(filePath)) {
			return []
		}

		try {
			const content = fs.readFileSync(filePath, "utf8")
			return JSON.parse(content)
		} catch (error) {
			console.warn("Could not load historical data:", error.message)
			return []
		}
	}
}

module.exports = { PerformanceAnalyzer }
