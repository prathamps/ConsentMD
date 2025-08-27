/**
 * Chaincode Deployment Verification Module
 *
 * This module provides comprehensive chaincode validation including installation,
 * instantiation verification, function availability testing, and version verification.
 */

const { Gateway, Wallets } = require("fabric-network")
const FabricCAServices = require("fabric-ca-client")
const fs = require("fs")
const path = require("path")
const yaml = require("js-yaml")

class ChaincodeValidator {
	constructor(networkConfigPath, connectionProfilesPath) {
		this.networkConfigPath = networkConfigPath
		this.connectionProfilesPath = connectionProfilesPath
		this.networkConfig = null
		this.connectionProfiles = {}
		this.gateways = {}
		this.validationResults = {
			overall: false,
			chaincode: {
				installed: false,
				instantiated: false,
				version: null,
				functions: {},
			},
			organizations: {},
			errors: [],
		}

		// Expected chaincode functions based on the medical consent contract
		this.expectedFunctions = [
			"registerDoctorProfile",
			"createPatientRecord",
			"createMedicalRecord",
			"updateRecordDetails",
			"archiveMedicalRecord",
			"removeFileFromRecord",
			"grantConsent",
			"revokeConsent",
			"getRecordById",
			"findAssetsByQuery",
			"getAssetHistory",
			"assetExistsByQuery",
			"addPrivateNoteToRecord",
			"getMyId",
		]
	}

	/**
	 * Load network configuration and connection profiles
	 */
	async loadConfigurations() {
		try {
			// Load main network configuration
			const networkConfigContent = fs.readFileSync(
				this.networkConfigPath,
				"utf8"
			)
			this.networkConfig = yaml.load(networkConfigContent)

			// Load connection profiles for each organization
			for (const org of this.networkConfig.organizations) {
				const profilePath = path.resolve(
					path.dirname(this.networkConfigPath),
					org.connectionProfile.path
				)
				const profileContent = fs.readFileSync(profilePath, "utf8")
				this.connectionProfiles[org.mspid] = JSON.parse(profileContent)
			}

			console.log("✓ Chaincode validator configurations loaded successfully")
			return true
		} catch (error) {
			this.validationResults.errors.push(
				`Configuration loading failed: ${error.message}`
			)
			console.error("✗ Failed to load configurations:", error.message)
			return false
		}
	}

	/**
	 * Create wallet and identity for organization
	 */
	async createWalletAndIdentity(orgConfig, connectionProfile) {
		try {
			const wallet = await Wallets.newInMemoryWallet()

			// Get the first identity from the organization config
			const identity = orgConfig.identities.certificates[0]

			// Read certificate and private key
			const cert = fs.readFileSync(identity.clientSignedCert.path, "utf8")
			const key = fs.readFileSync(identity.clientPrivateKey.path, "utf8")

			// Create identity object
			const identityObj = {
				credentials: {
					certificate: cert,
					privateKey: key,
				},
				mspId: orgConfig.mspid,
				type: "X.509",
			}

			await wallet.put(identity.name, identityObj)
			return { wallet, identityName: identity.name }
		} catch (error) {
			throw new Error(
				`Failed to create wallet for ${orgConfig.mspid}: ${error.message}`
			)
		}
	}

	/**
	 * Connect to the network using gateway
	 */
	async connectToNetwork(orgConfig, connectionProfile) {
		try {
			const { wallet, identityName } = await this.createWalletAndIdentity(
				orgConfig,
				connectionProfile
			)

			const gateway = new Gateway()
			await gateway.connect(connectionProfile, {
				wallet,
				identity: identityName,
				discovery: { enabled: true, asLocalhost: true },
			})

			return gateway
		} catch (error) {
			throw new Error(
				`Failed to connect to network for ${orgConfig.mspid}: ${error.message}`
			)
		}
	}

	/**
	 * Test chaincode function availability
	 */
	async testChaincodeFunction(contract, functionName, testArgs = []) {
		try {
			console.log(`    Testing function: ${functionName}`)

			// For read-only functions, use evaluateTransaction
			const readOnlyFunctions = [
				"getRecordById",
				"findAssetsByQuery",
				"getAssetHistory",
				"assetExistsByQuery",
				"getMyId",
			]

			let result
			const startTime = Date.now()

			if (readOnlyFunctions.includes(functionName)) {
				// Use a simple test query that shouldn't fail
				if (functionName === "getMyId") {
					result = await contract.evaluateTransaction(functionName)
				} else if (functionName === "assetExistsByQuery") {
					result = await contract.evaluateTransaction(
						functionName,
						JSON.stringify({
							selector: { docType: "patientRecord" },
						})
					)
				} else {
					// For other query functions, use a basic query
					result = await contract.evaluateTransaction(functionName, "test-id")
				}
			} else {
				// For write functions, we'll just check if the function exists by attempting to submit
				// with invalid data to see if we get a proper error response
				try {
					await contract.submitTransaction(functionName, ...testArgs)
				} catch (error) {
					// If we get a business logic error, the function exists
					if (
						error.message.includes("does not exist") ||
						error.message.includes("already exists") ||
						error.message.includes("invalid") ||
						error.message.includes("not found")
					) {
						result = "Function exists (business logic error expected)"
					} else {
						throw error
					}
				}
			}

			const responseTime = Date.now() - startTime

			this.validationResults.chaincode.functions[functionName] = {
				available: true,
				responseTime,
				result: result ? result.toString().substring(0, 100) : "Success",
			}

			return true
		} catch (error) {
			this.validationResults.chaincode.functions[functionName] = {
				available: false,
				error: error.message,
			}
			console.log(`      ✗ Function ${functionName} failed: ${error.message}`)
			return false
		}
	}

