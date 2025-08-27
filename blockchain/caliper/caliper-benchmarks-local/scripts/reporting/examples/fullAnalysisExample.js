#!/usr/bin/env node

/**
 * Complete Performance Analysis Example
 * Demonstrates how to use all reporting utilities together for comprehensive analysis
 */

const fs = require("fs")
const path = require("path")
const {
	BlockchainPerformanceReporting,
	EnhancedReportGenerator,
	PerformanceAnalyzer,
	ComparativeAnalyzer,
	StatisticalAnalyzer,
	BottleneckAnalyzer,
	RegressionDetector,
} = require("../index")

class FullAnalysisExample {
	constructor() {
		this.reporting = new BlockchainPerformanceReporting({
			outputDir: "./example-reports",
			thresholds: {
				tpsWarning: 15,
				tpsCritical: 8,
				latencyWarning: 800,
				latencyCritical: 3000,
				successRateWarning: 97,
				successRateCritical: 92,
			},
		})
	}

	async runCompleteAnalysis() {
		console.log("🚀 Starting Complete Performance Analysis Example\n")

		try {
			// Step 1: Load sample results (you would load your actual Caliper results here)
			const results = this.generateSampleResults()
			console.log("📊 Sample results generated")

			// Step 2: Generate comprehensive report
			console.log("\n📈 Generating comprehensive performance report...")
			const reportPath = await this.reporting.generateReport(results, {
				title: "Complete Analysis Example Report",
			})
			console.log(`✅ Report generated: ${reportPath}`)

			// Step 3: Perform detailed performance analysis
			console.log("\n🔍 Performing detailed performance analysis...")
			const analysis = await this.reporting.analyzePerformance(results)
			this.displayAnalysisResults(analysis)

			// Step 4: Validate performance against thresholds
			console.log("\n✅ Validating performance against thresholds...")
			const validation = this.reporting.validatePerformance(results)
			this.displayValidationResults(validation)

			// Step 5: Demonstrate individual analyzers
			console.log("\n🔧 Demonstrating individual analyzers...")
			await this.demonstrateIndividualAnalyzers(results)

			// Step 6: Generate performance summary
			console.log("\n📋 Performance Summary:")
			const summary = this.reporting.getPerformanceSummary(results)
			console.log(JSON.stringify(summary, null, 2))

			console.log("\n🎉 Complete analysis finished successfully!")
		} catch (error) {
			console.error("❌ Error during analysis:", error.message)
			throw error
		}
	}

	generateSampleResults() {
		// Generate realistic sample data for demonstration
		return {
			name: "ConsentMD Performance Test",
			description: "Comprehensive blockchain performance analysis example",
			dlt: "fabric",
			timestamp: new Date().toISOString(),
			rounds: [
				{
					label: "Light Load Test",
					description: "Testing with 2 workers at 5 TPS",
					performance: {
						throughput: {
							total: 300,
							successful: 295,
							failed: 5,
							tps: 12.5,
							duration: 24.0,
						},
						latency: {
							min: 45.2,
							max: 892.1,
							avg: 156.7,
							percentile: {
								50: 142.3,
								75: 198.5,
								90: 287.9,
								95: 356.2,
								99: 678.4,
							},
						},
					},
					errors: [],
				},
				{
					label: "Medium Load Test",
					description: "Testing with 5 workers at 15 TPS",
					performance: {
						throughput: {
							total: 750,
							successful: 738,
							failed: 12,
							tps: 18.7,
							duration: 40.1,
						},
						latency: {
							min: 52.1,
							max: 1245.6,
							avg: 234.5,
							percentile: {
								50: 198.7,
								75: 287.3,
								90: 456.8,
								95: 567.9,
								99: 987.2,
							},
						},
					},
					errors: [
						{ message: "timeout error", count: 8 },
						{ message: "network connection failed", count: 4 },
					],
				},
				{
					label: "Heavy Load Test",
					description: "Testing with 10 workers at 30 TPS",
					performance: {
						throughput: {
							total: 1200,
							successful: 1156,
							failed: 44,
							tps: 22.3,
							duration: 53.8,
						},
						latency: {
							min: 67.8,
							max: 2134.7,
							avg: 387.2,
							percentile: {
								50: 298.4,
								75: 456.7,
								90: 678.9,
								95: 892.3,
								99: 1567.8,
							},
						},
					},
					errors: [
						{ message: "timeout error", count: 28 },
						{ message: "chaincode execution failed", count: 12 },
						{ message: "endorsement failed", count: 4 },
					],
				},
			],
		}
	}

