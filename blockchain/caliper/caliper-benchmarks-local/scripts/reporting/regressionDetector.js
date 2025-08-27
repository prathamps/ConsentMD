/**
 * Performance Regression Detection Engine
 * Detects performance regressions and provides alerting capabilities
 */

const fs = require("fs")
const path = require("path")
const { StatisticalAnalyzer } = require("./statisticalAnalyzer")

class RegressionDetector {
	constructor(options = {}) {
		this.options = {
			historicalDataPath: options.historicalDataPath || "./reports/historical",
			regressionThresholds: {
				tpsRegression: 0.15, // 15% TPS decrease
				latencyRegression: 0.2, // 20% latency increase
				successRateRegression: 0.05, // 5% success rate decrease
				significanceLevel: 0.05, // Statistical significance level
				minHistoricalSamples: 3, // Minimum samples for regression analysis
				...options.regressionThresholds,
			},
			alerting: {
				enabled: options.alerting?.enabled || false,
				webhookUrl: options.alerting?.webhookUrl,
				emailConfig: options.alerting?.emailConfig,
				...options.alerting,
			},
			...options,
		}

		this.statisticalAnalyzer = new StatisticalAnalyzer()
		this.ensureHistoricalDirectory()
	}

	ensureHistoricalDirectory() {
		if (!fs.existsSync(this.options.historicalDataPath)) {
			fs.mkdirSync(this.options.historicalDataPath, { recursive: true })
		}
	}

	/**
	 * Detect performance regressions in current results compared to historical data
	 * @param {Object} currentResults - Current test results
	 * @param {Object} options - Detection options
	 * @returns {Object} Regression analysis results
	 */
	async detectRegressions(currentResults, options = {}) {
		const historicalData = await this.loadHistoricalData()

		if (
			historicalData.length <
			this.options.regressionThresholds.minHistoricalSamples
		) {
			return {
				status: "insufficient_data",
				message: `Insufficient historical data for regression analysis (${historicalData.length} samples, need ${this.options.regressionThresholds.minHistoricalSamples})`,
				regressions: [],
				baseline: null,
				current: this.extractMetrics(currentResults),
			}
		}

		const baseline = this.calculateBaseline(historicalData)
		const current = this.extractMetrics(currentResults)

		const regressions = this.analyzeRegressions(baseline, current)

		const analysis = {
			status:
				regressions.length > 0 ? "regressions_detected" : "no_regressions",
			timestamp: new Date().toISOString(),
			baseline: baseline,
			current: current,
			regressions: regressions,
			summary: this.generateRegressionSummary(regressions),
			recommendations: this.generateRegressionRecommendations(regressions),
		}

		// Save current results to historical data
		await this.saveCurrentResults(currentResults, analysis)

		// Send alerts if regressions detected
		if (regressions.length > 0 && this.options.alerting.enabled) {
			await this.sendRegressionAlerts(analysis)
		}

		return analysis
	}

