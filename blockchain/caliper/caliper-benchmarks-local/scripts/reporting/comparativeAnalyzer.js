/**
 * Comparative Analysis Utility for Blockchain Performance Testing
 * Provides comparison between different test runs and performance trend analysis
 */

const fs = require("fs")
const path = require("path")

class ComparativeAnalyzer {
	constructor(options = {}) {
		this.options = {
			reportsDir: options.reportsDir || "./reports",
			comparisonOutputDir:
				options.comparisonOutputDir || "./reports/comparisons",
			maxComparisons: options.maxComparisons || 10,
			...options,
		}

		this.ensureDirectories()
	}

	ensureDirectories() {
		if (!fs.existsSync(this.options.comparisonOutputDir)) {
			fs.mkdirSync(this.options.comparisonOutputDir, { recursive: true })
		}
	}

	/**
	 * Compare multiple test runs and generate comparative analysis
	 * @param {Array} testResults - Array of test result objects
	 * @param {Object} options - Comparison options
	 * @returns {Object} Comparative analysis results
	 */
	async compareTestRuns(testResults, options = {}) {
		if (testResults.length < 2) {
			throw new Error("At least 2 test runs are required for comparison")
		}

		const comparison = {
			metadata: this.generateComparisonMetadata(testResults),
			summary: this.generateComparativeSummary(testResults),
			metrics: this.compareMetrics(testResults),
			trends: this.analyzeTrends(testResults),
			recommendations: this.generateComparativeRecommendations(testResults),
			charts: this.generateComparisonCharts(testResults),
			timestamp: new Date().toISOString(),
		}

		// Save comparison results
		await this.saveComparison(comparison, options)

		return comparison
	}

	/**
	 * Generate metadata for the comparison
	 */
	generateComparisonMetadata(testResults) {
		return {
			testCount: testResults.length,
			dateRange: {
				earliest: Math.min(
					...testResults.map((r) =>
						new Date(r.timestamp || Date.now()).getTime()
					)
				),
				latest: Math.max(
					...testResults.map((r) =>
						new Date(r.timestamp || Date.now()).getTime()
					)
				),
			},
			testNames: testResults.map((r, i) => r.name || `Test ${i + 1}`),
			configurations: testResults.map((r) => ({
				name: r.name || "Unnamed Test",
				rounds: r.rounds ? r.rounds.length : 0,
				totalTransactions: this.calculateTotalTransactions(r),
			})),
		}
	}

	/**
	 * Generate comparative summary statistics
	 */
	generateComparativeSummary(testResults) {
		const summaries = testResults.map((result) =>
			this.calculateTestSummary(result)
		)

		return {
			tps: {
				values: summaries.map((s) => s.avgTps),
				best: Math.max(...summaries.map((s) => s.avgTps)),
				worst: Math.min(...summaries.map((s) => s.avgTps)),
				average:
					summaries.reduce((sum, s) => sum + s.avgTps, 0) / summaries.length,
				improvement: this.calculateImprovement(summaries.map((s) => s.avgTps)),
			},
			latency: {
				values: summaries.map((s) => s.avgLatency),
				best: Math.min(...summaries.map((s) => s.avgLatency)),
				worst: Math.max(...summaries.map((s) => s.avgLatency)),
				average:
					summaries.reduce((sum, s) => sum + s.avgLatency, 0) /
					summaries.length,
				improvement: this.calculateImprovement(
					summaries.map((s) => s.avgLatency),
					true
				), // true for lower is better
			},
			successRate: {
				values: summaries.map((s) => s.successRate),
				best: Math.max(...summaries.map((s) => s.successRate)),
				worst: Math.min(...summaries.map((s) => s.successRate)),
				average:
					summaries.reduce((sum, s) => sum + s.successRate, 0) /
					summaries.length,
				improvement: this.calculateImprovement(
					summaries.map((s) => s.successRate)
				),
			},
			errors: {
				values: summaries.map((s) => s.totalErrors),
				best: Math.min(...summaries.map((s) => s.totalErrors)),
				worst: Math.max(...summaries.map((s) => s.totalErrors)),
				total: summaries.reduce((sum, s) => sum + s.totalErrors, 0),
			},
		}
	}

	/**
	 * Compare specific metrics across test runs
	 */
	compareMetrics(testResults) {
		const metrics = {}

		// Extract all unique round labels across all tests
		const allRoundLabels = new Set()
		testResults.forEach((result) => {
			if (result.rounds) {
				result.rounds.forEach((round) => {
					allRoundLabels.add(round.label || "Unnamed Round")
				})
			}
		})

		// Compare metrics for each round type
		Array.from(allRoundLabels).forEach((roundLabel) => {
			const roundData = testResults
				.map((result) => {
					const round = result.rounds?.find(
						(r) => (r.label || "Unnamed Round") === roundLabel
					)
					return round ? this.extractRoundMetrics(round) : null
				})
				.filter((data) => data !== null)

			if (roundData.length > 1) {
				metrics[roundLabel] = this.compareRoundMetrics(roundData)
			}
		})

		return metrics
	}

