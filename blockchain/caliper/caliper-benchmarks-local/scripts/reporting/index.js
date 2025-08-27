/**
 * Enhanced Reporting and Analytics Module for Blockchain Performance Testing
 *
 * This module provides comprehensive reporting capabilities including:
 * - Enhanced HTML report generation with advanced charts
 * - Performance analysis with bottleneck identification
 * - Comparative analysis between test runs
 * - Trend analysis and regression detection
 * - Statistical analysis and recommendations
 */

const { EnhancedReportGenerator } = require("./reportGenerator")
const { PerformanceAnalyzer } = require("./performanceAnalyzer")
const { ComparativeAnalyzer } = require("./comparativeAnalyzer")
const { ReportingCLI } = require("./generateReport")
const { StatisticalAnalyzer } = require("./statisticalAnalyzer")
const { BottleneckAnalyzer } = require("./bottleneckAnalyzer")
const { RegressionDetector } = require("./regressionDetector")

/**
 * Main reporting class that combines all functionality
 */
class BlockchainPerformanceReporting {
	constructor(options = {}) {
		this.options = {
			outputDir: options.outputDir || "./reports",
			historicalDataPath: options.historicalDataPath || "./reports/historical",
			enableCharts: options.enableCharts !== false,
			enableComparison: options.enableComparison !== false,
			enableTrends: options.enableTrends !== false,
			thresholds: {
				tpsWarning: 10,
				tpsCritical: 5,
				latencyWarning: 1000,
				latencyCritical: 5000,
				successRateWarning: 95,
				successRateCritical: 90,
				...options.thresholds,
			},
			...options,
		}

		this.reportGenerator = new EnhancedReportGenerator(this.options)
		this.performanceAnalyzer = new PerformanceAnalyzer(this.options)
		this.comparativeAnalyzer = new ComparativeAnalyzer(this.options)
	}

	/**
	 * Generate a comprehensive performance report
	 * @param {Object} results - Caliper benchmark results
	 * @param {Object} options - Report generation options
	 * @returns {Promise<string>} Path to generated report
	 */
	async generateReport(results, options = {}) {
		console.log("🚀 Generating comprehensive performance report...")

		try {
			const reportPath = await this.reportGenerator.generateReport(
				results,
				options
			)
			console.log("✅ Report generated successfully:", reportPath)
			return reportPath
		} catch (error) {
			console.error("❌ Error generating report:", error.message)
			throw error
		}
	}

	/**
	 * Analyze performance results
	 * @param {Object} results - Caliper benchmark results
	 * @returns {Promise<Object>} Analysis results
	 */
	async analyzePerformance(results) {
		console.log("📊 Analyzing performance results...")

		try {
			const analysis = await this.performanceAnalyzer.analyzeResults(results)
			console.log("✅ Performance analysis completed")
			return analysis
		} catch (error) {
			console.error("❌ Error analyzing performance:", error.message)
			throw error
		}
	}

	/**
	 * Compare multiple test runs
	 * @param {Array} testResults - Array of test result objects
	 * @param {Object} options - Comparison options
	 * @returns {Promise<Object>} Comparative analysis results
	 */
	async compareTestRuns(testResults, options = {}) {
		console.log(`📈 Comparing ${testResults.length} test runs...`)

		try {
			const comparison = await this.comparativeAnalyzer.compareTestRuns(
				testResults,
				options
			)
			console.log("✅ Comparative analysis completed")
			return comparison
		} catch (error) {
			console.error("❌ Error comparing test runs:", error.message)
			throw error
		}
	}

	/**
	 * Generate report with historical comparison
	 * @param {Object} results - Current test results
	 * @param {number} historicalLimit - Number of historical results to compare
	 * @returns {Promise<Object>} Combined report and comparison
	 */
	async generateReportWithComparison(results, historicalLimit = 5) {
		console.log("🔄 Generating report with historical comparison...")

		try {
			// Generate main report
			const reportPath = await this.generateReport(results)

			// Try to generate comparison if historical data exists
			let comparisonPath = null
			try {
				const comparison =
					await this.comparativeAnalyzer.compareHistoricalResults(
						historicalLimit
					)
				comparisonPath = await this.comparativeAnalyzer.saveComparison(
					comparison,
					{
						filename: `comparison-${new Date()
							.toISOString()
							.replace(/[:.]/g, "-")}.json`,
					}
				)
			} catch (error) {
				console.warn(
					"⚠️  Could not generate historical comparison:",
					error.message
				)
			}

			return {
				reportPath,
				comparisonPath,
				timestamp: new Date().toISOString(),
			}
		} catch (error) {
			console.error(
				"❌ Error generating report with comparison:",
				error.message
			)
			throw error
		}
	}

