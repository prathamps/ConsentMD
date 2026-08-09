"use strict"

const { ConsentBenchWorkload } = require("../src/base-workload")
const { readOperation } = require("../src/operations")

/**
 * Record-access benchmark.
 *
 * Doctors read records through the chaincode's consent check. A configurable
 * share of reads (`unauthorizedReadRatio`, default 0.2) is issued by doctors
 * WITHOUT consent, verifying the deny path under load; those denials are
 * expected outcomes, recorded separately from failures.
 */
class RecordAccessWorkload extends ConsentBenchWorkload {
	nextOperation() {
		return readOperation(
			this.gateway,
			this.dataset,
			this.settings.unauthorizedReadRatio
		)
	}
}

module.exports.createWorkloadModule = () => new RecordAccessWorkload()
