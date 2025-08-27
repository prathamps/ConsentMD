#!/usr/bin/env node

/**
 * Automated Benchmark Execution Script
 * Provides parameter validation, environment checking, and automated execution
 * for different benchmark suites with comprehensive logging and error handling.
 */

const fs = require("fs")
const path = require("path")
const { execSync, spawn } = require("child_process")
const yaml = require("js-yaml")

class BenchmarkRunner {
	constructor() {
		this.projectRoot = path.resolve(__dirname, "../..")
		this.benchmarkPath = path.join(
			this.projectRoot,
			"benchmarks/scenario/simple/medical-consent"
		)
		this.networkPath = path.join(
			this.projectRoot,
			"networks/fabric/medical-consent-network.yaml"
		)
		this.logDir = path.join(this.projectRoot, "logs")
		this.reportDir = path.join(this.projectRoot, "reports")

		// Ensure directories exist
		this.ensureDirectories()

		// Available benchmark configurations
		this.availableConfigs = {
			light: "config-light-load.yaml",
			medium: "config-medium-load.yaml",
			heavy: "config-heavy-load.yaml",
			stress: "config-stress-test.yaml",
			"patient-journey": "config-patient-journey-workflow.yaml",
			"doctor-workflow": "config-doctor-workflow.yaml",
			"mixed-operations": "config-mixed-operations-workflow.yaml",
			basic: "config.yaml",
		}
	}

	ensureDirectories() {
		;[this.logDir, this.reportDir].forEach((dir) => {
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}
		})
	}

	log(message, level = "INFO") {
		const timestamp = new Date().toISOString()
		const logMessage = `[${timestamp}] [${level}] ${message}`
		console.log(logMessage)

		// Write to log file
		const logFile = path.join(
			this.logDir,
			`benchmark-${new Date().toISOString().split("T")[0]}.log`
		)
		fs.appendFileSync(logFile, logMessage + "\n")
	}

	validateEnvironment() {
		this.log("Validating environment...")

		// Check if Caliper CLI is available
		try {
			execSync("npx caliper --version", { stdio: "pipe" })
			this.log("Caliper CLI is available")
		} catch (error) {
			throw new Error(
				"Caliper CLI not found. Please install @hyperledger/caliper-cli"
			)
		}

		// Check if network configuration exists
		if (!fs.existsSync(this.networkPath)) {
			throw new Error(`Network configuration not found: ${this.networkPath}`)
		}
		this.log("Network configuration found")

		// Check if benchmark directory exists
		if (!fs.existsSync(this.benchmarkPath)) {
			throw new Error(`Benchmark directory not found: ${this.benchmarkPath}`)
		}
		this.log("Benchmark directory found")

		// Validate Node.js version
		const nodeVersion = process.version
		const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0])
		if (majorVersion < 14) {
			throw new Error(
				`Node.js version ${nodeVersion} is not supported. Please use Node.js 14 or higher.`
			)
		}
		this.log(`Node.js version ${nodeVersion} is supported`)

		this.log("Environment validation completed successfully")
	}

	validateParameters(config, workers, tps) {
		this.log("Validating parameters...")

		// Validate config
		if (!this.availableConfigs[config]) {
			throw new Error(
				`Invalid config: ${config}. Available configs: ${Object.keys(
					this.availableConfigs
				).join(", ")}`
			)
		}

		const configPath = path.join(
			this.benchmarkPath,
			this.availableConfigs[config]
		)
		if (!fs.existsSync(configPath)) {
			throw new Error(`Configuration file not found: ${configPath}`)
		}

		// Validate workers
		if (workers && (workers < 1 || workers > 20)) {
			throw new Error("Workers must be between 1 and 20")
		}

		// Validate TPS
		if (tps && (tps < 1 || tps > 1000)) {
			throw new Error("TPS must be between 1 and 1000")
		}

		this.log("Parameter validation completed successfully")
	}

	async runBenchmark(config, options = {}) {
		const { workers, tps, rounds, duration, reportName } = options

		this.log(`Starting benchmark: ${config}`)
		this.log(`Options: ${JSON.stringify(options)}`)

		const configFile = this.availableConfigs[config]
		const configPath = path.join(this.benchmarkPath, configFile)

		// Generate unique report name
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
		const finalReportName = reportName || `${config}-${timestamp}`
		const reportPath = path.join(this.reportDir, `${finalReportName}.html`)

		// Build Caliper command
		const caliperArgs = [
			"caliper",
			"launch",
			"manager",
			"--caliper-workspace",
			this.projectRoot,
			"--caliper-networkconfig",
			this.networkPath,
			"--caliper-benchconfig",
			configPath,
			"--caliper-report-path",
			reportPath,
		]

		// Add optional parameters
		if (workers) {
			// Note: Worker count is typically configured in the benchmark config file
			this.log(
				`Worker count override requested: ${workers} (may require config file modification)`
			)
		}

		if (tps) {
			// Note: TPS is typically configured in the benchmark config file
			this.log(
				`TPS override requested: ${tps} (may require config file modification)`
			)
		}

		try {
			this.log(`Executing: npx ${caliperArgs.join(" ")}`)

			// Execute benchmark with real-time output
			const benchmark = spawn("npx", caliperArgs, {
				cwd: this.projectRoot,
				stdio: ["inherit", "pipe", "pipe"],
			})

			let output = ""
			let errorOutput = ""

			benchmark.stdout.on("data", (data) => {
				const message = data.toString()
				output += message
				process.stdout.write(message)
				this.log(message.trim(), "CALIPER")
			})

			benchmark.stderr.on("data", (data) => {
				const message = data.toString()
				errorOutput += message
				process.stderr.write(message)
				this.log(message.trim(), "ERROR")
			})

			return new Promise((resolve, reject) => {
				benchmark.on("close", (code) => {
					if (code === 0) {
						this.log(`Benchmark completed successfully. Report: ${reportPath}`)
						resolve({
							success: true,
							reportPath,
							output,
							config,
							timestamp,
						})
					} else {
						this.log(`Benchmark failed with exit code: ${code}`, "ERROR")
						reject(
							new Error(
								`Benchmark execution failed with exit code: ${code}\n${errorOutput}`
							)
						)
					}
				})

				benchmark.on("error", (error) => {
					this.log(`Benchmark execution error: ${error.message}`, "ERROR")
					reject(error)
				})
			})
		} catch (error) {
			this.log(`Benchmark execution failed: ${error.message}`, "ERROR")
			throw error
		}
	}

	async runBenchmarkSuite(suite, options = {}) {
		this.log(`Starting benchmark suite: ${suite}`)

		const suites = {
			"load-testing": ["light", "medium", "heavy"],
			"workflow-testing": [
				"patient-journey",
				"doctor-workflow",
				"mixed-operations",
			],
			"stress-testing": ["stress"],
			"full-suite": [
				"light",
				"medium",
				"heavy",
				"patient-journey",
				"doctor-workflow",
				"mixed-operations",
				"stress",
			],
		}

		if (!suites[suite]) {
			throw new Error(
				`Invalid suite: ${suite}. Available suites: ${Object.keys(suites).join(
					", "
				)}`
			)
		}

		const configs = suites[suite]
		const results = []

		for (const config of configs) {
			try {
				this.log(
					`Running benchmark: ${config} (${configs.indexOf(config) + 1}/${
						configs.length
					})`
				)
				const result = await this.runBenchmark(config, options)
				results.push(result)

				// Wait between benchmarks to allow system recovery
				if (configs.indexOf(config) < configs.length - 1) {
					this.log("Waiting 30 seconds before next benchmark...")
					await new Promise((resolve) => setTimeout(resolve, 30000))
				}
			} catch (error) {
				this.log(`Benchmark ${config} failed: ${error.message}`, "ERROR")
				results.push({
					success: false,
					config,
					error: error.message,
				})

				if (options.stopOnError) {
					throw error
				}
			}
		}

		this.log(
			`Benchmark suite completed. Results: ${
				results.filter((r) => r.success).length
			}/${results.length} successful`
		)
		return results
	}

	listConfigs() {
		console.log("\nAvailable benchmark configurations:")
		Object.entries(this.availableConfigs).forEach(([key, file]) => {
			console.log(`  ${key.padEnd(20)} - ${file}`)
		})

		console.log("\nAvailable benchmark suites:")
		console.log("  load-testing        - Light, Medium, Heavy load tests")
		console.log(
			"  workflow-testing    - Patient Journey, Doctor Workflow, Mixed Operations"
		)
		console.log("  stress-testing      - Stress test configuration")
		console.log("  full-suite          - All benchmark configurations")
	}

	showHelp() {
		console.log(`
Blockchain Performance Benchmark Runner

Usage:
  node runBenchmark.js <command> [options]

Commands:
  run <config>           Run a single benchmark configuration
  suite <suite-name>     Run a benchmark suite
  list                   List available configurations and suites
  help                   Show this help message

Options:
  --workers <number>     Number of workers (1-20)
  --tps <number>         Target TPS (1-1000)
  --report-name <name>   Custom report name
  --stop-on-error        Stop suite execution on first error

Examples:
  node runBenchmark.js run light
  node runBenchmark.js run heavy --workers 5 --tps 50
  node runBenchmark.js suite load-testing
  node runBenchmark.js suite full-suite --stop-on-error
  node runBenchmark.js list
        `)
	}
}

