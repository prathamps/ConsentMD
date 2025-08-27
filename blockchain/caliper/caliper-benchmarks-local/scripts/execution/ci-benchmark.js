#!/usr/bin/env node

/**
 * CI/CD Integration Script for Blockchain Performance Benchmarks
 * Provides continuous performance testing with threshold validation,
 * failure detection, and automated report publishing.
 */

const fs = require("fs")
const path = require("path")
const { execSync, spawn } = require("child_process")
const BenchmarkRunner = require("./runBenchmark")

class CIBenchmarkRunner extends BenchmarkRunner {
	constructor(options = {}) {
		super()

		this.ciOptions = {
			thresholds: options.thresholds || {},
			notifications: options.notifications || {},
			publishing: options.publishing || {},
			failFast: options.failFast !== false,
			maxRetries: options.maxRetries || 2,
			retryDelay: options.retryDelay || 30000,
			...options,
		}

		this.results = []
		this.thresholdViolations = []
		this.ciLogFile = path.join(
			this.logDir,
			`ci-benchmark-${new Date().toISOString().split("T")[0]}.log`
		)
	}

	ciLog(message, level = "INFO") {
		const timestamp = new Date().toISOString()
		const logMessage = `[${timestamp}] [CI-${level}] ${message}`

		console.log(logMessage)
		fs.appendFileSync(this.ciLogFile, logMessage + "\n")

		// Also log to parent logger
		this.log(message, level)
	}

	loadThresholds(configPath) {
		this.ciLog("Loading performance thresholds...")

		if (!configPath || !fs.existsSync(configPath)) {
			this.ciLog("No threshold configuration found, using defaults", "WARNING")
			return this.getDefaultThresholds()
		}

		try {
			const thresholds = JSON.parse(fs.readFileSync(configPath, "utf8"))
			this.ciLog(`Loaded thresholds from ${configPath}`)
			return thresholds
		} catch (error) {
			this.ciLog(`Error loading thresholds: ${error.message}`, "ERROR")
			return this.getDefaultThresholds()
		}
	}

	getDefaultThresholds() {
		return {
			global: {
				maxLatencyMs: 5000,
				minTPS: 1,
				maxErrorRate: 0.05,
				minSuccessRate: 0.95,
			},
			byFunction: {
				createPatientRecord: { maxLatencyMs: 3000, minTPS: 5 },
				getRecordById: { maxLatencyMs: 1000, minTPS: 20 },
				grantConsent: { maxLatencyMs: 2000, minTPS: 10 },
				revokeConsent: { maxLatencyMs: 2000, minTPS: 10 },
				findAssetsByQuery: { maxLatencyMs: 2000, minTPS: 15 },
			},
			byLoadType: {
				light: { maxLatencyMs: 2000, minTPS: 5 },
				medium: { maxLatencyMs: 3000, minTPS: 15 },
				heavy: { maxLatencyMs: 5000, minTPS: 30 },
			},
		}
	}

	async validatePerformanceThresholds(reportPath, config) {
		this.ciLog(`Validating performance thresholds for ${config}...`)

		if (!fs.existsSync(reportPath)) {
			throw new Error(`Report file not found: ${reportPath}`)
		}

		// Parse HTML report to extract metrics
		const reportContent = fs.readFileSync(reportPath, "utf8")
		const metrics = this.extractMetricsFromReport(reportContent)

		const thresholds = this.ciOptions.thresholds
		const violations = []

		// Global threshold validation
		if (thresholds.global) {
			violations.push(
				...this.validateGlobalThresholds(metrics, thresholds.global)
			)
		}

		// Function-specific threshold validation
		if (thresholds.byFunction) {
			violations.push(
				...this.validateFunctionThresholds(metrics, thresholds.byFunction)
			)
		}

		// Load-type specific threshold validation
		if (thresholds.byLoadType && thresholds.byLoadType[config]) {
			violations.push(
				...this.validateLoadTypeThresholds(
					metrics,
					thresholds.byLoadType[config],
					config
				)
			)
		}

		if (violations.length > 0) {
			this.ciLog(`Found ${violations.length} threshold violation(s)`, "ERROR")
			violations.forEach((violation) => {
				this.ciLog(`VIOLATION: ${violation}`, "ERROR")
			})
			this.thresholdViolations.push(...violations)
		} else {
			this.ciLog("All performance thresholds passed", "SUCCESS")
		}

		return {
			passed: violations.length === 0,
			violations,
			metrics,
		}
	}