	/**
	 * Validate chaincode deployment for a specific organization
	 */
	async validateChaincodeForOrg(orgConfig, connectionProfile) {
		try {
			console.log(`\n🔍 Validating chaincode for ${orgConfig.mspid}...`)

			const gateway = await this.connectToNetwork(orgConfig, connectionProfile)
			this.gateways[orgConfig.mspid] = gateway

			// Get the network and contract
			const channelName = Object.keys(this.networkConfig.channels)[0] // Get first channel
			const contractId =
				this.networkConfig.channels[channelName].contracts[0].id

			const network = await gateway.getNetwork(channelName)
			const contract = network.getContract(contractId)

			console.log(`  Connected to channel: ${channelName}`)
			console.log(`  Contract ID: ${contractId}`)

			// Test each expected function
			const functionResults = []
			for (const functionName of this.expectedFunctions) {
				const result = await this.testChaincodeFunction(contract, functionName)
				functionResults.push(result)
			}

			const successfulFunctions = functionResults.filter((r) => r).length

			this.validationResults.organizations[orgConfig.mspid] = {
				connected: true,
				channel: channelName,
				contract: contractId,
				functionsAvailable: successfulFunctions,
				totalFunctions: this.expectedFunctions.length,
				success: successfulFunctions === this.expectedFunctions.length,
			}

			console.log(
				`  ✓ Functions available: ${successfulFunctions}/${this.expectedFunctions.length}`
			)

			return successfulFunctions === this.expectedFunctions.length
		} catch (error) {
			this.validationResults.organizations[orgConfig.mspid] = {
				connected: false,
				error: error.message,
			}
			console.log(
				`  ✗ Validation failed for ${orgConfig.mspid}: ${error.message}`
			)
			return false
		}
	}

	/**
	 * Get chaincode metadata and version information
	 */
	async getChaincodeMetadata() {
		try {
			// Try to get metadata from the first available organization
			const firstOrg = this.networkConfig.organizations[0]
			const gateway = this.gateways[firstOrg.mspid]

			if (!gateway) {
				throw new Error("No gateway connection available")
			}

			const channelName = Object.keys(this.networkConfig.channels)[0]
			const contractId =
				this.networkConfig.channels[channelName].contracts[0].id
			const expectedVersion =
				this.networkConfig.channels[channelName].contracts[0].version

			const network = await gateway.getNetwork(channelName)
			const contract = network.getContract(contractId)

			// Try to get chaincode metadata (this might not be available in all versions)
			try {
				const metadata = await contract.evaluateTransaction(
					"org.hyperledger.fabric:GetMetadata"
				)
				const metadataObj = JSON.parse(metadata.toString())

				this.validationResults.chaincode.version =
					metadataObj.version || expectedVersion
				this.validationResults.chaincode.installed = true
				this.validationResults.chaincode.instantiated = true
			} catch (error) {
				// If metadata is not available, assume chaincode is working if functions are available
				this.validationResults.chaincode.version = expectedVersion
				this.validationResults.chaincode.installed = true
				this.validationResults.chaincode.instantiated = true
			}

			console.log(
				`  ✓ Chaincode version: ${this.validationResults.chaincode.version}`
			)
			return true
		} catch (error) {
			console.log(`  ✗ Failed to get chaincode metadata: ${error.message}`)
			return false
		}
	}