	extractMetrics(results) {
		if (!results.rounds || results.rounds.length === 0) {
			return {
				avgTps: 0,
				avgLatency: 0,
				successRate: 0,
				totalTransactions: 0,
				totalErrors: 0,
				timestamp: new Date().toISOString(),
			}
		}

		const validRounds = results.rounds.filter((r) => r.performance?.throughput)

		if (validRounds.length === 0) {
			return {
				avgTps: 0,
				avgLatency: 0,
				successRate: 0,
				totalTransactions: 0,
				totalErrors: 0,
				timestamp: new Date().toISOString(),
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
			avgTps: parseFloat(avgTps.toFixed(2)),
			avgLatency: parseFloat(avgLatency.toFixed(2)),
			successRate: parseFloat(successRate.toFixed(2)),
			totalTransactions: totalTransactions,
			totalErrors: totalFailed,
			timestamp: new Date().toISOString(),
		}
	}

	calculateBaseline(historicalData) {
		if (historicalData.length === 0) return null

		// Use recent historical data for baseline (last 10 samples or all if less)
		const recentData = historicalData.slice(-10)

		const tpsValues = recentData.map((d) => d.metrics.avgTps)
		const latencyValues = recentData.map((d) => d.metrics.avgLatency)
		const successRateValues = recentData.map((d) => d.metrics.successRate)

		return {
			avgTps: {
				mean: this.statisticalAnalyzer.mean(tpsValues),
				stdDev: this.statisticalAnalyzer.standardDeviation(tpsValues),
				min: Math.min(...tpsValues),
				max: Math.max(...tpsValues),
				samples: tpsValues.length,
			},
			avgLatency: {
				mean: this.statisticalAnalyzer.mean(latencyValues),
				stdDev: this.statisticalAnalyzer.standardDeviation(latencyValues),
				min: Math.min(...latencyValues),
				max: Math.max(...latencyValues),
				samples: latencyValues.length,
			},
			successRate: {
				mean: this.statisticalAnalyzer.mean(successRateValues),
				stdDev: this.statisticalAnalyzer.standardDeviation(successRateValues),
				min: Math.min(...successRateValues),
				max: Math.max(...successRateValues),
				samples: successRateValues.length,
			},
			sampleCount: recentData.length,
			dateRange: {
				from: recentData[0].timestamp,
				to: recentData[recentData.length - 1].timestamp,
			},
		}
	}

	analyzeRegressions(baseline, current) {
		const regressions = []

		// TPS regression analysis
		const tpsRegression = this.detectMetricRegression(
			baseline.avgTps,
			current.avgTps,
			"tps",
			this.options.regressionThresholds.tpsRegression,
			false // lower is worse
		)
		if (tpsRegression) regressions.push(tpsRegression)

		// Latency regression analysis
		const latencyRegression = this.detectMetricRegression(
			baseline.avgLatency,
			current.avgLatency,
			"latency",
			this.options.regressionThresholds.latencyRegression,
			true // higher is worse
		)
		if (latencyRegression) regressions.push(latencyRegression)

		// Success rate regression analysis
		const successRateRegression = this.detectMetricRegression(
			baseline.successRate,
			current.successRate,
			"successRate",
			this.options.regressionThresholds.successRateRegression,
			false // lower is worse
		)
		if (successRateRegression) regressions.push(successRateRegression)

		return regressions
	}

	detectMetricRegression(
		baselineMetric,
		currentValue,
		metricName,
		threshold,
		higherIsWorse = false
	) {
		const baselineMean = baselineMetric.mean
		const baselineStdDev = baselineMetric.stdDev

		if (baselineMean === 0) return null

		// Calculate percentage change
		const percentageChange = (currentValue - baselineMean) / baselineMean
		const absoluteChange = Math.abs(percentageChange)

		// Determine if this is a regression based on direction
		const isRegression = higherIsWorse
			? percentageChange > threshold
			: percentageChange < -threshold

		if (!isRegression) return null

		// Calculate statistical significance using z-score
		const zScore =
			baselineStdDev > 0 ? (currentValue - baselineMean) / baselineStdDev : 0
		const isStatisticallySignificant = Math.abs(zScore) > 1.96 // 95% confidence

		// Determine severity
		let severity = "low"
		if (absoluteChange > threshold * 2) {
			severity = "critical"
		} else if (absoluteChange > threshold * 1.5) {
			severity = "high"
		} else if (absoluteChange > threshold) {
			severity = "medium"
		}

		return {
			metric: metricName,
			severity: severity,
			percentageChange: parseFloat((percentageChange * 100).toFixed(2)),
			absoluteChange: parseFloat(
				Math.abs(currentValue - baselineMean).toFixed(2)
			),
			currentValue: currentValue,
			baselineValue: parseFloat(baselineMean.toFixed(2)),
			threshold: threshold * 100,
			zScore: parseFloat(zScore.toFixed(2)),
			statisticallySignificant: isStatisticallySignificant,
			description: this.generateRegressionDescription(
				metricName,
				percentageChange,
				severity
			),
			impact: this.assessRegressionImpact(
				metricName,
				percentageChange,
				severity
			),
			possibleCauses: this.identifyPossibleCauses(metricName, percentageChange),
		}
	}

	generateRegressionDescription(metricName, percentageChange, severity) {
		const direction = percentageChange > 0 ? "increased" : "decreased"
		const metricDisplayName =
			{
				tps: "TPS",
				latency: "Average Latency",
				successRate: "Success Rate",
			}[metricName] || metricName

		return `${metricDisplayName} has ${direction} by ${Math.abs(
			percentageChange * 100
		).toFixed(1)}% (${severity} severity)`
	}

	assessRegressionImpact(metricName, percentageChange, severity) {
		const impacts = {
			tps: {
				critical: "Severe throughput degradation affecting system capacity",
				high: "Significant throughput reduction impacting performance",
				medium: "Moderate throughput decrease affecting efficiency",
				low: "Minor throughput reduction with limited impact",
			},
			latency: {
				critical:
					"Critical latency increase severely affecting user experience",
				high: "High latency increase significantly impacting responsiveness",
				medium: "Moderate latency increase affecting user experience",
				low: "Minor latency increase with minimal user impact",
			},
			successRate: {
				critical: "Critical success rate drop affecting system reliability",
				high: "Significant success rate decrease impacting system stability",
				medium: "Moderate success rate reduction affecting reliability",
				low: "Minor success rate decrease with limited impact",
			},
		}

		return impacts[metricName]?.[severity] || "Performance regression detected"
	}

	identifyPossibleCauses(metricName, percentageChange) {
		const causes = {
			tps: [
				"Increased system load or resource contention",
				"Network configuration changes",
				"Database performance degradation",
				"Chaincode optimization regressions",
				"Infrastructure resource limitations",
			],
			latency: [
				"Network latency increases",
				"Database query performance issues",
				"Chaincode execution inefficiencies",
				"Resource contention or bottlenecks",
				"Configuration changes affecting performance",
			],
			successRate: [
				"Increased error rates in chaincode",
				"Network connectivity issues",
				"Resource exhaustion or timeouts",
				"Configuration or deployment issues",
				"Data validation or business logic changes",
			],
		}

		return causes[metricName] || ["Unknown performance regression cause"]
	}

	generateRegressionSummary(regressions) {
		if (regressions.length === 0) {
			return {
				status: "no_regressions",
				message: "No performance regressions detected",
				criticalCount: 0,
				highCount: 0,
				mediumCount: 0,
				lowCount: 0,
			}
		}

		const severityCounts = regressions.reduce(
			(counts, regression) => {
				counts[regression.severity]++
				return counts
			},
			{ critical: 0, high: 0, medium: 0, low: 0 }
		)

		let status = "regressions_detected"
		if (severityCounts.critical > 0) status = "critical_regressions"
		else if (severityCounts.high > 0) status = "high_regressions"

		return {
			status: status,
			message: `${regressions.length} performance regression(s) detected`,
			criticalCount: severityCounts.critical,
			highCount: severityCounts.high,
			mediumCount: severityCounts.medium,
			lowCount: severityCounts.low,
			affectedMetrics: [...new Set(regressions.map((r) => r.metric))],
		}
	}

	generateRegressionRecommendations(regressions) {
		if (regressions.length === 0) return []

		const recommendations = []

		// Critical regressions
		const criticalRegressions = regressions.filter(
			(r) => r.severity === "critical"
		)
		if (criticalRegressions.length > 0) {
			recommendations.push({
				priority: "immediate",
				title: "Address Critical Performance Regressions",
				description:
					"Critical performance regressions require immediate attention",
				actions: [
					"Halt deployment of recent changes until regressions are resolved",
					"Investigate and rollback recent configuration or code changes",
					"Scale up resources immediately if resource exhaustion is suspected",
					"Implement emergency monitoring and alerting",
					"Conduct root cause analysis of affected metrics",
				],
			})
		}

		// General recommendations based on affected metrics
		const affectedMetrics = [...new Set(regressions.map((r) => r.metric))]

		if (affectedMetrics.includes("tps")) {
			recommendations.push({
				priority: "high",
				title: "Investigate TPS Regression",
				description: "Throughput performance has degraded",
				actions: [
					"Review recent chaincode changes for performance impacts",
					"Check system resource utilization and scaling",
					"Analyze network configuration and connectivity",
					"Review database performance and query optimization",
					"Validate load balancing and connection pooling",
				],
			})
		}

		if (affectedMetrics.includes("latency")) {
			recommendations.push({
				priority: "high",
				title: "Address Latency Regression",
				description: "Response time performance has degraded",
				actions: [
					"Investigate network latency and connectivity issues",
					"Review chaincode execution efficiency",
					"Check database query performance and indexing",
					"Analyze consensus mechanism configuration",
					"Review caching strategies and implementation",
				],
			})
		}

		if (affectedMetrics.includes("successRate")) {
			recommendations.push({
				priority: "high",
				title: "Resolve Success Rate Regression",
				description: "Transaction success rate has decreased",
				actions: [
					"Investigate error patterns and root causes",
					"Review chaincode validation and business logic",
					"Check network stability and connectivity",
					"Analyze timeout configurations and resource limits",
					"Validate data integrity and input validation",
				],
			})
		}

		return recommendations
	}

	// Historical data management methods
	async loadHistoricalData() {
		const filePath = path.join(
			this.options.historicalDataPath,
			"regression-history.json"
		)

		if (!fs.existsSync(filePath)) {
			return []
		}

		try {
			const content = fs.readFileSync(filePath, "utf8")
			return JSON.parse(content)
		} catch (error) {
			console.warn("Could not load historical regression data:", error.message)
			return []
		}
	}

	async saveCurrentResults(results, analysis) {
		const historicalData = await this.loadHistoricalData()

		const entry = {
			timestamp: new Date().toISOString(),
			metrics: analysis.current,
			regressionStatus: analysis.status,
			regressionsDetected: analysis.regressions.length,
		}

		historicalData.push(entry)

		// Keep only last 100 entries
		if (historicalData.length > 100) {
			historicalData.splice(0, historicalData.length - 100)
		}

		const filePath = path.join(
			this.options.historicalDataPath,
			"regression-history.json"
		)
		fs.writeFileSync(filePath, JSON.stringify(historicalData, null, 2))
	}

	// Alerting methods
	async sendRegressionAlerts(analysis) {
		if (!this.options.alerting.enabled) return

		const alertData = {
			timestamp: analysis.timestamp,
			status: analysis.summary.status,
			regressionsCount: analysis.regressions.length,
			criticalCount: analysis.summary.criticalCount,
			regressions: analysis.regressions,
			recommendations: analysis.recommendations,
		}

		try {
			if (this.options.alerting.webhookUrl) {
				await this.sendWebhookAlert(alertData)
			}

			if (this.options.alerting.emailConfig) {
				await this.sendEmailAlert(alertData)
			}
		} catch (error) {
			console.error("Failed to send regression alerts:", error.message)
		}
	}

	async sendWebhookAlert(alertData) {
		// Webhook implementation would go here
		console.log("Webhook alert would be sent:", alertData)
	}

	async sendEmailAlert(alertData) {
		// Email implementation would go here
		console.log("Email alert would be sent:", alertData)
	}
}

module.exports = { RegressionDetector }
