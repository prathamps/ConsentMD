"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

// Array to store identity information for analysis
if (typeof global.identityInfo === "undefined") {
	global.identityInfo = []
}

class GetMyIdWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.organizationSwitchCount = 0
	}

	async initializeWorkloadModule(
		workerIndex,
		totalWorkers,
		roundIndex,
		roundArguments,
		sutAdapter,
		sutContext
	) {
		await super.initializeWorkloadModule(
			workerIndex,
			totalWorkers,
			roundIndex,
			roundArguments,
			sutAdapter,
			sutContext
		)

		console.log(
			`Worker ${workerIndex}: Initializing getMyId workload for identity verification testing`
		)

		// Store initial context information for performance measurement
		this.startTime = Date.now()
	}

	async submitTransaction() {
		this.txIndex++

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "getMyId",
			contractArguments: [],
			readOnly: true, // This is a read-only operation for identity verification
		}

		try {
			const transactionStart = Date.now()
			const results = await this.sutAdapter.sendRequests(myArgs)
			const transactionEnd = Date.now()

			// Process results and collect identity information
			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					const identityId = result.GetResult().toString()

					// Store identity information for analysis
					const identityData = {
						workerId: this.workerIndex,
						transactionIndex: this.txIndex,
						identityId: identityId,
						timestamp: new Date().toISOString(),
						responseTime: transactionEnd - transactionStart,
						organization: this._extractOrganization(identityId),
					}

					global.identityInfo.push(identityData)

					// Log for debugging and verification
					console.log(
						`Worker ${this.workerIndex} - Transaction ${this.txIndex}: Identity verified - ${identityId}`
					)
				} else {
					console.error(
						`getMyId transaction failed: ${result.GetStatus()} - ${result
							.GetResult()
							.toString()}`
					)
				}
			}
		} catch (error) {
			console.error(`Error in getMyId transaction:`, error.message)
			throw error
		}
	}

	/**
	 * Helper method to extract organization information from identity ID
	 * This helps with identity context switching analysis
	 */
	_extractOrganization(identityId) {
		try {
			// Identity IDs typically contain organization information
			// Format is usually like: x509::/C=US/ST=California/L=San Francisco/O=org1.example.com/CN=User1@org1.example.com
			if (identityId.includes("org1.example.com")) {
				return "Org1MSP"
			} else if (identityId.includes("org2.example.com")) {
				return "Org2MSP"
			} else {
				return "Unknown"
			}
		} catch (error) {
			console.warn(
				`Could not extract organization from identity: ${identityId}`
			)
			return "Unknown"
		}
	}

	/**
	 * Simulate identity context switching for performance measurement
	 * This method can be used to test performance across different organizational contexts
	 */
	async _simulateIdentityContextSwitch() {
		// This is a placeholder for identity context switching logic
		// In a real scenario, this would involve switching between different organizational identities
		this.organizationSwitchCount++

		// Add a small delay to simulate context switching overhead
		await new Promise((resolve) => setTimeout(resolve, 1))
	}

	async cleanupWorkloadModule() {
		const endTime = Date.now()
		const totalDuration = endTime - this.startTime

		// Calculate performance statistics
		const identityOperations = global.identityInfo.filter(
			(info) => info.workerId === this.workerIndex
		)
		const avgResponseTime =
			identityOperations.length > 0
				? identityOperations.reduce((sum, info) => sum + info.responseTime, 0) /
				  identityOperations.length
				: 0

		console.log(`GetMyId workload completed for worker ${this.workerIndex}:`)
		console.log(`  - Total transactions: ${this.txIndex}`)
		console.log(`  - Total duration: ${totalDuration}ms`)
		console.log(`  - Average response time: ${avgResponseTime.toFixed(2)}ms`)
		console.log(`  - Organization switches: ${this.organizationSwitchCount}`)

		// Log organization distribution for analysis
		const orgDistribution = {}
		identityOperations.forEach((info) => {
			orgDistribution[info.organization] =
				(orgDistribution[info.organization] || 0) + 1
		})
		console.log(`  - Organization distribution:`, orgDistribution)
	}
}

function createWorkloadModule() {
	return new GetMyIdWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
