"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

// A simple array to store created record IDs. This will be shared between rounds
// because we are using a single local worker.
if (typeof global.recordIds === "undefined") {
	global.recordIds = []
}

class CreatePatientRecordWorkload extends WorkloadModuleBase {
	constructor() {
		super()
		this.txIndex = 0
	}

	async submitTransaction() {
		this.txIndex++
		const patientId = "patient_" + this.workerIndex + "_" + this.txIndex
		const fileName = "report-for-" + patientId + ".pdf"
		const s3Key = "uploads/" + patientId + "-" + Date.now() + ".pdf"
		const details = "Initial consultation for " + patientId

		const myArgs = {
			contractId: "medicalconsent",
			contractFunction: "createPatientRecord",
			contractArguments: [fileName, s3Key, "", details],
			readOnly: false,
		}

		const results = await this.sutAdapter.sendRequests(myArgs)

		for (const result of results) {
			if (result.GetStatus() === "SUCCESS") {
				try {
					const record = JSON.parse(result.GetResult().toString())
					if (record && record.recordId) {
						global.recordIds.push(record.recordId)
					}
				} catch (err) {
					// This might happen if the transaction was successful but the payload was not valid JSON
					console.error(
						`Could not parse response for successful transaction: ${result
							.GetResult()
							.toString()}`
					)
				}
			}
		}
	}
}

function createWorkloadModule() {
	return new CreatePatientRecordWorkload()
}

module.exports.createWorkloadModule = createWorkloadModule