	/**
	 * Analyze performance trends across test runs
	 */
	analyzeTrends(testResults) {
		const trends = {}

		// Sort test results by timestamp
		const sortedResults = testResults.sort((a, b) => {
			const timeA = new Date(a.timestamp || 0).getTime()
			const timeB = new Date(b.timestamp || 0).getTime()
			return timeA - timeB
		})

		const summaries = sortedResults.map((result) =>
			this.calculateTestSummary(result)
		)

		// TPS trend
		const tpsValues = summaries.map((s) => s.avgTps)
		trends.tps = this.calculateTrendAnalysis(tpsValues, "TPS")

		// Latency trend
		const latencyValues = summaries.map((s) => s.avgLatency)
		trends.latency = this.calculateTrendAnalysis(latencyValues, "Latency", true)

		// Success rate trend
		const successRateValues = summaries.map((s) => s.successRate)
		trends.successRate = this.calculateTrendAnalysis(
			successRateValues,
			"Success Rate"
		)

		// Error trend
		const errorValues = summaries.map((s) => s.totalErrors)
		trends.errors = this.calculateTrendAnalysis(errorValues, "Errors", true)

		return trends
	}

	/**
	 * Generate recommendations based on comparative analysis
	 */
	generateComparativeRecommendations(testResults) {
		const recommendations = []
		const summary = this.generateComparativeSummary(testResults)

		// TPS recommendations
		if (summary.tps.improvement < 0) {
			recommendations.push(
				`TPS performance has degraded by ${Math.abs(
					summary.tps.improvement
				).toFixed(1)}% - investigate recent changes`
			)
		} else if (summary.tps.improvement > 20) {
			recommendations.push(
				`Excellent TPS improvement of ${summary.tps.improvement.toFixed(
					1
				)}% - document successful optimizations`
			)
		}

		// Latency recommendations
		if (summary.latency.improvement < -20) {
			recommendations.push(
				`Latency has increased by ${Math.abs(
					summary.latency.improvement
				).toFixed(1)}% - review recent configuration changes`
			)
		} else if (summary.latency.improvement > 20) {
			recommendations.push(
				`Significant latency improvement of ${summary.latency.improvement.toFixed(
					1
				)}% - consider applying optimizations to production`
			)
		}

		// Success rate recommendations
		if (summary.successRate.improvement < -5) {
			recommendations.push(
				`Success rate has decreased by ${Math.abs(
					summary.successRate.improvement
				).toFixed(1)}% - investigate error causes`
			)
		}

		// Consistency recommendations
		const tpsVariance = this.calculateVariance(summary.tps.values)
		const avgTps = summary.tps.average
		if (avgTps > 0 && tpsVariance / (avgTps * avgTps) > 0.25) {
			recommendations.push(
				"High TPS variance detected across tests - work on performance consistency"
			)
		}

		// Best configuration identification
		const bestTestIndex = summary.tps.values.indexOf(summary.tps.best)
		const bestTest = testResults[bestTestIndex]
		if (bestTest) {
			recommendations.push(
				`Test "${
					bestTest.name || `Test ${bestTestIndex + 1}`
				}" showed best performance - analyze its configuration for optimization insights`
			)
		}

		return recommendations
	}

