"use strict"

const { ConsentBenchWorkload } = require("../src/base-workload")
const {
	grantOperation,
	revokeOperation,
	readOperation,
} = require("../src/operations")

/**
 * Mixed workload: weighted blend of grant / read / revoke, mimicking steady
 * clinic traffic. Weights come from `operationWeights` in the round arguments
 * (default 40% grant, 40% read, 20% revoke). When the weighted choice cannot
 * proceed (e.g. no active consent to revoke yet), it falls back to any
 * available operation rather than skipping the slot.
 */
class MixedWorkload extends ConsentBenchWorkload {
	nextOperation() {
		const preferred = this._weightedChoice()
		return (
			preferred ||
			readOperation(this.gateway, this.dataset, this.settings.unauthorizedReadRatio) ||
			grantOperation(this.gateway, this.dataset) ||
			revokeOperation(this.gateway, this.dataset)
		)
	}

	_weightedChoice() {
		const w = this.settings.operationWeights
		const total = w.grantConsent + w.recordAccess + w.revokeConsent
		const roll = Math.random() * total
		if (roll < w.grantConsent) {
			return grantOperation(this.gateway, this.dataset)
		}
		if (roll < w.grantConsent + w.recordAccess) {
			return readOperation(this.gateway, this.dataset, this.settings.unauthorizedReadRatio)
		}
		return revokeOperation(this.gateway, this.dataset)
	}
}

module.exports.createWorkloadModule = () => new MixedWorkload()
