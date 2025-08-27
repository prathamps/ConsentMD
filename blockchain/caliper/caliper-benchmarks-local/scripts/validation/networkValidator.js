/**
 * Network Connectivity Validation Module
 *
 * This module provides comprehensive network health checks for all blockchain components
 * including peers, orderers, certificate authorities, and TLS certificate validation.
 */

const fs = require("fs")
const path = require("path")
const https = require("https")
const tls = require("tls")
const { promisify } = require("util")
const yaml = require("js-yaml")

class NetworkValidator {
	constructor(networkConfigPath, connectionProfilesPath) {
		this.networkConfigPath = networkConfigPath
		this.connectionProfilesPath = connectionProfilesPath
		this.networkConfig = null
		this.connectionProfiles = {}
		this.validationResults = {
			overall: false,
			peers: {},
			orderers: {},
			certificateAuthorities: {},
			tlsCertificates: {},
			errors: [],
		}
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

			console.log("✓ Network configurations loaded successfully")
			return true
		} catch (error) {
			this.validationResults.errors.push(
				`Configuration loading failed: ${error.message}`
			)
			console.error("✗ Failed to load network configurations:", error.message)
			return false
		}
	}

	/**
	 * Validate TLS certificate for a given path
	 */
	async validateTLSCertificate(certPath, componentName) {
		return new Promise((resolve) => {
			try {
				if (!fs.existsSync(certPath)) {
					this.validationResults.tlsCertificates[componentName] = {
						valid: false,
						error: "Certificate file not found",
					}
					resolve(false)
					return
				}

				const certContent = fs.readFileSync(certPath, "utf8")

				// Parse certificate to check validity
				const cert = new tls.TLSSocket()
				const certInfo = cert.getCertificate ? cert.getCertificate() : null

				// Basic validation - check if file is readable and contains certificate data
				if (
					certContent.includes("-----BEGIN CERTIFICATE-----") &&
					certContent.includes("-----END CERTIFICATE-----")
				) {
					this.validationResults.tlsCertificates[componentName] = {
						valid: true,
						path: certPath,
						size: certContent.length,
					}
					resolve(true)
				} else {
					this.validationResults.tlsCertificates[componentName] = {
						valid: false,
						error: "Invalid certificate format",
					}
					resolve(false)
				}
			} catch (error) {
				this.validationResults.tlsCertificates[componentName] = {
					valid: false,
					error: error.message,
				}
				resolve(false)
			}
		})
	}

	/**
	 * Test connection to a peer endpoint
	 */
	async testPeerConnection(peerName, peerConfig) {
		return new Promise((resolve) => {
			const url = new URL(peerConfig.url)
			const options = {
				hostname: url.hostname,
				port: url.port,
				timeout: 5000,
				rejectUnauthorized: false, // For testing purposes
			}

			const socket = tls.connect(options, () => {
				this.validationResults.peers[peerName] = {
					available: true,
					url: peerConfig.url,
					tlsEnabled: url.protocol === "grpcs:",
					responseTime: Date.now() - startTime,
				}
				socket.end()
				resolve(true)
			})

			const startTime = Date.now()

			socket.on("error", (error) => {
				this.validationResults.peers[peerName] = {
					available: false,
					url: peerConfig.url,
					error: error.message,
				}
				resolve(false)
			})

			socket.on("timeout", () => {
				this.validationResults.peers[peerName] = {
					available: false,
					url: peerConfig.url,
					error: "Connection timeout",
				}
				socket.destroy()
				resolve(false)
			})
		})
	}

	/**
	 * Test connection to an orderer endpoint
	 */
	async testOrdererConnection(ordererName, ordererConfig) {
		return new Promise((resolve) => {
			const url = new URL(ordererConfig.url)
			const options = {
				hostname: url.hostname,
				port: url.port,
				timeout: 5000,
				rejectUnauthorized: false,
			}

			const socket = tls.connect(options, () => {
				this.validationResults.orderers[ordererName] = {
					available: true,
					url: ordererConfig.url,
					tlsEnabled: url.protocol === "grpcs:",
					responseTime: Date.now() - startTime,
				}
				socket.end()
				resolve(true)
			})

			const startTime = Date.now()

			socket.on("error", (error) => {
				this.validationResults.orderers[ordererName] = {
					available: false,
					url: ordererConfig.url,
					error: error.message,
				}
				resolve(false)
			})

			socket.on("timeout", () => {
				this.validationResults.orderers[ordererName] = {
					available: false,
					url: ordererConfig.url,
					error: "Connection timeout",
				}
				socket.destroy()
				resolve(false)
			})
		})
	}

	/**
	 * Test connection to a Certificate Authority
	 */
	async testCAConnection(caName, caConfig) {
		return new Promise((resolve) => {
			const url = new URL(caConfig.url)
			const options = {
				hostname: url.hostname,
				port: url.port,
				path: "/cainfo",
				method: "GET",
				timeout: 5000,
				rejectUnauthorized: false,
			}

			const startTime = Date.now()
			const req = https.request(options, (res) => {
				this.validationResults.certificateAuthorities[caName] = {
					available: true,
					url: caConfig.url,
					statusCode: res.statusCode,
					responseTime: Date.now() - startTime,
				}
				resolve(true)
			})

			req.on("error", (error) => {
				this.validationResults.certificateAuthorities[caName] = {
					available: false,
					url: caConfig.url,
					error: error.message,
				}
				resolve(false)
			})

			req.on("timeout", () => {
				this.validationResults.certificateAuthorities[caName] = {
					available: false,
					url: caConfig.url,
					error: "Connection timeout",
				}
				req.destroy()
				resolve(false)
			})

			req.end()
		})
	}

	/**
	 * Validate all peers across organizations
	 */
	async validatePeers() {
		console.log("\n🔍 Validating peer connections...")
		const peerPromises = []

		for (const [orgId, profile] of Object.entries(this.connectionProfiles)) {
			for (const [peerName, peerConfig] of Object.entries(
				profile.peers || {}
			)) {
				console.log(`  Testing peer: ${peerName}`)
				peerPromises.push(this.testPeerConnection(peerName, peerConfig))

				// Validate peer TLS certificate
				if (peerConfig.tlsCACerts && peerConfig.tlsCACerts.path) {
					await this.validateTLSCertificate(
						peerConfig.tlsCACerts.path,
						`peer-${peerName}`
					)
				}
			}
		}

		const results = await Promise.all(peerPromises)
		const successCount = results.filter((r) => r).length
		console.log(
			`✓ Peer validation complete: ${successCount}/${results.length} peers available`
		)

		return successCount === results.length
	}

	/**
	 * Validate all orderers
	 */
	async validateOrderers() {
		console.log("\n🔍 Validating orderer connections...")
		const ordererPromises = []

		if (this.networkConfig.orderers) {
			for (const [ordererName, ordererConfig] of Object.entries(
				this.networkConfig.orderers
			)) {
				console.log(`  Testing orderer: ${ordererName}`)
				ordererPromises.push(
					this.testOrdererConnection(ordererName, ordererConfig)
				)

				// Validate orderer TLS certificate
				if (ordererConfig.tlsCACerts && ordererConfig.tlsCACerts.path) {
					const certPath = path.resolve(
						path.dirname(this.networkConfigPath),
						ordererConfig.tlsCACerts.path
					)
					await this.validateTLSCertificate(certPath, `orderer-${ordererName}`)
				}
			}
		}

		const results = await Promise.all(ordererPromises)
		const successCount = results.filter((r) => r).length
		console.log(
			`✓ Orderer validation complete: ${successCount}/${results.length} orderers available`
		)

		return successCount === results.length
	}

	/**
	 * Validate all Certificate Authorities
	 */
	async validateCertificateAuthorities() {
		console.log("\n🔍 Validating Certificate Authority connections...")
		const caPromises = []

		for (const [orgId, profile] of Object.entries(this.connectionProfiles)) {
			for (const [caName, caConfig] of Object.entries(
				profile.certificateAuthorities || {}
			)) {
				console.log(`  Testing CA: ${caName}`)
				caPromises.push(this.testCAConnection(caName, caConfig))

				// Validate CA TLS certificate
				if (caConfig.tlsCACerts && caConfig.tlsCACerts.path) {
					await this.validateTLSCertificate(
						caConfig.tlsCACerts.path,
						`ca-${caName}`
					)
				}
			}
		}

		const results = await Promise.all(caPromises)
		const successCount = results.filter((r) => r).length
		console.log(
			`✓ CA validation complete: ${successCount}/${results.length} CAs available`
		)

		return successCount === results.length
	}

	/**
	 * Run comprehensive network validation
	 */
	async validateNetwork() {
		console.log("🚀 Starting comprehensive network validation...\n")

		// Load configurations
		const configLoaded = await this.loadConfigurations()
		if (!configLoaded) {
			this.validationResults.overall = false
			return this.validationResults
		}

		// Run all validations
		const [peersValid, orderersValid, casValid] = await Promise.all([
			this.validatePeers(),
			this.validateOrderers(),
			this.validateCertificateAuthorities(),
		])

		// Calculate overall result
		this.validationResults.overall = peersValid && orderersValid && casValid

		// Generate summary
		this.generateValidationSummary()

		return this.validationResults
	}

	/**
	 * Generate validation summary
	 */
	generateValidationSummary() {
		console.log("\n📊 Network Validation Summary")
		console.log("================================")

		const peerCount = Object.keys(this.validationResults.peers).length
		const availablePeers = Object.values(this.validationResults.peers).filter(
			(p) => p.available
		).length
		console.log(`Peers: ${availablePeers}/${peerCount} available`)

		const ordererCount = Object.keys(this.validationResults.orderers).length
		const availableOrderers = Object.values(
			this.validationResults.orderers
		).filter((o) => o.available).length
		console.log(`Orderers: ${availableOrderers}/${ordererCount} available`)

		const caCount = Object.keys(
			this.validationResults.certificateAuthorities
		).length
		const availableCAs = Object.values(
			this.validationResults.certificateAuthorities
		).filter((ca) => ca.available).length
		console.log(`Certificate Authorities: ${availableCAs}/${caCount} available`)

		const certCount = Object.keys(this.validationResults.tlsCertificates).length
		const validCerts = Object.values(
			this.validationResults.tlsCertificates
		).filter((cert) => cert.valid).length
		console.log(`TLS Certificates: ${validCerts}/${certCount} valid`)

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
				...this.validationResults,
			}

			fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
			console.log(`\n📄 Validation report exported to: ${outputPath}`)
			return true
		} catch (error) {
			console.error("Failed to export validation results:", error.message)
			return false
		}
	}
}

module.exports = NetworkValidator