	/**
	 * Generate comparison charts data
	 */
	generateComparisonCharts(testResults) {
		const charts = {}
		const testNames = testResults.map((r, i) => r.name || `Test ${i + 1}`)

		// TPS comparison chart
		const tpsData = testResults.map(
			(result) => this.calculateTestSummary(result).avgTps
		)
		charts.tpsComparison = {
			type: "bar",
			title: "TPS Comparison Across Test Runs",
			labels: testNames,
			datasets: [
				{
					label: "Average TPS",
					data: tpsData,
					backgroundColor: "rgba(54, 162, 235, 0.6)",
					borderColor: "rgba(54, 162, 235, 1)",
					borderWidth: 1,
				},
			],
			legend: false,
		}

		// Latency comparison chart
		const latencyData = testResults.map(
			(result) => this.calculateTestSummary(result).avgLatency
		)
		charts.latencyComparison = {
			type: "bar",
			title: "Average Latency Comparison",
			labels: testNames,
			datasets: [
				{
					label: "Average Latency (ms)",
					data: latencyData,
					backgroundColor: "rgba(255, 99, 132, 0.6)",
					borderColor: "rgba(255, 99, 132, 1)",
					borderWidth: 1,
				},
			],
			legend: false,
		}

		// Success rate comparison chart
		const successRateData = testResults.map(
			(result) => this.calculateTestSummary(result).successRate
		)
		charts.successRateComparison = {
			type: "line",
			title: "Success Rate Trend",
			labels: testNames,
			datasets: [
				{
					label: "Success Rate (%)",
					data: successRateData,
					borderColor: "rgba(75, 192, 192, 1)",
					backgroundColor: "rgba(75, 192, 192, 0.2)",
					tension: 0.1,
				},
			],
			legend: false,
		}

		// Multi-metric comparison radar chart
		const normalizedData = this.normalizeMetricsForRadar(testResults)
		if (normalizedData.length > 0) {
			charts.multiMetricRadar = {
				type: "radar",
				title: "Multi-Metric Performance Comparison",
				labels: ["TPS", "Latency (inv)", "Success Rate", "Consistency"],
				datasets: normalizedData.map((data, index) => ({
					label: testNames[index],
					data: data,
					borderColor: this.getColorForIndex(index),
					backgroundColor: this.getColorForIndex(index, 0.2),
					pointBackgroundColor: this.getColorForIndex(index),
				})),
				legend: true,
			}
		}

		return charts
	}

	// Utility methods

	calculateTestSummary(result) {
		if (!result.rounds) {
			return {
				avgTps: 0,
				avgLatency: 0,
				successRate: 0,
				totalErrors: 0,
				totalTransactions: 0,
			}
		}

		const validRounds = result.rounds.filter((r) => r.performance?.throughput)

		if (validRounds.length === 0) {
			return {
				avgTps: 0,
				avgLatency: 0,
				successRate: 0,
				totalErrors: 0,
				totalTransactions: 0,
			}
		}

		const totalTransactions = validRounds.reduce(
			(sum, r) => sum + (r.performance.throughput.total || 0),
			0
		)
		const totalSuccessful = validRounds.reduce(
			(sum, r) => sum + (r.performance.throughput.successful || 0),
			0
		)
		const totalFailed = validRounds.reduce(
			(sum, r) => sum + (r.performance.throughput.failed || 0),
			0
		)

		const avgTps =
			validRounds.reduce(
				(sum, r) => sum + (r.performance.throughput.tps || 0),
				0
			) / validRounds.length
		const avgLatency =
			validRounds.reduce(
				(sum, r) => sum + (r.performance.latency?.avg || 0),
				0
			) / validRounds.length
		const successRate =
			totalTransactions > 0 ? (totalSuccessful / totalTransactions) * 100 : 0

		return {
			avgTps,
			avgLatency,
			successRate,
			totalErrors: totalFailed,
			totalTransactions,
		}
	}

	calculateTotalTransactions(result) {
		if (!result.rounds) return 0
		return result.rounds.reduce((sum, round) => {
			return sum + (round.performance?.throughput?.total || 0)
		}, 0)
	}

	calculateImprovement(values, lowerIsBetter = false) {
		if (values.length < 2) return 0

		const first = values[0]
		const last = values[values.length - 1]

		if (first === 0) return 0

		const improvement = ((last - first) / first) * 100
		return lowerIsBetter ? -improvement : improvement
	}

	calculateTrendAnalysis(values, metricName, lowerIsBetter = false) {
		if (values.length < 2) {
			return {
				trend: "insufficient_data",
				description: `Insufficient data points for ${metricName} trend analysis`,
			}
		}

		const improvement = this.calculateImprovement(values, lowerIsBetter)
		const variance = this.calculateVariance(values)
		const mean = values.reduce((sum, val) => sum + val, 0) / values.length
		const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 0

		let trend, description

		if (Math.abs(improvement) < 5) {
			trend = "stable"
			description = `${metricName} remains stable with ${improvement.toFixed(
				1
			)}% change`
		} else if (improvement > 0) {
			trend = lowerIsBetter ? "degrading" : "improving"
			description = `${metricName} ${trend} by ${Math.abs(improvement).toFixed(
				1
			)}%`
		} else {
			trend = lowerIsBetter ? "improving" : "degrading"
			description = `${metricName} ${trend} by ${Math.abs(improvement).toFixed(
				1
			)}%`
		}

		if (coefficientOfVariation > 0.3) {
			description += ` with high variability (CV: ${(
				coefficientOfVariation * 100
			).toFixed(1)}%)`
		}

		return { trend, description, improvement, variance: coefficientOfVariation }
	}

