#!/usr/bin/env node

/**
 * Environment Validation Script
 * Comprehensive validation of the blockchain performance testing environment
 * including network connectivity, dependencies, and configuration files.
 */

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const yaml = require("js-yaml")

class EnvironmentValidator {
	constructor() {
		this.projectRoot = path.resolve(__dirname, "../..")
		this.errors = []
		this.warnings = []
		this.info = []
	}

	log(message, level = "INFO") {
		const timestamp = new Date().toISOString()
		const logMessage = `[${timestamp}] [${level}] ${message}`

		switch (level) {
			case "ERROR":
				console.error(`❌ ${message}`)
				this.errors.push(message)
				break
			case "WARNING":
				console.warn(`⚠️  ${message}`)
				this.warnings.push(message)
				break
			case "SUCCESS":
				console.log(`✅ ${message}`)
				break
			default:
				console.log(`ℹ️  ${message}`)
				this.info.push(message)
		}
	}

	async validateNodeJs() {
		this.log("Validating Node.js installation...")

		try {
			const version = execSync("node --version", { encoding: "utf8" }).trim()
			const majorVersion = parseInt(version.slice(1).split(".")[0])

			if (majorVersion >= 14) {
				this.log(`Node.js ${version} is supported`, "SUCCESS")
			} else {
				this.log(
					`Node.js ${version} is not supported. Please upgrade to Node.js 14 or higher`,
					"ERROR"
				)
			}
		} catch (error) {
			this.log("Node.js is not installed or not in PATH", "ERROR")
		}
	}

	async validateNpm() {
		this.log("Validating npm installation...")

		try {
			const version = execSync("npm --version", { encoding: "utf8" }).trim()
			this.log(`npm ${version} is available`, "SUCCESS")
		} catch (error) {
			this.log("npm is not installed or not in PATH", "ERROR")
		}
	}

