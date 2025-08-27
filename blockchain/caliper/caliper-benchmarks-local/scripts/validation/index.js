/**
 * Main Validation Entry Point
 *
 * This module provides a unified interface for running network and chaincode validation
 */

const NetworkValidator = require("./networkValidator")
const ChaincodeValidator = require("./chaincodeValidator")
const path = require("path")
const fs = require("fs")

class ValidationSuite {
	constructor(options = {}) {
		this.options = {
			networkConfigPath:
				options.networkConfigPath ||
				path.join(
					__dirname,
					"../../networks/fabric/medical-consent-network.yaml"
				),
			connectionProfilesPath:
				options.connectionProfilesPath ||
				path.join(__dirname, "../../networks/fabric"),
			outputDir:
				options.outputDir || path.join(__dirname, "../../reports/validation"),
			runNetworkValidation: options.runNetworkValidation !== false,
			runChaincodeValidation: options.runChaincodeValidation !== false,
			exportResults: options.exportResults !== false,
		}

		this.networkValidator = null
		this.chaincodeValidator = null
		this.results = {
			timestamp: new Date().toISOString(),
			network: null,
			chaincode: null,
			overall: false,
		}
	}

	/**
	 * Initialize validators
	 */
	async initialize() {
		try {
			// Ensure output directory exists
			if (
				this.options.exportResults &&
				!fs.existsSync(this.options.outputDir)
			) {
				fs.mkdirSync(this.options.outputDir, { recursive: true })
			}

			if (this.options.runNetworkValidation) {
				this.networkValidator = new NetworkValidator(
					this.options.networkConfigPath,
					this.options.connectionProfilesPath
				)
			}

			if (this.options.runChaincodeValidation) {
				this.chaincodeValidator = new ChaincodeValidator(
					this.options.networkConfigPath,
					this.options.connectionProfilesPath
				)
			}

			console.log("✓ Validation suite initialized")
			return true
		} catch (error) {
			console.error("✗ Failed to initialize validation suite:", error.message)
			return false
		}
	}

	/**
	 * Run network validation
	 */
	async runNetworkValidation() {
		if (!this.networkValidator) {
			console.log("⚠️  Network validation skipped (disabled)")
			return true
		}

		console.log("\n🌐 Running Network Validation...")
		console.log("==================================")

		try {
			this.results.network = await this.networkValidator.validateNetwork()
			return this.results.network.overall
		} catch (error) {
			console.error("Network validation failed:", error.message)
			this.results.network = { overall: false, error: error.message }
			return false
		}
	}

	/**
	 * Run chaincode validation
	 */
	async runChaincodeValidation() {
		if (!this.chaincodeValidator) {
			console.log("⚠️  Chaincode validation skipped (disabled)")
			return true
		}

		console.log("\n⛓️  Running Chaincode Validation...")
		console.log("===================================")

		try {
			this.results.chaincode = await this.chaincodeValidator.validateChaincode()
			return this.results.chaincode.overall
		} catch (error) {
			console.error("Chaincode validation failed:", error.message)
			this.results.chaincode = { overall: false, error: error.message }
			return false
		}
	}

	/**
	 * Run complete validation suite
	 */
	async runValidation() {
		console.log("🚀 Starting Complete Blockchain Validation Suite")
		console.log("================================================\n")

		const initialized = await this.initialize()
		if (!initialized) {
			return false
		}

		// Run validations
		const networkResult = await this.runNetworkValidation()
		const chaincodeResult = await this.runChaincodeValidation()

		// Calculate overall result
		this.results.overall = networkResult && chaincodeResult

		// Generate final summary
		this.generateFinalSummary()

		// Export results if enabled
		if (this.options.exportResults) {
			await this.exportResults()
		}

		return this.results.overall
	}

