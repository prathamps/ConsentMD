"use strict"

const { ConsentBenchWorkload } = require("../src/base-workload")
const { grantOperation, revokeOperation } = require("../src/operations")

/**
 * Consent-granting benchmark.
 *
 * Grants consent on (record, doctor) pairs that do not currently hold one.
 * When every pair is active the round would starve, so it revokes a random
 * pair instead — the aggregator reports grant and revoke latencies separately,
 * so replenishment never contaminates the grant numbers.
 */
class ConsentGrantingWorkload extends ConsentBenchWorkload {
	nextOperation() {
		return (
			grantOperation(this.gateway, this.dataset) ||
			revokeOperation(this.gateway, this.dataset)
		)
	}
}

module.exports.createWorkloadModule = () => new ConsentGrantingWorkload()