	extractMetricsFromReport(reportContent) {
		// Extract metrics from HTML report
		// This is a simplified extraction - in practice, you might want to use a proper HTML parser
		const metrics = {
			rounds: [],
			summary: {},
		}

		try {
			// Extract TPS values
			const tpsMatches = reportContent.match(/TPS[^0-9]*([0-9.]+)/gi)
			if (tpsMatches) {
				metrics.avgTPS =
					tpsMatches
						.map((match) => parseFloat(match.match(/([0-9.]+)/)[1]))
						.reduce((sum, val) => sum + val, 0) / tpsMatches.length
			}

			// Extract latency values
			const latencyMatches = reportContent.match(/latency[^0-9]*([0-9.]+)/gi)
			if (latencyMatches) {
				metrics.avgLatency =
					latencyMatches
						.map((match) => parseFloat(match.match(/([0-9.]+)/)[1]))
						.reduce((sum, val) => sum + val, 0) / latencyMatches.length
			}

			// Extract success rate
			const successMatches = reportContent.match(/success[^0-9]*([0-9.]+)%/gi)
			if (successMatches) {
				metrics.successRate =
					successMatches
						.map((match) => parseFloat(match.match(/([0-9.]+)/)[1]) / 100)
						.reduce((sum, val) => sum + val, 0) / successMatches.length
			}

			// Extract error rate
			if (metrics.successRate) {
				metrics.errorRate = 1 - metrics.successRate
			}
		} catch (error) {
			this.ciLog(`Error extracting metrics: ${error.message}`, "WARNING")
		}

		return metrics
	}

	validateGlobalThresholds(metrics, thresholds) {
		const violations = []

		if (
			thresholds.maxLatencyMs &&
			metrics.avgLatency > thresholds.maxLatencyMs
		) {
			violations.push(
				`Average latency ${metrics.avgLatency}ms exceeds threshold ${thresholds.maxLatencyMs}ms`
			)
		}

		if (thresholds.minTPS && metrics.avgTPS < thresholds.minTPS) {
			violations.push(
				`Average TPS ${metrics.avgTPS} below threshold ${thresholds.minTPS}`
			)
		}

		if (
			thresholds.maxErrorRate &&
			metrics.errorRate > thresholds.maxErrorRate
		) {
			violations.push(
				`Error rate ${(metrics.errorRate * 100).toFixed(
					2
				)}% exceeds threshold ${(thresholds.maxErrorRate * 100).toFixed(2)}%`
			)
		}

		if (
			thresholds.minSuccessRate &&
			metrics.successRate < thresholds.minSuccessRate
		) {
			violations.push(
				`Success rate ${(metrics.successRate * 100).toFixed(
					2
				)}% below threshold ${(thresholds.minSuccessRate * 100).toFixed(2)}%`
			)
		}

		return violations
	}

	validateFunctionThresholds(metrics, thresholds) {
		const violations = []

		// Function-specific validation would require more detailed metric extraction
		// This is a placeholder for function-specific threshold validation

		return violations
	}

	validateLoadTypeThresholds(metrics, thresholds, loadType) {
		const violations = []

		if (
			thresholds.maxLatencyMs &&
			metrics.avgLatency > thresholds.maxLatencyMs
		) {
			violations.push(
				`${loadType} load: Average latency ${metrics.avgLatency}ms exceeds threshold ${thresholds.maxLatencyMs}ms`
			)
		}

		if (thresholds.minTPS && metrics.avgTPS < thresholds.minTPS) {
			violations.push(
				`${loadType} load: Average TPS ${metrics.avgTPS} below threshold ${thresholds.minTPS}`
			)
		}

		return violations
	}

	async runWithRetry(config, options = {}) {
		let lastError

		for (let attempt = 1; attempt <= this.ciOptions.maxRetries + 1; attempt++) {
			try {
				this.ciLog(
					`Running benchmark ${config} (attempt ${attempt}/${
						this.ciOptions.maxRetries + 1
					})`
				)

				const result = await this.runBenchmark(config, options)

				// Validate thresholds
				const validation = await this.validatePerformanceThresholds(
					result.reportPath,
					config
				)

				return {
					...result,
					validation,
					attempt,
				}
			} catch (error) {
				lastError = error
				this.ciLog(`Attempt ${attempt} failed: ${error.message}`, "ERROR")

				if (attempt <= this.ciOptions.maxRetries) {
					this.ciLog(
						`Retrying in ${this.ciOptions.retryDelay / 1000} seconds...`
					)
					await new Promise((resolve) =>
						setTimeout(resolve, this.ciOptions.retryDelay)
					)
				}
			}
		}

		throw lastError
	}

