"use strict"

const { ConsentBenchWorkload } = require("../src/base-workload")
const { createRecordOperation } = require("../src/operations")

/**
 * Write-saturation benchmark (paper Table 2, write rows).
 *
 * Issues a stream of record-creation transactions — each an independent,
 * always-valid single ledger write — so throughput is bounded by the ledger
 * and endorsement path, not by a finite pool of consent pairs. This is what
 * lets the write sweep hold target rates up to 250 TPS.
 */
class WriteSaturationWorkload extends ConsentBenchWorkload {
	nextOperation() {
		return createRecordOperation(this.gateway, this.dataset, this.workerIndex)
	}
}

module.exports.createWorkloadModule = () => new WriteSaturationWorkload()