	extractRoundMetrics(round) {
		if (!round.performance) return null

		return {
			tps: round.performance.throughput?.tps || 0,
			latency: round.performance.latency?.avg || 0,
			successRate:
				round.performance.throughput?.total > 0
					? (round.performance.throughput.successful /
							round.performance.throughput.total) *
					  100
					: 0,
			totalTransactions: round.performance.throughput?.total || 0,
			errors: round.performance.throughput?.failed || 0,
		}
	}

	compareRoundMetrics(roundDataArray) {
		const metrics = [
			"tps",
			"latency",
			"successRate",
			"totalTransactions",
			"errors",
		]
		const comparison = {}

		metrics.forEach((metric) => {
			const values = roundDataArray.map((data) => data[metric])
			comparison[metric] = {
				values: values,
				best:
					metric === "latency" || metric === "errors"
						? Math.min(...values)
						: Math.max(...values),
				worst:
					metric === "latency" || metric === "errors"
						? Math.max(...values)
						: Math.min(...values),
				average: values.reduce((sum, val) => sum + val, 0) / values.length,
				variance: this.calculateVariance(values),
			}
		})

		return comparison
	}

	calculateVariance(values) {
		if (values.length === 0) return 0
		const mean = values.reduce((sum, val) => sum + val, 0) / values.length
		return (
			values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
			values.length
		)
	}

	normalizeMetricsForRadar(testResults) {
		const summaries = testResults.map((result) =>
			this.calculateTestSummary(result)
		)

		// Extract values for normalization
		const tpsValues = summaries.map((s) => s.avgTps)
		const latencyValues = summaries.map((s) => s.avgLatency)
		const successRateValues = summaries.map((s) => s.successRate)

		// Calculate consistency scores (inverse of coefficient of variation)
		const consistencyScores = testResults.map((result) => {
			if (!result.rounds) return 0
			const tpsVariance = this.calculateVariance(
				result.rounds.map((r) => r.performance?.throughput?.tps || 0)
			)
			const avgTps = summaries[testResults.indexOf(result)].avgTps
			return avgTps > 0
				? Math.max(0, 100 - (Math.sqrt(tpsVariance) / avgTps) * 100)
				: 0
		})

		// Normalize to 0-100 scale
		const maxTps = Math.max(...tpsValues)
		const maxLatency = Math.max(...latencyValues)
		const maxSuccessRate = Math.max(...successRateValues)
		const maxConsistency = Math.max(...consistencyScores)

		return summaries.map((summary, index) => [
			maxTps > 0 ? (summary.avgTps / maxTps) * 100 : 0,
			maxLatency > 0
				? ((maxLatency - summary.avgLatency) / maxLatency) * 100
				: 100, // Inverted for latency
			maxSuccessRate > 0 ? (summary.successRate / maxSuccessRate) * 100 : 0,
			maxConsistency > 0
				? (consistencyScores[index] / maxConsistency) * 100
				: 0,
		])
	}

	getColorForIndex(index, alpha = 1) {
		const colors = [
			`rgba(54, 162, 235, ${alpha})`,
			`rgba(255, 99, 132, ${alpha})`,
			`rgba(75, 192, 192, ${alpha})`,
			`rgba(255, 206, 86, ${alpha})`,
			`rgba(153, 102, 255, ${alpha})`,
			`rgba(255, 159, 64, ${alpha})`,
		]
		return colors[index % colors.length]
	}

	async saveComparison(comparison, options = {}) {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
		const filename = options.filename || `comparison-${timestamp}.json`
		const filePath = path.join(this.options.comparisonOutputDir, filename)

		fs.writeFileSync(filePath, JSON.stringify(comparison, null, 2))

		console.log(`Comparison analysis saved: ${filePath}`)
		return filePath
	}

	/**
	 * Load and compare historical test results
	 */
	async compareHistoricalResults(limit = 5) {
		const reportsDir = this.options.reportsDir

		if (!fs.existsSync(reportsDir)) {
			throw new Error(`Reports directory not found: ${reportsDir}`)
		}

		// Find JSON result files
		const files = fs
			.readdirSync(reportsDir)
			.filter((file) => file.endsWith(".json") && file.includes("result"))
			.sort()
			.slice(-limit)

		if (files.length < 2) {
			throw new Error(
				"At least 2 historical result files are required for comparison"
			)
		}

		const testResults = []
		for (const file of files) {
			try {
				const filePath = path.join(reportsDir, file)
				const content = fs.readFileSync(filePath, "utf8")
				const result = JSON.parse(content)
				result.name = file.replace(".json", "")
				testResults.push(result)
			} catch (error) {
				console.warn(`Could not load result file ${file}:`, error.message)
			}
		}

		return this.compareTestRuns(testResults)
	}
}

module.exports = { ComparativeAnalyzer }
