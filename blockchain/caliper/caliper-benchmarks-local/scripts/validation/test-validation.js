/**
 * Test script for validation system
 *
 * This script provides basic testing capabilities for the validation modules
 * without requiring a full blockchain network to be running.
 */

const {
	ValidationSuite,
	NetworkValidator,
	ChaincodeValidator,
} = require("./index")
const path = require("path")
const fs = require("fs")

class ValidationTester {
	constructor() {
		this.testResults = {
			configurationLoading: false,
			networkValidatorInit: false,
			chaincodeValidatorInit: false,
			validationSuiteInit: false,
			errors: [],
		}
	}

	/**
	 * Test configuration file loading
	 */
	async testConfigurationLoading() {
		console.log("🧪 Testing configuration loading...")

		try {
			const networkConfigPath = path.join(
				__dirname,
				"../../networks/fabric/medical-consent-network.yaml"
			)
			const connectionProfilesPath = path.join(
				__dirname,
				"../../networks/fabric"
			)

			// Check if files exist
			if (!fs.existsSync(networkConfigPath)) {
				throw new Error(`Network config not found: ${networkConfigPath}`)
			}

			const networkValidator = new NetworkValidator(
				networkConfigPath,
				connectionProfilesPath
			)
			const configLoaded = await networkValidator.loadConfigurations()

			if (configLoaded) {
				console.log("  ✅ Configuration loading test passed")
				this.testResults.configurationLoading = true
			} else {
				throw new Error("Configuration loading returned false")
			}
		} catch (error) {
			console.log(`  ❌ Configuration loading test failed: ${error.message}`)
			this.testResults.errors.push(`Configuration loading: ${error.message}`)
		}
	}

	/**
	 * Test NetworkValidator initialization
	 */
	async testNetworkValidatorInit() {
		console.log("🧪 Testing NetworkValidator initialization...")

		try {
			const networkConfigPath = path.join(
				__dirname,
				"../../networks/fabric/medical-consent-network.yaml"
			)
			const connectionProfilesPath = path.join(
				__dirname,
				"../../networks/fabric"
			)

			const validator = new NetworkValidator(
				networkConfigPath,
				connectionProfilesPath
			)

			// Test basic properties
			if (validator.networkConfigPath && validator.connectionProfilesPath) {
				console.log("  ✅ NetworkValidator initialization test passed")
				this.testResults.networkValidatorInit = true
			} else {
				throw new Error("NetworkValidator properties not set correctly")
			}
		} catch (error) {
			console.log(
				`  ❌ NetworkValidator initialization test failed: ${error.message}`
			)
			this.testResults.errors.push(`NetworkValidator init: ${error.message}`)
		}
	}

	/**
	 * Test ChaincodeValidator initialization
	 */
	async testChaincodeValidatorInit() {
		console.log("🧪 Testing ChaincodeValidator initialization...")

		try {
			const networkConfigPath = path.join(
				__dirname,
				"../../networks/fabric/medical-consent-network.yaml"
			)
			const connectionProfilesPath = path.join(
				__dirname,
				"../../networks/fabric"
			)

			const validator = new ChaincodeValidator(
				networkConfigPath,
				connectionProfilesPath
			)

			// Test basic properties
			if (
				validator.networkConfigPath &&
				validator.connectionProfilesPath &&
				validator.expectedFunctions.length > 0
			) {
				console.log("  ✅ ChaincodeValidator initialization test passed")
				console.log(
					`    Expected functions: ${validator.expectedFunctions.length}`
				)
				this.testResults.chaincodeValidatorInit = true
			} else {
				throw new Error("ChaincodeValidator properties not set correctly")
			}
		} catch (error) {
			console.log(
				`  ❌ ChaincodeValidator initialization test failed: ${error.message}`
			)
			this.testResults.errors.push(`ChaincodeValidator init: ${error.message}`)
		}
	}