// CLI Interface
async function main() {
	const runner = new BenchmarkRunner()
	const args = process.argv.slice(2)

	if (args.length === 0) {
		runner.showHelp()
		process.exit(1)
	}

	const command = args[0]
	const target = args[1]

	// Parse options
	const options = {}
	for (let i = 2; i < args.length; i++) {
		switch (args[i]) {
			case "--workers":
				options.workers = parseInt(args[++i])
				break
			case "--tps":
				options.tps = parseInt(args[++i])
				break
			case "--report-name":
				options.reportName = args[++i]
				break
			case "--stop-on-error":
				options.stopOnError = true
				break
		}
	}

	try {
		switch (command) {
			case "run":
				if (!target) {
					console.error("Error: Configuration name required for run command")
					process.exit(1)
				}
				runner.validateEnvironment()
				runner.validateParameters(target, options.workers, options.tps)
				await runner.runBenchmark(target, options)
				break

			case "suite":
				if (!target) {
					console.error("Error: Suite name required for suite command")
					process.exit(1)
				}
				runner.validateEnvironment()
				await runner.runBenchmarkSuite(target, options)
				break

			case "list":
				runner.listConfigs()
				break

			case "help":
				runner.showHelp()
				break

			default:
				console.error(`Error: Unknown command: ${command}`)
				runner.showHelp()
				process.exit(1)
		}
	} catch (error) {
		console.error(`Error: ${error.message}`)
		process.exit(1)
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error("Unexpected error:", error)
		process.exit(1)
	})
}

module.exports = BenchmarkRunner