	displayAnalysisResults(analysis) {
		console.log("\n📊 Analysis Results:")

		if (analysis.bottlenecks && analysis.bottlenecks.length > 0) {
			console.log("\n🚨 Bottlenecks Identified:")
			analysis.bottlenecks.forEach((bottleneck, index) => {
				console.log(`  ${index + 1}. ${bottleneck}`)
			})
		}

		if (analysis.recommendations && analysis.recommendations.length > 0) {
			console.log("\n💡 Recommendations:")
			analysis.recommendations.forEach((rec, index) => {
				if (typeof rec === "string") {
					console.log(`  ${index + 1}. ${rec}`)
				} else {
					console.log(`  ${index + 1}. [${rec.priority}] ${rec.title}`)
					if (rec.actions) {
						rec.actions.forEach((action) => {
							console.log(`     - ${action}`)
						})
					}
				}
			})
		}

		if (analysis.regressions && analysis.regressions.length > 0) {
			console.log("\n⚠️  Regressions Detected:")
			analysis.regressions.forEach((regression, index) => {
				console.log(
					`  ${index + 1}. ${regression.description} (${regression.severity})`
				)
			})
		}

		if (analysis.alerts && analysis.alerts.length > 0) {
			console.log("\n🚨 Alerts:")
			analysis.alerts.forEach((alert, index) => {
				console.log(`  ${index + 1}. [${alert.level}] ${alert.message}`)
			})
		}
	}

	displayValidationResults(validation) {
		console.log(
			`\n✅ Validation Status: ${validation.passed ? "PASSED" : "FAILED"}`
		)

		if (validation.errors && validation.errors.length > 0) {
			console.log("\n❌ Critical Issues:")
			validation.errors.forEach((error, index) => {
				console.log(`  ${index + 1}. ${error}`)
			})
		}

		if (validation.warnings && validation.warnings.length > 0) {
			console.log("\n⚠️  Warnings:")
			validation.warnings.forEach((warning, index) => {
				console.log(`  ${index + 1}. ${warning}`)
			})
		}
	}

	async demonstrateIndividualAnalyzers(results) {
		// Statistical Analysis
		console.log("\n📊 Statistical Analysis:")
		const statisticalAnalyzer = new StatisticalAnalyzer()
		const tpsValues = results.rounds.map((r) => r.performance.throughput.tps)
		const tpsStats = statisticalAnalyzer.calculateStatistics(tpsValues)
		console.log(
			`  TPS Statistics: Mean=${tpsStats.mean.toFixed(
				2
			)}, StdDev=${tpsStats.standardDeviation.toFixed(2)}, CV=${(
				tpsStats.coefficientOfVariation * 100
			).toFixed(1)}%`
		)

		// Bottleneck Analysis
		console.log("\n🔍 Bottleneck Analysis:")
		const bottleneckAnalyzer = new BottleneckAnalyzer()
		const bottleneckAnalysis = bottleneckAnalyzer.analyzeBottlenecks(results)
		console.log(`  Severity: ${bottleneckAnalysis.severity}`)
		console.log(
			`  Categories with issues: ${Object.keys(bottleneckAnalysis.categories)
				.filter((cat) => bottleneckAnalysis.categories[cat].length > 0)
				.join(", ")}`
		)

		// Regression Detection
		console.log("\n📈 Regression Detection:")
		const regressionDetector = new RegressionDetector()
		const regressionAnalysis = await regressionDetector.detectRegressions(
			results
		)
		console.log(`  Status: ${regressionAnalysis.status}`)
		if (regressionAnalysis.regressions.length > 0) {
			console.log(
				`  Regressions found: ${regressionAnalysis.regressions.length}`
			)
		}
	}
}

// Run the example if this script is executed directly
if (require.main === module) {
	const example = new FullAnalysisExample()
	example.runCompleteAnalysis().catch((error) => {
		console.error("Fatal error:", error)
		process.exit(1)
	})
}

module.exports = { FullAnalysisExample }