	/**
	 * Generate final validation summary
	 */
	generateFinalSummary() {
		console.log("\n🎯 Final Validation Summary")
		console.log("============================")

		if (this.results.network) {
			const networkStatus = this.results.network.overall
				? "✅ PASSED"
				: "❌ FAILED"
			console.log(`Network Validation: ${networkStatus}`)

			if (this.results.network.overall) {
				const peerCount = Object.keys(this.results.network.peers || {}).length
				const ordererCount = Object.keys(
					this.results.network.orderers || {}
				).length
				const caCount = Object.keys(
					this.results.network.certificateAuthorities || {}
				).length
				console.log(`  - ${peerCount} peers validated`)
				console.log(`  - ${ordererCount} orderers validated`)
				console.log(`  - ${caCount} CAs validated`)
			}
		}

		if (this.results.chaincode) {
			const chaincodeStatus = this.results.chaincode.overall
				? "✅ PASSED"
				: "❌ FAILED"
			console.log(`Chaincode Validation: ${chaincodeStatus}`)

			if (this.results.chaincode.chaincode) {
				const functionCount = Object.keys(
					this.results.chaincode.chaincode.functions || {}
				).length
				const availableFunctions = Object.values(
					this.results.chaincode.chaincode.functions || {}
				).filter((f) => f.available).length
				console.log(
					`  - ${availableFunctions}/${functionCount} functions available`
				)
				console.log(
					`  - Version: ${
						this.results.chaincode.chaincode.version || "Unknown"
					}`
				)
			}
		}

		const overallStatus = this.results.overall
			? "🎉 ALL SYSTEMS OPERATIONAL"
			: "⚠️  ISSUES DETECTED"
		console.log(`\nOverall Status: ${overallStatus}`)

		if (!this.results.overall) {
			console.log("\n🔧 Recommended Actions:")
			if (this.results.network && !this.results.network.overall) {
				console.log("  - Check network connectivity and TLS certificates")
				console.log("  - Verify all blockchain components are running")
			}
			if (this.results.chaincode && !this.results.chaincode.overall) {
				console.log("  - Verify chaincode deployment and instantiation")
				console.log("  - Check chaincode function implementations")
			}
		}
	}

	/**
	 * Export validation results
	 */
	async exportResults() {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
			const filename = `validation-report-${timestamp}.json`
			const outputPath = path.join(this.options.outputDir, filename)

			fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2))
			console.log(`\n📄 Complete validation report exported to: ${outputPath}`)

			// Also export individual reports if validators exist
			if (this.networkValidator && this.results.network) {
				const networkReportPath = path.join(
					this.options.outputDir,
					`network-validation-${timestamp}.json`
				)
				await this.networkValidator.exportResults(networkReportPath)
			}

			if (this.chaincodeValidator && this.results.chaincode) {
				const chaincodeReportPath = path.join(
					this.options.outputDir,
					`chaincode-validation-${timestamp}.json`
				)
				await this.chaincodeValidator.exportResults(chaincodeReportPath)
			}

			return true
		} catch (error) {
			console.error("Failed to export validation results:", error.message)
			return false
		}
	}

	/**
	 * Run quick health check (minimal validation)
	 */
	async quickHealthCheck() {
		console.log("⚡ Running Quick Health Check...\n")

		const options = {
			...this.options,
			exportResults: false,
		}

		const suite = new ValidationSuite(options)
		const result = await suite.runValidation()

		return result
	}
}

// CLI interface
async function main() {
	const args = process.argv.slice(2)
	const options = {}

	// Parse command line arguments
	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--network-only":
				options.runChaincodeValidation = false
				break
			case "--chaincode-only":
				options.runNetworkValidation = false
				break
			case "--no-export":
				options.exportResults = false
				break
			case "--quick":
				return await new ValidationSuite(options).quickHealthCheck()
			case "--output-dir":
				options.outputDir = args[++i]
				break
			case "--network-config":
				options.networkConfigPath = args[++i]
				break
			case "--help":
				console.log(`
Blockchain Validation Suite

Usage: node index.js [options]

Options:
  --network-only      Run only network validation
  --chaincode-only    Run only chaincode validation
  --no-export         Don't export validation reports
  --quick             Run quick health check
  --output-dir <dir>  Specify output directory for reports
  --network-config <path>  Specify network configuration file
  --help              Show this help message

Examples:
  node index.js                    # Run complete validation
  node index.js --quick            # Quick health check
  node index.js --network-only     # Network validation only
  node index.js --chaincode-only   # Chaincode validation only
                `)
				return
		}
	}

	const suite = new ValidationSuite(options)
	const success = await suite.runValidation()

	process.exit(success ? 0 : 1)
}

// Export for programmatic use
module.exports = {
	ValidationSuite,
	NetworkValidator,
	ChaincodeValidator,
}

// Run CLI if this file is executed directly
if (require.main === module) {
	main().catch((error) => {
		console.error("Validation suite failed:", error.message)
		process.exit(1)
	})
}
