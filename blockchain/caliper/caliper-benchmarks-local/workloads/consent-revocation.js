"use strict"

const { ConsentBenchWorkload } = require("../src/base-workload")
const { grantOperation, revokeOperation } = require("../src/operations")

/**
 * Consent-revocation benchmark.
 *
 * Revokes currently-active consents. When the active pool is exhausted the
 * round replenishes it with a grant — reported separately by the aggregator,
 * so revocation latency stays uncontaminated. Seed enough initial consents
 * (`seedConsentRatio`) to keep replenishment rare.
 */
class ConsentRevocationWorkload extends ConsentBenchWorkload {
	nextOperation() {
		return (
			revokeOperation(this.gateway, this.dataset) ||
			grantOperation(this.gateway, this.dataset)
		)
	}
}

module.exports.createWorkloadModule = () => new ConsentRevocationWorkload()
