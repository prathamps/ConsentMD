/**
 * Bottleneck Identification Engine for Blockchain Performance Analysis
 * Identifies performance bottlenecks and provides specific recommendations
 */

const { StatisticalAnalyzer } = require("./statisticalAnalyzer")

class BottleneckAnalyzer {
	constructor(options = {}) {
		this.options = {
			thresholds: {
				tpsVarianceThreshold: 0.3, // CV threshold for TPS consistency
				latencyVarianceThreshold: 0.5, // CV threshold for latency consistency
				errorRateThreshold: 0.05, // 5% error rate threshold
				latencyPercentileRatio: 3, // 95th/avg latency ratio threshold
				throughputDegradation: 0.2, // 20% throughput degradation threshold
				...options.thresholds,
			},
			...options,
		}

		this.statisticalAnalyzer = new StatisticalAnalyzer()
	}

	/**
	 * Analyze performance data to identify bottlenecks
	 * @param {Object} results - Caliper benchmark results
	 * @returns {Object} Bottleneck analysis results
	 */
	analyzeBottlenecks(results) {
		if (!results.rounds || results.rounds.length === 0) {
			return {
				bottlenecks: [],
				severity: "none",
				categories: {},
				recommendations: [],
			}
		}

		const analysis = {
			bottlenecks: [],
			severity: "none",
			categories: {
				throughput: [],
				latency: [],
				consistency: [],
				errors: [],
				scalability: [],
			},
			recommendations: [],
			metrics: this.calculateBottleneckMetrics(results),
		}

		// Analyze different types of bottlenecks
		this.analyzeThroughputBottlenecks(results, analysis)
		this.analyzeLatencyBottlenecks(results, analysis)
		this.analyzeConsistencyBottlenecks(results, analysis)
		this.analyzeErrorBottlenecks(results, analysis)
		this.analyzeScalabilityBottlenecks(results, analysis)

		// Determine overall severity
		analysis.severity = this.determineSeverity(analysis)

		// Generate comprehensive recommendations
		analysis.recommendations = this.generateBottleneckRecommendations(analysis)

		return analysis
	}