	async runCIBenchmarkSuite(suite, options = {}) {
		this.ciLog(`Starting CI benchmark suite: ${suite}`)

		const suites = {
			"ci-light": ["light"],
			"ci-medium": ["medium"],
			"ci-heavy": ["heavy"],
			"ci-workflow": ["patient-journey", "doctor-workflow"],
			"ci-full": ["light", "medium", "heavy", "patient-journey"],
		}

		if (!suites[suite]) {
			throw new Error(
				`Invalid CI suite: ${suite}. Available suites: ${Object.keys(
					suites
				).join(", ")}`
			)
		}

		const configs = suites[suite]
		const results = []
		let hasFailures = false

		for (const config of configs) {
			try {
				const result = await this.runWithRetry(config, options)
				results.push(result)

				if (!result.validation.passed) {
					hasFailures = true
					this.ciLog(`Benchmark ${config} failed threshold validation`, "ERROR")

					if (this.ciOptions.failFast) {
						this.ciLog("Failing fast due to threshold violations", "ERROR")
						break
					}
				}
			} catch (error) {
				hasFailures = true
				this.ciLog(`Benchmark ${config} failed: ${error.message}`, "ERROR")
				results.push({
					success: false,
					config,
					error: error.message,
				})

				if (this.ciOptions.failFast) {
					this.ciLog("Failing fast due to execution error", "ERROR")
					break
				}
			}
		}

		// Generate CI summary
		const summary = this.generateCISummary(results, suite)

		// Publish results if configured
		if (this.ciOptions.publishing.enabled) {
			await this.publishResults(summary, results)
		}

		// Send notifications if configured
		if (this.ciOptions.notifications.enabled) {
			await this.sendNotifications(summary, hasFailures)
		}

		this.ciLog(`CI benchmark suite completed. Success: ${!hasFailures}`)

		if (hasFailures && this.ciOptions.failFast) {
			process.exit(1)
		}

		return {
			success: !hasFailures,
			results,
			summary,
			thresholdViolations: this.thresholdViolations,
		}
	}

	generateCISummary(results, suite) {
		const summary = {
			suite,
			timestamp: new Date().toISOString(),
			totalBenchmarks: results.length,
			successfulBenchmarks: results.filter(
				(r) => r.success && r.validation?.passed
			).length,
			failedBenchmarks: results.filter(
				(r) => !r.success || !r.validation?.passed
			).length,
			thresholdViolations: this.thresholdViolations.length,
			results: results.map((r) => ({
				config: r.config,
				success: r.success,
				validationPassed: r.validation?.passed || false,
				reportPath: r.reportPath,
				attempt: r.attempt || 1,
				error: r.error,
			})),
		}

		// Write summary to file
		const summaryPath = path.join(
			this.reportDir,
			`ci-summary-${suite}-${Date.now()}.json`
		)
		fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

		this.ciLog(`CI summary written to ${summaryPath}`)

		return summary
	}

	async publishResults(summary, results) {
		this.ciLog("Publishing benchmark results...")

		const publishing = this.ciOptions.publishing

		try {
			if (publishing.type === "file") {
				await this.publishToFile(summary, results, publishing.config)
			} else if (publishing.type === "http") {
				await this.publishToHTTP(summary, results, publishing.config)
			} else if (publishing.type === "s3") {
				await this.publishToS3(summary, results, publishing.config)
			}

			this.ciLog("Results published successfully")
		} catch (error) {
			this.ciLog(`Failed to publish results: ${error.message}`, "ERROR")
		}
	}

	async publishToFile(summary, results, config) {
		const outputPath = config.path || path.join(this.reportDir, "ci-results")

		if (!fs.existsSync(outputPath)) {
			fs.mkdirSync(outputPath, { recursive: true })
		}

		// Copy report files
		results.forEach((result) => {
			if (result.reportPath && fs.existsSync(result.reportPath)) {
				const fileName = `${result.config}-${summary.timestamp}.html`
				const destPath = path.join(outputPath, fileName)
				fs.copyFileSync(result.reportPath, destPath)
			}
		})

		// Write summary
		const summaryPath = path.join(
			outputPath,
			`summary-${summary.timestamp}.json`
		)
		fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
	}

	async publishToHTTP(summary, results, config) {
		// HTTP publishing implementation would go here
		// This is a placeholder for HTTP endpoint publishing
		this.ciLog("HTTP publishing not implemented yet", "WARNING")
	}

