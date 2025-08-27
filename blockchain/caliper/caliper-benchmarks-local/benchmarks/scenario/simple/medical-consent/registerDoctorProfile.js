"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

// Array to store created doctor profile IDs for cross-workload reference
if (typeof global.doctorProfileIds === "undefined") {
	global.doctorProfileIds = []
}

class RegisterDoctorProfileWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
		this.specializations = [
			"Cardiology",
			"Neurology",
			"Oncology",
			"Pediatrics",
			"Orthopedics",
			"Dermatology",
			"Psychiatry",
			"Radiology",
			"Emergency Medicine",
			"Internal Medicine",
			"Surgery",
			"Anesthesiology",
		]
		this.firstNames = [
			"John",
			"Jane",
			"Michael",
			"Sarah",
			"David",
			"Emily",
			"Robert",
			"Lisa",
			"James",
			"Maria",
			"William",
			"Jennifer",
			"Richard",
			"Patricia",
			"Charles",
			"Linda",
			"Thomas",
			"Barbara",
		]
		this.lastNames = [
			"Smith",
			"Johnson",
			"Williams",
			"Brown",
			"Jones",
			"Garcia",
			"Miller",
			"Davis",
			"Rodriguez",
			"Martinez",
			"Hernandez",
			"Lopez",
			"Gonzalez",
			"Wilson",
			"Anderson",
			"Thomas",
			"Taylor",
			"Moore",
		]
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

		// Validate that we're using a doctor identity
		try {
			// This will help ensure we're testing with proper role-based identity
			console.log(
				`Worker ${workerIndex}: Initializing registerDoctorProfile workload`
			)
		} catch (error) {
			console.error(
				`Worker ${workerIndex}: Failed to initialize registerDoctorProfile workload:`,
				error.message
			)
			throw error
		}
	}

	async submitTransaction() {
		this.txIndex++

		// Generate realistic doctor profile data
		const firstName =
			this.firstNames[Math.floor(Math.random() * this.firstNames.length)]
		const lastName =
			this.lastNames[Math.floor(Math.random() * this.lastNames.length)]
		const name = `Dr. ${firstName} ${lastName}`
		const specialization =
			this.specializations[
				Math.floor(Math.random() * this.specializations.length)
			]

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "registerDoctorProfile",
			contractArguments: [name, specialization],
			readOnly: false,
		}

		try {
			const results = await this.sutAdapter.sendRequests(myArgs)

			// Process results and store successful profile IDs
			for (const result of results) {
				if (result.GetStatus() === "SUCCESS") {
					try {
						const profile = JSON.parse(result.GetResult().toString())
						if (profile && profile.profileId) {
							global.doctorProfileIds.push({
								profileId: profile.profileId,
								doctorId: profile.doctorId,
								name: profile.name,
								specialization: profile.specialization,
							})
							console.log(
								`Successfully registered doctor profile: ${profile.profileId}`
							)
						}
					} catch (parseError) {
						console.error(
							`Could not parse response for successful registerDoctorProfile transaction: ${result
								.GetResult()
								.toString()}`
						)
					}
				} else {
					// Log transaction failures for analysis
					console.error(
						`registerDoctorProfile transaction failed: ${result.GetStatus()} - ${result
							.GetResult()
							.toString()}`
					)
				}
			}
		} catch (error) {
			console.error(
				`Error in registerDoctorProfile transaction:`,
				error.message
			)
			throw error
		}
	}

	async cleanupWorkloadModule() {
		console.log(
			`RegisterDoctorProfile workload completed. Total profiles created: ${global.doctorProfileIds.length}`
		)
	}
}

function createWorkloadModule() {
	return new RegisterDoctorProfileWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
