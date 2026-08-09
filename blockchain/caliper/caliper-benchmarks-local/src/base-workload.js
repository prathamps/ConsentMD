"use strict"

const { WorkloadModuleBase } = require("@hyperledger/caliper-core")
const ErrorHandler = require("./error-handler")
const { ChaincodeGateway, isAuthorizationDenial } = require("./gateway")
const { LatencyRecorder } = require("./latency-recorder")
const { seedDataset, writeDatasetManifest } = require("./fixtures")

/**
 * Base class for every ConsentMD workload.
 *
 * Owns the whole benchmark lifecycle — dataset seeding, per-transaction
 * latency recording, retries, and expected-denial classification — so a
 * concrete workload only has to answer one question: "what is the next
 * operation?" (see `nextOperation`).
 */
class ConsentBenchWorkload extends WorkloadModuleBase {
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

		this.settings = resolveSettings(roundArguments)
		this.gateway = new ChaincodeGateway(sutAdapter)
		this.recorder = LatencyRecorder.fromEnvironment(workerIndex, roundIndex)

		console.log(
			`Worker ${workerIndex}: seeding ${this.settings.patientCount} patients, ` +
				`${this.settings.doctorCount} doctors, ${this.settings.recordsPerPatient} records/patient ` +
				`(consent ratio ${this.settings.seedConsentRatio})`
		)
		this.dataset = await seedDataset(
			this.gateway,
			this.settings,
			workerIndex,
			totalWorkers
		)
		writeDatasetManifest(this.dataset, this.settings, { workerIndex, roundIndex })
		console.log(
			`Worker ${workerIndex}: dataset ready ${JSON.stringify(this.dataset.counts())}`
		)
	}

	/**
	 * @returns {?object} descriptor of the next operation:
	 *   name          recorder label, e.g. "grantConsent"
	 *   run           () => Promise<payload> — the gateway call
	 *   expectDenial  true when an authorization rejection is the CORRECT outcome
	 *   onCommitted   (payload) => void — commit settlement (state + release)
	 *   onFailed      (error) => void — non-commit settlement (release only)
	 * Exactly one settlement hook fires per operation; expected denials settle
	 * through onFailed. Returning null skips the slot (never a failure).
	 */
	nextOperation() {
		throw new Error(`${this.constructor.name} must implement nextOperation()`)
	}

	async submitTransaction() {
		const op = this.nextOperation()
		if (!op) {
			return { status: "skipped", worker: this.workerIndex }
		}
		return this._perform(op)
	}

	async _perform(op) {
		const started = Date.now()
		try {
			const payload = await ErrorHandler.executeWithRetry(
				op.run,
				{ maxRetries: 2, retryDelay: 500, retryableCategories: ["NETWORK", "TIMEOUT"] },
				op.name,
				this.workerIndex
			)
			this.recorder.record({
				op: op.name,
				ms: Date.now() - started,
				outcome: "committed",
			})
			if (op.onCommitted) op.onCommitted(payload)
			return { status: "success", operation: op.name }
		} catch (error) {
			const ms = Date.now() - started
			if (op.expectDenial && this._isExpectedDenial(error)) {
				// The chaincode refused an unauthorized request: that is the
				// system behaving correctly, not a benchmark failure.
				this.recorder.record({ op: op.name, ms, outcome: "denied" })
				if (op.onFailed) op.onFailed(error)
				return { status: "success", operation: op.name, deniedAsExpected: true }
			}
			this.recorder.record({
				op: op.name,
				ms,
				outcome: "failed",
				error: truncate(error.message, 200),
			})
			if (op.onFailed) op.onFailed(error)
			return ErrorHandler.handleTransactionError(error, op.name, this.workerIndex)
		}
	}

	/**
	 * Decide whether a failed operation the workload EXPECTED to be denied is
	 * in fact an authorization denial.
	 *
	 * Write rejections carry the chaincode's `ACCESS_DENIED …` text, so the
	 * message match is authoritative. Read (query) rejections are the problem:
	 * this Caliper version's TxStatus.GetErrMsg() comes back EMPTY for a
	 * rejected query, so there is no message to match. For those we fall back
	 * to: "a non-transient failure on an operation we expected to be denied is
	 * a denial." Transient NETWORK/TIMEOUT failures still count as failures —
	 * they carry gRPC messages and are categorized accordingly — so a real
	 * infrastructure fault can never be laundered into an expected denial.
	 */
	_isExpectedDenial(error) {
		if (isAuthorizationDenial(error)) return true
		const { category } = ErrorHandler.categorizeError(error)
		return category !== "NETWORK" && category !== "TIMEOUT"
	}

	async cleanupWorkloadModule() {
		this.recorder.flush()
		// Ledger state is append-only by design: benchmark assets stay on the
		// chain, and every run uses fresh transaction-derived record ids so
		// runs never collide. See docs/methodology.md ("Data lifecycle").
		await super.cleanupWorkloadModule()
	}
}

/** Round arguments with defaults; legacy key spellings are honoured. */
function resolveSettings(roundArguments = {}) {
	const a = roundArguments
	return {
		patientCount: a.patientCount || a.patientsPerWorker || 10,
		doctorCount: a.doctorCount || a.doctorsPerWorker || 5,
		recordsPerPatient: a.recordsPerPatient || a.recordsPerWorker || 3,
		seedConsentRatio: numberOr(a.seedConsentRatio, numberOr(a.consentRatio, 0.6)),
		unauthorizedReadRatio: numberOr(a.unauthorizedReadRatio, numberOr(a.unauthorizedAccessRatio, 0.2)),
		operationWeights: {
			grantConsent: 0.4,
			recordAccess: 0.4,
			revokeConsent: 0.2,
			...(a.operationWeights || {}),
		},
	}
}

function numberOr(value, fallback) {
	return typeof value === "number" && !Number.isNaN(value) ? value : fallback
}

function truncate(text, max) {
	if (!text) return text
	return text.length > max ? `${text.slice(0, max)}…` : text
}

module.exports = { ConsentBenchWorkload }