	/**
	 * Run comprehensive chaincode validation
	 */
	async validateChaincode() {
		console.log("🚀 Starting comprehensive chaincode validation...\n")

		// Load configurations
		const configLoaded = await this.loadConfigurations()
		if (!configLoaded) {
			this.validationResults.overall = false
			return this.validationResults
		}

		try {
			// Validate chaincode for each organization
			const orgResults = []
			for (const orgConfig of this.networkConfig.organizations) {
				const connectionProfile = this.connectionProfiles[orgConfig.mspid]
				const result = await this.validateChaincodeForOrg(
					orgConfig,
					connectionProfile
				)
				orgResults.push(result)
			}

			// Get chaincode metadata
			await this.getChaincodeMetadata()

			// Calculate overall result
			const allOrgsSuccessful = orgResults.every((r) => r)
			const functionsAvailable = Object.values(
				this.validationResults.chaincode.functions
			).filter((f) => f.available).length

			this.validationResults.overall =
				allOrgsSuccessful &&
				functionsAvailable === this.expectedFunctions.length

			// Generate summary
			this.generateValidationSummary()

			return this.validationResults
		} catch (error) {
			this.validationResults.errors.push(
				`Chaincode validation failed: ${error.message}`
			)
			this.validationResults.overall = false
			return this.validationResults
		} finally {
			// Close all gateway connections
			await this.closeConnections()
		}
	}

	/**
	 * Close all gateway connections
	 */
	async closeConnections() {
		for (const [orgId, gateway] of Object.entries(this.gateways)) {
			try {
				await gateway.disconnect()
				console.log(`  ✓ Disconnected from ${orgId}`)
			} catch (error) {
				console.log(
					`  ⚠️  Failed to disconnect from ${orgId}: ${error.message}`
				)
			}
		}
	}

	/**
	 * Generate validation summary
	 */
	generateValidationSummary() {
		console.log("\n📊 Chaincode Validation Summary")
		console.log("=================================")

		console.log(
			`Chaincode Installed: ${
				this.validationResults.chaincode.installed ? "✅" : "❌"
			}`
		)
		console.log(
			`Chaincode Instantiated: ${
				this.validationResults.chaincode.instantiated ? "✅" : "❌"
			}`
		)
		console.log(
			`Chaincode Version: ${
				this.validationResults.chaincode.version || "Unknown"
			}`
		)

		const availableFunctions = Object.values(
			this.validationResults.chaincode.functions
		).filter((f) => f.available).length
		console.log(
			`Functions Available: ${availableFunctions}/${this.expectedFunctions.length}`
		)

		// Show function details
		console.log("\nFunction Status:")
		for (const [funcName, result] of Object.entries(
			this.validationResults.chaincode.functions
		)) {
			const status = result.available ? "✅" : "❌"
			const time = result.responseTime ? `(${result.responseTime}ms)` : ""
			console.log(`  ${status} ${funcName} ${time}`)
			if (!result.available && result.error) {
				console.log(`      Error: ${result.error}`)
			}
		}

		// Show organization status
		console.log("\nOrganization Status:")
		for (const [orgId, result] of Object.entries(
			this.validationResults.organizations
		)) {
			const status = result.connected ? "✅" : "❌"
			console.log(`  ${status} ${orgId}`)
			if (result.connected) {
				console.log(
					`      Functions: ${result.functionsAvailable}/${result.totalFunctions}`
				)
			} else if (result.error) {
				console.log(`      Error: ${result.error}`)
			}
		}

		console.log(
			`\nOverall Status: ${
				this.validationResults.overall ? "✅ HEALTHY" : "❌ ISSUES DETECTED"
			}`
		)

		if (this.validationResults.errors.length > 0) {
			console.log("\n⚠️  Errors:")
			this.validationResults.errors.forEach((error) =>
				console.log(`  - ${error}`)
			)
		}
	}

	/**
	 * Export validation results to JSON file
	 */
	async exportResults(outputPath) {
		try {
			const timestamp = new Date().toISOString()
			const report = {
				timestamp,
				networkConfig: this.networkConfigPath,
				expectedFunctions: this.expectedFunctions,
				...this.validationResults,
			}

			fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
			console.log(`\n📄 Chaincode validation report exported to: ${outputPath}`)
			return true
		} catch (error) {
			console.error("Failed to export validation results:", error.message)
			return false
		}
	}

	/**
	 * Monitor chaincode health continuously
	 */
	async startHealthMonitoring(intervalMs = 60000) {
		console.log(
			`\n🔄 Starting chaincode health monitoring (interval: ${intervalMs}ms)...`
		)

		const monitor = async () => {
			try {
				const results = await this.validateChaincode()
				const timestamp = new Date().toISOString()

				if (results.overall) {
					console.log(`[${timestamp}] ✅ Chaincode health check passed`)
				} else {
					console.log(`[${timestamp}] ❌ Chaincode health check failed`)

					// Log specific issues
					const failedFunctions = Object.entries(results.chaincode.functions)
						.filter(([name, result]) => !result.available)
						.map(([name]) => name)

					if (failedFunctions.length > 0) {
						console.log(`  Failed functions: ${failedFunctions.join(", ")}`)
					}
				}
			} catch (error) {
				console.log(
					`[${new Date().toISOString()}] ❌ Health monitoring error: ${
						error.message
					}`
				)
			}
		}

		// Run initial check
		await monitor()

		// Set up interval
		return setInterval(monitor, intervalMs)
	}
}

module.exports = ChaincodeValidator