	async publishToS3(summary, results, config) {
		// S3 publishing implementation would go here
		// This is a placeholder for S3 publishing
		this.ciLog("S3 publishing not implemented yet", "WARNING")
	}

	async sendNotifications(summary, hasFailures) {
		this.ciLog("Sending notifications...")

		const notifications = this.ciOptions.notifications

		try {
			if (notifications.type === "email") {
				await this.sendEmailNotification(
					summary,
					hasFailures,
					notifications.config
				)
			} else if (notifications.type === "slack") {
				await this.sendSlackNotification(
					summary,
					hasFailures,
					notifications.config
				)
			} else if (notifications.type === "webhook") {
				await this.sendWebhookNotification(
					summary,
					hasFailures,
					notifications.config
				)
			}

			this.ciLog("Notifications sent successfully")
		} catch (error) {
			this.ciLog(`Failed to send notifications: ${error.message}`, "ERROR")
		}
	}

	async sendEmailNotification(summary, hasFailures, config) {
		// Email notification implementation would go here
		this.ciLog("Email notifications not implemented yet", "WARNING")
	}

	async sendSlackNotification(summary, hasFailures, config) {
		// Slack notification implementation would go here
		this.ciLog("Slack notifications not implemented yet", "WARNING")
	}

	async sendWebhookNotification(summary, hasFailures, config) {
		// Webhook notification implementation would go here
		this.ciLog("Webhook notifications not implemented yet", "WARNING")
	}
}

// CLI Interface
async function main() {
	const args = process.argv.slice(2)

	if (args.length === 0) {
		console.log(`
CI/CD Blockchain Benchmark Runner

Usage:
  node ci-benchmark.js <suite> [options]

Suites:
  ci-light      - Light load testing for CI
  ci-medium     - Medium load testing for CI
  ci-heavy      - Heavy load testing for CI
  ci-workflow   - Workflow testing for CI
  ci-full       - Full CI benchmark suite

Options:
  --config <path>           Path to CI configuration file
  --thresholds <path>       Path to performance thresholds file
  --fail-fast               Stop on first failure (default: true)
  --max-retries <number>    Maximum retry attempts (default: 2)
  --retry-delay <ms>        Delay between retries (default: 30000)

Examples:
  node ci-benchmark.js ci-light
  node ci-benchmark.js ci-full --config ci-config.json
  node ci-benchmark.js ci-workflow --thresholds thresholds.json --fail-fast
        `)
		process.exit(1)
	}

	const suite = args[0]

	// Parse options
	const options = {
		thresholds: {},
		notifications: { enabled: false },
		publishing: { enabled: false },
		failFast: true,
		maxRetries: 2,
		retryDelay: 30000,
	}

	for (let i = 1; i < args.length; i++) {
		switch (args[i]) {
			case "--config":
				const configPath = args[++i]
				if (fs.existsSync(configPath)) {
					const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
					Object.assign(options, config)
				}
				break
			case "--thresholds":
				const thresholdsPath = args[++i]
				if (fs.existsSync(thresholdsPath)) {
					options.thresholds = JSON.parse(
						fs.readFileSync(thresholdsPath, "utf8")
					)
				}
				break
			case "--fail-fast":
				options.failFast = true
				break
			case "--max-retries":
				options.maxRetries = parseInt(args[++i])
				break
			case "--retry-delay":
				options.retryDelay = parseInt(args[++i])
				break
		}
	}

	try {
		const runner = new CIBenchmarkRunner(options)
		runner.validateEnvironment()

		const result = await runner.runCIBenchmarkSuite(suite)

		console.log("\n" + "=".repeat(60))
		console.log("CI BENCHMARK SUMMARY")
		console.log("=".repeat(60))
		console.log(`Suite: ${result.summary.suite}`)
		console.log(`Total Benchmarks: ${result.summary.totalBenchmarks}`)
		console.log(`Successful: ${result.summary.successfulBenchmarks}`)
		console.log(`Failed: ${result.summary.failedBenchmarks}`)
		console.log(`Threshold Violations: ${result.summary.thresholdViolations}`)
		console.log("=".repeat(60))

		process.exit(result.success ? 0 : 1)
	} catch (error) {
		console.error(`CI benchmark failed: ${error.message}`)
		process.exit(1)
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error("Unexpected error:", error)
		process.exit(1)
	})
}

module.exports = CIBenchmarkRunner