	async validateCaliper() {
		this.log("Validating Hyperledger Caliper...")

		try {
			// Check if Caliper CLI is available
			const version = execSync("npx caliper --version", {
				encoding: "utf8",
				stdio: "pipe",
			}).trim()
			this.log(`Caliper CLI is available: ${version}`, "SUCCESS")
		} catch (error) {
			this.log(
				"Caliper CLI not found. Run: npm install @hyperledger/caliper-cli",
				"ERROR"
			)
		}

		// Check package.json for Caliper dependencies
		const packageJsonPath = path.join(this.projectRoot, "package.json")
		if (fs.existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
				const dependencies = {
					...packageJson.dependencies,
					...packageJson.devDependencies,
				}

				const caliperDeps = Object.keys(dependencies).filter((dep) =>
					dep.includes("caliper")
				)
				if (caliperDeps.length > 0) {
					this.log(
						`Caliper dependencies found: ${caliperDeps.join(", ")}`,
						"SUCCESS"
					)
				} else {
					this.log("No Caliper dependencies found in package.json", "WARNING")
				}
			} catch (error) {
				this.log(`Error reading package.json: ${error.message}`, "ERROR")
			}
		}
	}

	async validateProjectStructure() {
		this.log("Validating project structure...")

		const requiredPaths = [
			"benchmarks/scenario/simple/medical-consent",
			"networks/fabric",
			"scripts/execution",
			"scripts/reporting",
		]

		requiredPaths.forEach((relativePath) => {
			const fullPath = path.join(this.projectRoot, relativePath)
			if (fs.existsSync(fullPath)) {
				this.log(`Directory exists: ${relativePath}`, "SUCCESS")
			} else {
				this.log(`Missing directory: ${relativePath}`, "ERROR")
			}
		})
	}

	async validateNetworkConfiguration() {
		this.log("Validating network configuration...")

		const networkConfigPath = path.join(
			this.projectRoot,
			"networks/fabric/medical-consent-network.yaml"
		)

		if (!fs.existsSync(networkConfigPath)) {
			this.log("Network configuration file not found", "ERROR")
			return
		}

		try {
			const networkConfig = yaml.load(
				fs.readFileSync(networkConfigPath, "utf8")
			)

			// Validate basic structure
			if (networkConfig.name) {
				this.log(`Network name: ${networkConfig.name}`, "SUCCESS")
			} else {
				this.log("Network name not specified", "WARNING")
			}

			if (networkConfig.caliper && networkConfig.caliper.blockchain) {
				this.log(
					`Blockchain type: ${networkConfig.caliper.blockchain}`,
					"SUCCESS"
				)
			} else {
				this.log("Blockchain type not specified", "ERROR")
			}

			// Check for channels
			if (
				networkConfig.channels &&
				Object.keys(networkConfig.channels).length > 0
			) {
				const channelNames = Object.keys(networkConfig.channels)
				this.log(`Channels configured: ${channelNames.join(", ")}`, "SUCCESS")
			} else {
				this.log("No channels configured", "ERROR")
			}

			// Check for organizations
			if (
				networkConfig.organizations &&
				Object.keys(networkConfig.organizations).length > 0
			) {
				const orgNames = Object.keys(networkConfig.organizations)
				this.log(`Organizations configured: ${orgNames.join(", ")}`, "SUCCESS")
			} else {
				this.log("No organizations configured", "ERROR")
			}
		} catch (error) {
			this.log(`Error parsing network configuration: ${error.message}`, "ERROR")
		}
	}

	async validateConnectionProfiles() {
		this.log("Validating connection profiles...")

		const connectionDir = path.join(this.projectRoot, "networks/fabric")
		const expectedProfiles = [
			"connection-org1-caliper.json",
			"connection-org2-caliper.json",
		]

		expectedProfiles.forEach((profile) => {
			const profilePath = path.join(connectionDir, profile)
			if (fs.existsSync(profilePath)) {
				try {
					const connectionProfile = JSON.parse(
						fs.readFileSync(profilePath, "utf8")
					)

					if (connectionProfile.name) {
						this.log(
							`Connection profile ${profile}: ${connectionProfile.name}`,
							"SUCCESS"
						)
					} else {
						this.log(`Connection profile ${profile} missing name`, "WARNING")
					}

					// Check for peers
					if (
						connectionProfile.peers &&
						Object.keys(connectionProfile.peers).length > 0
					) {
						const peerCount = Object.keys(connectionProfile.peers).length
						this.log(
							`${profile} has ${peerCount} peer(s) configured`,
							"SUCCESS"
						)
					} else {
						this.log(`${profile} has no peers configured`, "ERROR")
					}
				} catch (error) {
					this.log(`Error parsing ${profile}: ${error.message}`, "ERROR")
				}
			} else {
				this.log(`Connection profile not found: ${profile}`, "ERROR")
			}
		})
	}

	async validateBenchmarkConfigurations() {
		this.log("Validating benchmark configurations...")

		const benchmarkDir = path.join(
			this.projectRoot,
			"benchmarks/scenario/simple/medical-consent"
		)

		if (!fs.existsSync(benchmarkDir)) {
			this.log("Benchmark directory not found", "ERROR")
			return
		}

		const configFiles = fs
			.readdirSync(benchmarkDir)
			.filter((file) => file.startsWith("config") && file.endsWith(".yaml"))

		if (configFiles.length === 0) {
			this.log("No benchmark configuration files found", "ERROR")
			return
		}

		this.log(
			`Found ${configFiles.length} benchmark configuration(s)`,
			"SUCCESS"
		)

		configFiles.forEach((configFile) => {
			const configPath = path.join(benchmarkDir, configFile)
			try {
				const config = yaml.load(fs.readFileSync(configPath, "utf8"))

				if (config.test && config.test.rounds) {
					const roundCount = config.test.rounds.length
					this.log(`${configFile}: ${roundCount} test round(s)`, "SUCCESS")
				} else {
					this.log(`${configFile}: No test rounds configured`, "WARNING")
				}
			} catch (error) {
				this.log(`Error parsing ${configFile}: ${error.message}`, "ERROR")
			}
		})
	}

	async validateWorkloadModules() {
		this.log("Validating workload modules...")

		const benchmarkDir = path.join(
			this.projectRoot,
			"benchmarks/scenario/simple/medical-consent"
		)

		if (!fs.existsSync(benchmarkDir)) {
			this.log("Benchmark directory not found", "ERROR")
			return
		}

		const workloadFiles = fs
			.readdirSync(benchmarkDir)
			.filter((file) => file.endsWith(".js") && !file.startsWith("config"))

		if (workloadFiles.length === 0) {
			this.log("No workload modules found", "ERROR")
			return
		}

		this.log(`Found ${workloadFiles.length} workload module(s)`, "SUCCESS")

		// Validate each workload module
		workloadFiles.forEach((workloadFile) => {
			const workloadPath = path.join(benchmarkDir, workloadFile)
			try {
				const content = fs.readFileSync(workloadPath, "utf8")

				// Check for required methods
				const requiredMethods = [
					"initializeWorkloadModule",
					"submitTransaction",
					"cleanupWorkloadModule",
				]
				const missingMethods = requiredMethods.filter(
					(method) => !content.includes(method)
				)

				if (missingMethods.length === 0) {
					this.log(`${workloadFile}: All required methods present`, "SUCCESS")
				} else {
					this.log(
						`${workloadFile}: Missing methods: ${missingMethods.join(", ")}`,
						"WARNING"
					)
				}
			} catch (error) {
				this.log(`Error reading ${workloadFile}: ${error.message}`, "ERROR")
			}
		})
	}

	async validateDirectories() {
		this.log("Validating output directories...")

		const directories = ["logs", "reports"]

		directories.forEach((dir) => {
			const dirPath = path.join(this.projectRoot, dir)
			if (!fs.existsSync(dirPath)) {
				try {
					fs.mkdirSync(dirPath, { recursive: true })
					this.log(`Created directory: ${dir}`, "SUCCESS")
				} catch (error) {
					this.log(
						`Failed to create directory ${dir}: ${error.message}`,
						"ERROR"
					)
				}
			} else {
				this.log(`Directory exists: ${dir}`, "SUCCESS")
			}
		})
	}

	async validateDependencies() {
		this.log("Validating additional dependencies...")

		const requiredModules = ["js-yaml", "path", "fs", "child_process"]

		requiredModules.forEach((module) => {
			try {
				require.resolve(module)
				this.log(`Module available: ${module}`, "SUCCESS")
			} catch (error) {
				if (module === "js-yaml") {
					this.log(
						`Module not found: ${module}. Run: npm install js-yaml`,
						"ERROR"
					)
				} else {
					this.log(`Core module not available: ${module}`, "ERROR")
				}
			}
		})
	}

	async runAllValidations() {
		console.log("🔍 Starting comprehensive environment validation...\n")

		await this.validateNodeJs()
		await this.validateNpm()
		await this.validateCaliper()
		await this.validateProjectStructure()
		await this.validateNetworkConfiguration()
		await this.validateConnectionProfiles()
		await this.validateBenchmarkConfigurations()
		await this.validateWorkloadModules()
		await this.validateDirectories()
		await this.validateDependencies()

		this.printSummary()
	}

	printSummary() {
		console.log("\n" + "=".repeat(60))
		console.log("📊 VALIDATION SUMMARY")
		console.log("=".repeat(60))

		if (this.errors.length === 0) {
			console.log("✅ Environment validation PASSED")
			console.log("🚀 Ready to run blockchain performance benchmarks!")
		} else {
			console.log("❌ Environment validation FAILED")
			console.log(
				`📋 Found ${this.errors.length} error(s) and ${this.warnings.length} warning(s)`
			)

			if (this.errors.length > 0) {
				console.log("\n🔴 ERRORS TO FIX:")
				this.errors.forEach((error, index) => {
					console.log(`  ${index + 1}. ${error}`)
				})
			}

			if (this.warnings.length > 0) {
				console.log("\n🟡 WARNINGS TO CONSIDER:")
				this.warnings.forEach((warning, index) => {
					console.log(`  ${index + 1}. ${warning}`)
				})
			}
		}

		console.log("=".repeat(60))

		return this.errors.length === 0
	}
}

// CLI execution
if (require.main === module) {
	const validator = new EnvironmentValidator()
	validator
		.runAllValidations()
		.then((success) => {
			process.exit(success ? 0 : 1)
		})
		.catch((error) => {
			console.error("Unexpected error during validation:", error)
			process.exit(1)
		})
}

module.exports = EnvironmentValidator
