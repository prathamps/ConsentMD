"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

class GetRecordByIdWorkload extends WorkloadModuleBase {
	constructor() {
		super()
	}

	async submitTransaction() {
		if (!global.recordIds || global.recordIds.length === 0) {
			console.log(
				'No record IDs available to query, skipping transaction. The "createPatientRecord" round must run first.'
			)
			return
		}

		// Pick a random record ID from the created ones
		const randomIndex = Math.floor(Math.random() * global.recordIds.length)
		const recordId = global.recordIds[randomIndex]

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "getRecordById",
			contractArguments: [recordId],
			readOnly: true,
		}

		await this.sutAdapter.sendRequests(myArgs)
	}
}

function createWorkloadModule() {
	return new GetRecordByIdWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