	/**
	 * Quick performance summary
	 * @param {Object} results - Caliper benchmark results
	 * @returns {Object} Performance summary
	 */
	getPerformanceSummary(results) {
		if (!results.rounds) {
			return {
				totalRounds: 0,
				totalTransactions: 0,
				avgTps: 0,
				avgLatency: 0,
				successRate: 0,
				totalErrors: 0,
			}
		}

		const validRounds = results.rounds.filter((r) => r.performance?.throughput)

		if (validRounds.length === 0) {
			return {
				totalRounds: results.rounds.length,
				totalTransactions: 0,
				avgTps: 0,
				avgLatency: 0,
				successRate: 0,
				totalErrors: 0,
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
			totalRounds: results.rounds.length,
			validRounds: validRounds.length,
			totalTransactions,
			avgTps: parseFloat(avgTps.toFixed(2)),
			avgLatency: parseFloat(avgLatency.toFixed(2)),
			successRate: parseFloat(successRate.toFixed(1)),
			totalErrors: totalFailed,
		}
	}

	/**
	 * Validate performance against thresholds
	 * @param {Object} results - Caliper benchmark results
	 * @returns {Object} Validation results
	 */
	validatePerformance(results) {
		const summary = this.getPerformanceSummary(results)
		const validation = {
			passed: true,
			warnings: [],
			errors: [],
			summary,
		}

		// TPS validation
		if (summary.avgTps < this.options.thresholds.tpsCritical) {
			validation.passed = false
			validation.errors.push(
				`TPS below critical threshold: ${summary.avgTps} < ${this.options.thresholds.tpsCritical}`
			)
		} else if (summary.avgTps < this.options.thresholds.tpsWarning) {
			validation.warnings.push(
				`TPS below warning threshold: ${summary.avgTps} < ${this.options.thresholds.tpsWarning}`
			)
		}

		// Latency validation
		if (summary.avgLatency > this.options.thresholds.latencyCritical) {
			validation.passed = false
			validation.errors.push(
				`Latency above critical threshold: ${summary.avgLatency}ms > ${this.options.thresholds.latencyCritical}ms`
			)
		} else if (summary.avgLatency > this.options.thresholds.latencyWarning) {
			validation.warnings.push(
				`Latency above warning threshold: ${summary.avgLatency}ms > ${this.options.thresholds.latencyWarning}ms`
			)
		}

		// Success rate validation
		if (summary.successRate < this.options.thresholds.successRateCritical) {
			validation.passed = false
			validation.errors.push(
				`Success rate below critical threshold: ${summary.successRate}% < ${this.options.thresholds.successRateCritical}%`
			)
		} else if (
			summary.successRate < this.options.thresholds.successRateWarning
		) {
			validation.warnings.push(
				`Success rate below warning threshold: ${summary.successRate}% < ${this.options.thresholds.successRateWarning}%`
			)
		}

		return validation
	}
}

// Export individual classes and main reporting class
module.exports = {
	BlockchainPerformanceReporting,
	EnhancedReportGenerator,
	PerformanceAnalyzer,
	ComparativeAnalyzer,
	ReportingCLI,
	StatisticalAnalyzer,
	BottleneckAnalyzer,
	RegressionDetector,
}

// Export convenience functions
module.exports.generateReport = async (results, options = {}) => {
	const reporting = new BlockchainPerformanceReporting(options)
	return reporting.generateReport(results, options)
}

module.exports.analyzePerformance = async (results, options = {}) => {
	const reporting = new BlockchainPerformanceReporting(options)
	return reporting.analyzePerformance(results)
}

module.exports.compareTestRuns = async (testResults, options = {}) => {
	const reporting = new BlockchainPerformanceReporting(options)
	return reporting.compareTestRuns(testResults, options)
}

module.exports.getPerformanceSummary = (results, options = {}) => {
	const reporting = new BlockchainPerformanceReporting(options)
	return reporting.getPerformanceSummary(results)
}

module.exports.validatePerformance = (results, options = {}) => {
	const reporting = new BlockchainPerformanceReporting(options)
	return reporting.validatePerformance(results)
}