	/**
	 * Test ValidationSuite initialization
	 */
	async testValidationSuiteInit() {
		console.log("🧪 Testing ValidationSuite initialization...")

		try {
			const suite = new ValidationSuite({
				exportResults: false,
				runNetworkValidation: true,
				runChaincodeValidation: true,
			})

			const initialized = await suite.initialize()

			if (initialized) {
				console.log("  ✅ ValidationSuite initialization test passed")
				this.testResults.validationSuiteInit = true
			} else {
				throw new Error("ValidationSuite initialization returned false")
			}
		} catch (error) {
			console.log(
				`  ❌ ValidationSuite initialization test failed: ${error.message}`
			)
			this.testResults.errors.push(`ValidationSuite init: ${error.message}`)
		}
	}

	/**
	 * Test TLS certificate validation (mock)
	 */
	async testTLSValidation() {
		console.log("🧪 Testing TLS certificate validation...")

		try {
			const networkConfigPath = path.join(
				__dirname,
				"../../networks/fabric/medical-consent-network.yaml"
			)
			const connectionProfilesPath = path.join(
				__dirname,
				"../../networks/fabric"
			)

			const validator = new NetworkValidator(
				networkConfigPath,
				connectionProfilesPath
			)

			// Test with a non-existent certificate (should fail gracefully)
			const result = await validator.validateTLSCertificate(
				"/non/existent/cert.pem",
				"test-cert"
			)

			if (result === false) {
				console.log(
					"  ✅ TLS validation test passed (correctly handled missing cert)"
				)
			} else {
				throw new Error(
					"TLS validation should have failed for non-existent certificate"
				)
			}
		} catch (error) {
			console.log(`  ❌ TLS validation test failed: ${error.message}`)
			this.testResults.errors.push(`TLS validation: ${error.message}`)
		}
	}

	/**
	 * Run all tests
	 */
	async runAllTests() {
		console.log("🚀 Starting Validation System Tests\n")
		console.log("===================================\n")

		await this.testConfigurationLoading()
		await this.testNetworkValidatorInit()
		await this.testChaincodeValidatorInit()
		await this.testValidationSuiteInit()
		await this.testTLSValidation()

		this.generateTestSummary()

		return this.testResults
	}

	/**
	 * Generate test summary
	 */
	generateTestSummary() {
		console.log("\n📊 Test Summary")
		console.log("================")

		const tests = [
			{
				name: "Configuration Loading",
				result: this.testResults.configurationLoading,
			},
			{
				name: "NetworkValidator Init",
				result: this.testResults.networkValidatorInit,
			},
			{
				name: "ChaincodeValidator Init",
				result: this.testResults.chaincodeValidatorInit,
			},
			{
				name: "ValidationSuite Init",
				result: this.testResults.validationSuiteInit,
			},
		]

		let passedTests = 0
		tests.forEach((test) => {
			const status = test.result ? "✅ PASS" : "❌ FAIL"
			console.log(`${test.name}: ${status}`)
			if (test.result) passedTests++
		})

		const overallStatus =
			passedTests === tests.length
				? "✅ ALL TESTS PASSED"
				: "❌ SOME TESTS FAILED"
		console.log(`\nOverall: ${overallStatus} (${passedTests}/${tests.length})`)

		if (this.testResults.errors.length > 0) {
			console.log("\n⚠️  Errors:")
			this.testResults.errors.forEach((error) => console.log(`  - ${error}`))
		}

		console.log("\n💡 Note: These are basic initialization tests.")
		console.log("   Full validation requires a running blockchain network.")
	}
}

// CLI interface
async function main() {
	const tester = new ValidationTester()
	const results = await tester.runAllTests()

	const success =
		results.configurationLoading &&
		results.networkValidatorInit &&
		results.chaincodeValidatorInit &&
		results.validationSuiteInit

	process.exit(success ? 0 : 1)
}

// Export for programmatic use
module.exports = ValidationTester

// Run tests if this file is executed directly
if (require.main === module) {
	main().catch((error) => {
		console.error("Test execution failed:", error.message)
		process.exit(1)
	})
}