	calculateBottleneckMetrics(results) {
		const validRounds = results.rounds.filter((r) => r.performance?.throughput)

		if (validRounds.length === 0) {
			return {}
		}

		const tpsValues = validRounds.map((r) => r.performance.throughput.tps)
		const latencyValues = validRounds.map(
			(r) => r.performance.latency?.avg || 0
		)
		const errorRates = validRounds.map((r) => {
			const total = r.performance.throughput.total
			const failed = r.performance.throughput.failed
			return total > 0 ? failed / total : 0
		})

		return {
			tps: this.statisticalAnalyzer.calculateStatistics(tpsValues),
			latency: this.statisticalAnalyzer.calculateStatistics(latencyValues),
			errorRates: this.statisticalAnalyzer.calculateStatistics(errorRates),
			roundCount: validRounds.length,
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

	analyzeThroughputBottlenecks(results, analysis) {
		const metrics = analysis.metrics

		// Low overall throughput
		if (metrics.tps.mean < 10) {
			analysis.categories.throughput.push({
				type: "low_throughput",
				severity: "high",
				description: `Low average throughput: ${metrics.tps.mean.toFixed(
					2
				)} TPS`,
				impact: "System cannot handle expected transaction volume",
				possibleCauses: [
					"Insufficient network resources",
					"Chaincode execution bottlenecks",
					"Database performance issues",
					"Network latency between components",
				],
			})
		}

		// Throughput degradation across rounds
		if (results.rounds.length > 1) {
			const tpsValues = results.rounds
				.filter((r) => r.performance?.throughput?.tps)
				.map((r) => r.performance.throughput.tps)

			if (tpsValues.length > 1) {
				const firstHalf = tpsValues.slice(0, Math.ceil(tpsValues.length / 2))
				const secondHalf = tpsValues.slice(Math.floor(tpsValues.length / 2))

				const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
				const secondAvg =
					secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

				const degradation = (firstAvg - secondAvg) / firstAvg

				if (degradation > this.options.thresholds.throughputDegradation) {
					analysis.categories.throughput.push({
						type: "throughput_degradation",
						severity: "medium",
						description: `Throughput degradation: ${(degradation * 100).toFixed(
							1
						)}% decrease over test duration`,
						impact: "System performance degrades under sustained load",
						possibleCauses: [
							"Memory leaks or resource exhaustion",
							"Database connection pool saturation",
							"Garbage collection pressure",
							"Network congestion buildup",
						],
					})
				}
			}
		}

		// Peak vs sustained throughput analysis
		const peakTps = metrics.tps.max
		const avgTps = metrics.tps.mean

		if (peakTps > 0 && (peakTps - avgTps) / peakTps > 0.4) {
			analysis.categories.throughput.push({
				type: "peak_vs_sustained",
				severity: "medium",
				description: `Large gap between peak (${peakTps.toFixed(
					2
				)}) and average (${avgTps.toFixed(2)}) TPS`,
				impact: "System cannot sustain peak performance",
				possibleCauses: [
					"Resource contention under load",
					"Inefficient load balancing",
					"Batch processing inefficiencies",
					"Connection pooling issues",
				],
			})
		}
	}

	analyzeLatencyBottlenecks(results, analysis) {
		const metrics = analysis.metrics

		// High average latency
		if (metrics.latency.mean > 1000) {
			analysis.categories.latency.push({
				type: "high_latency",
				severity: "high",
				description: `High average latency: ${metrics.latency.mean.toFixed(
					2
				)}ms`,
				impact: "Poor user experience and reduced system responsiveness",
				possibleCauses: [
					"Network latency between components",
					"Slow chaincode execution",
					"Database query performance",
					"Consensus mechanism delays",
				],
			})
		}

		// High latency variance
		if (
			metrics.latency.coefficientOfVariation >
			this.options.thresholds.latencyVarianceThreshold
		) {
			analysis.categories.latency.push({
				type: "latency_variance",
				severity: "medium",
				description: `High latency variance: CV = ${(
					metrics.latency.coefficientOfVariation * 100
				).toFixed(1)}%`,
				impact: "Unpredictable response times affecting user experience",
				possibleCauses: [
					"Intermittent network issues",
					"Resource contention spikes",
					"Garbage collection pauses",
					"Load balancing inefficiencies",
				],
			})
		}

		// Analyze percentile ratios
		const p95 = metrics.latency.percentiles[95]
		const avg = metrics.latency.mean

		if (avg > 0 && p95 / avg > this.options.thresholds.latencyPercentileRatio) {
			analysis.categories.latency.push({
				type: "tail_latency",
				severity: "medium",
				description: `High tail latency: 95th percentile (${p95.toFixed(
					2
				)}ms) is ${(p95 / avg).toFixed(1)}x average`,
				impact: "Some transactions experience significantly worse performance",
				possibleCauses: [
					"Resource contention during peak loads",
					"Inefficient transaction ordering",
					"Network congestion spikes",
					"Database lock contention",
				],
			})
		}
	}

	analyzeConsistencyBottlenecks(results, analysis) {
		const metrics = analysis.metrics

		// TPS consistency issues
		if (
			metrics.tps.coefficientOfVariation >
			this.options.thresholds.tpsVarianceThreshold
		) {
			analysis.categories.consistency.push({
				type: "tps_inconsistency",
				severity: "medium",
				description: `Inconsistent TPS performance: CV = ${(
					metrics.tps.coefficientOfVariation * 100
				).toFixed(1)}%`,
				impact: "Unpredictable system capacity and performance",
				possibleCauses: [
					"Variable network conditions",
					"Resource contention patterns",
					"Load balancing inefficiencies",
					"Batch processing variations",
				],
			})
		}

		// Check for performance outliers
		if (metrics.tps.outliers.length > 0) {
			analysis.categories.consistency.push({
				type: "performance_outliers",
				severity: "low",
				description: `Performance outliers detected: ${metrics.tps.outliers.length} rounds with unusual TPS`,
				impact: "Some test rounds show significantly different performance",
				possibleCauses: [
					"Environmental factors during testing",
					"System warm-up effects",
					"Resource allocation changes",
					"Network condition variations",
				],
			})
		}
	}

	analyzeErrorBottlenecks(results, analysis) {
		const metrics = analysis.metrics

		// High error rate
		if (metrics.errorRates.mean > this.options.thresholds.errorRateThreshold) {
			analysis.categories.errors.push({
				type: "high_error_rate",
				severity: "high",
				description: `High error rate: ${(
					metrics.errorRates.mean * 100
				).toFixed(2)}%`,
				impact: "System reliability issues affecting transaction success",
				possibleCauses: [
					"Chaincode logic errors",
					"Network connectivity issues",
					"Resource exhaustion",
					"Configuration problems",
				],
			})
		}

		// Analyze error patterns across rounds
		const errorCounts = results.rounds.map(
			(r) => r.performance?.throughput?.failed || 0
		)
		const errorStats = this.statisticalAnalyzer.calculateStatistics(errorCounts)

		if (errorStats.coefficientOfVariation > 0.5 && errorStats.mean > 0) {
			analysis.categories.errors.push({
				type: "error_pattern_inconsistency",
				severity: "medium",
				description: `Inconsistent error patterns across rounds`,
				impact: "Errors may be related to specific conditions or timing",
				possibleCauses: [
					"Intermittent system issues",
					"Load-dependent failures",
					"Resource exhaustion under specific conditions",
					"Network instability",
				],
			})
		}
	}

	analyzeScalabilityBottlenecks(results, analysis) {
		// This would require additional data about worker counts, but we can infer some patterns
		const validRounds = results.rounds.filter((r) => r.performance?.throughput)

		if (validRounds.length < 2) return

		// Look for sublinear scaling patterns (if we can infer load increases)
		const tpsValues = validRounds.map((r) => r.performance.throughput.tps)
		const regression = this.statisticalAnalyzer.linearRegression(
			Array.from({ length: tpsValues.length }, (_, i) => i + 1),
			tpsValues
		)

		if (regression.slope < 0 && regression.rSquared > 0.3) {
			analysis.categories.scalability.push({
				type: "negative_scaling",
				severity: "high",
				description: `Performance decreases with test progression (slope: ${regression.slope.toFixed(
					2
				)})`,
				impact: "System cannot handle increased load effectively",
				possibleCauses: [
					"Resource exhaustion under load",
					"Memory leaks or resource leaks",
					"Database performance degradation",
					"Network congestion buildup",
				],
			})
		}
	}

	determineSeverity(analysis) {
		const severityCounts = {
			high: 0,
			medium: 0,
			low: 0,
		}

		Object.values(analysis.categories).forEach((category) => {
			category.forEach((bottleneck) => {
				severityCounts[bottleneck.severity]++
			})
		})

		if (severityCounts.high > 0) return "high"
		if (severityCounts.medium > 2) return "high"
		if (severityCounts.medium > 0) return "medium"
		if (severityCounts.low > 0) return "low"
		return "none"
	}

	generateBottleneckRecommendations(analysis) {
		const recommendations = []

		// Throughput recommendations
		if (analysis.categories.throughput.length > 0) {
			recommendations.push({
				category: "throughput",
				priority: "high",
				title: "Throughput Optimization",
				actions: [
					"Scale blockchain network resources (CPU, memory)",
					"Optimize chaincode execution efficiency",
					"Review and tune database performance",
					"Implement connection pooling and load balancing",
					"Consider parallel transaction processing",
				],
			})
		}

		// Latency recommendations
		if (analysis.categories.latency.length > 0) {
			recommendations.push({
				category: "latency",
				priority: "high",
				title: "Latency Reduction",
				actions: [
					"Optimize network topology and reduce hops",
					"Implement caching strategies for frequent queries",
					"Tune consensus mechanism parameters",
					"Optimize chaincode logic and database queries",
					"Consider geographic distribution of nodes",
				],
			})
		}

		// Consistency recommendations
		if (analysis.categories.consistency.length > 0) {
			recommendations.push({
				category: "consistency",
				priority: "medium",
				title: "Performance Consistency",
				actions: [
					"Implement proper load balancing strategies",
					"Monitor and address resource contention",
					"Establish consistent testing environments",
					"Implement performance monitoring and alerting",
					"Consider workload scheduling optimization",
				],
			})
		}

		// Error handling recommendations
		if (analysis.categories.errors.length > 0) {
			recommendations.push({
				category: "errors",
				priority: "high",
				title: "Error Reduction",
				actions: [
					"Implement comprehensive error handling in chaincode",
					"Add retry mechanisms with exponential backoff",
					"Monitor and address network connectivity issues",
					"Implement proper resource management and cleanup",
					"Add detailed logging and error tracking",
				],
			})
		}

		// Scalability recommendations
		if (analysis.categories.scalability.length > 0) {
			recommendations.push({
				category: "scalability",
				priority: "high",
				title: "Scalability Improvements",
				actions: [
					"Implement horizontal scaling strategies",
					"Optimize resource allocation and management",
					"Consider sharding or partitioning strategies",
					"Implement efficient batch processing",
					"Monitor and prevent resource leaks",
				],
			})
		}

		return recommendations
	}

	/**
	 * Generate a bottleneck summary report
	 */
	generateBottleneckReport(analysis) {
		const report = {
			summary: {
				totalBottlenecks: Object.values(analysis.categories).flat().length,
				severity: analysis.severity,
				criticalIssues: Object.values(analysis.categories)
					.flat()
					.filter((b) => b.severity === "high").length,
				categories: Object.keys(analysis.categories).filter(
					(cat) => analysis.categories[cat].length > 0
				),
			},
			details: analysis.categories,
			recommendations: analysis.recommendations,
			metrics: analysis.metrics,
		}

		return report
	}
}

module.exports = { BottleneckAnalyzer }
