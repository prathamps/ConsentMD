"use strict"

/**
 * Offline test of the full workload stack against a stubbed SUT adapter that
 * emulates the chaincode's semantics (identity-derived ids, consent keyed by
 * (record, doctor), duplicate-grant Conflict, fail-closed reads).
 *
 * Run: node test/workload.test.js
 */

const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")

const { RESULTS_DIR_ENV, RUN_LABEL_ENV } = require("../src/config")
const { summarize, percentileOfSorted } = require("../src/stats")

// --- fake Fabric ------------------------------------------------------------

/** TxStatus double matching the caliper-core surface the gateway touches. */
class FakeTxStatus {
	constructor(payload) {
		this.payload = payload
	}
	IsCommitted() {
		return true
	}
	GetResult() {
		return Buffer.from(JSON.stringify(this.payload))
	}
}

/**
 * A REJECTED query TxStatus, faithful to the live pathology this exercises:
 * this Caliper version reports a rejected read as not-committed with an EMPTY
 * error message, so the denial reason never reaches the client. The workload
 * must still classify it as an expected denial, not a failure.
 */
class FakeRejectedQueryStatus {
	IsCommitted() {
		return false
	}
	GetErrMsg() {
		return [] // deliberately empty — matches observed live behaviour
	}
	GetResult() {
		return null
	}
}

/** In-memory chaincode with the same policy semantics as MedicalConsentContract. */
class FakeSutAdapter {
	/** @param {number} commitDelayMs emulates endorsement→commit latency. */
	constructor(commitDelayMs = 0) {
		this.commitDelayMs = commitDelayMs
		this.txCounter = 0
		this.profiles = new Map()
		this.records = new Map()
		this.consents = new Map()
	}

	async sendRequests(request) {
		if (this.commitDelayMs > 0) {
			// State is read AND written after the delay, like a real commit:
			// a second transaction touching the same key mid-flight sees (and
			// races against) the pre-commit state, exactly as on the network.
			await new Promise((r) => setTimeout(r, this.commitDelayMs))
		}
		return this._invoke(request)
	}

	_invoke(request) {
		const { contractFunction: fn, contractArguments: args, invokerIdentity } = request
		const who = `x509::${invokerIdentity}`
		this.txCounter++

		switch (fn) {
			case "registerDoctorProfile": {
				const profile = { doctorId: who, name: args[0], specialization: args[1] }
				this.profiles.set(who, profile)
				return new FakeTxStatus(profile)
			}
			case "createPatientRecord": {
				const record = {
					recordId: `record_tx${this.txCounter}`,
					patientId: who,
					fileName: args[0],
				}
				this.records.set(record.recordId, record)
				return new FakeTxStatus(record)
			}
			case "grantConsent": {
				const [recordId, doctorId] = args
				const key = `${recordId}|${doctorId}`
				const existing = this.consents.get(key)
				if (existing && existing.status === "granted") {
					throw new Error(`Conflict: consent already granted for record ${recordId}`)
				}
				if (!this.profiles.has(doctorId)) {
					throw new Error(`NotFound: DoctorProfile ${doctorId}`)
				}
				const consent = { recordId, doctorId, status: "granted" }
				this.consents.set(key, consent)
				return new FakeTxStatus(consent)
			}
			case "revokeConsent": {
				const [recordId, doctorId] = args
				const key = `${recordId}|${doctorId}`
				const consent = this.consents.get(key)
				if (!consent || consent.status !== "granted") {
					throw new Error(`Conflict: consent for record ${recordId} is already revoked`)
				}
				consent.status = "revoked"
				return new FakeTxStatus(consent)
			}
			case "getRecordById": {
				const record = this.records.get(args[0])
				if (!record) throw new Error(`NotFound: Record ${args[0]}`)
				const consent = this.consents.get(`${args[0]}|${who}`)
				if (record.patientId !== who && (!consent || consent.status !== "granted")) {
					// Faithful to live Caliper: a rejected READ returns a
					// not-committed status with NO message, not a thrown error.
					return new FakeRejectedQueryStatus()
				}
				return new FakeTxStatus(record)
			}
			default:
				throw new Error(`Unexpected chaincode call: ${fn}`)
		}
	}
}

// --- harness -----------------------------------------------------------------

async function runWorkload(modulePath, roundArguments, transactions) {
	// Distinct label per workload, as run-benchmarks.sh sets per Caliper launch.
	process.env[RUN_LABEL_ENV] = `${path.basename(modulePath, ".js")}.run1`
	const { createWorkloadModule } = require(modulePath)
	const workload = createWorkloadModule()
	const adapter = new FakeSutAdapter()
	await workload.initializeWorkloadModule(0, 1, 0, roundArguments, adapter, {})
	const results = []
	for (let i = 0; i < transactions; i++) {
		results.push(await workload.submitTransaction())
	}
	await workload.cleanupWorkloadModule()
	return { workload, adapter, results }
}

const DATASET = { patientCount: 2, doctorCount: 2, recordsPerPatient: 2, seedConsentRatio: 0.5 }

async function main() {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "consentmd-bench-test-"))
	process.env[RESULTS_DIR_ENV] = tmp

	// stats: percentile interpolation sanity
	assert.strictEqual(percentileOfSorted([1, 2, 3, 4, 5], 50), 3)
	assert.strictEqual(percentileOfSorted([10], 99), 10)
	const s = summarize([1, 2, 3, 4, 100])
	assert.ok(s.p99 > s.p50, "p99 must exceed p50 on skewed data")

	// consent-granting: all transactions succeed, consents appear on the ledger
	{
		const { adapter, results } = await runWorkload(
			"../workloads/consent-granting.js",
			DATASET,
			10
		)
		assert.ok(
			results.every((r) => r.status === "success"),
			`granting produced failures: ${JSON.stringify(results.filter((r) => r.status !== "success"))}`
		)
		const granted = [...adapter.consents.values()].filter((c) => c.status === "granted")
		assert.ok(granted.length > 0, "no consents were granted")
	}

	// record-access: authorized reads commit, unauthorized reads are denials,
	// never failures — EVEN THOUGH the rejected-query status carries no error
	// message (the live Caliper pathology this regression-guards).
	{
		const { results } = await runWorkload(
			"../workloads/record-access.js",
			{ ...DATASET, unauthorizedReadRatio: 0.5 },
			40
		)
		const failed = results.filter((r) => r.status === "failed")
		assert.strictEqual(
			failed.length,
			0,
			`record-access misclassified denials as failures: ${JSON.stringify(failed.slice(0, 2))}`
		)
		assert.ok(
			results.some((r) => r.deniedAsExpected),
			"expected at least one unauthorized read to be classified as denied"
		)
	}

	// A TRANSIENT failure on an expect-denial op must NOT be laundered into a
	// denial: infrastructure faults carry gRPC messages and stay failures.
	{
		const { RESULTS_DIR_ENV: R } = require("../src/config")
		const saved = process.env[R]
		delete process.env[R] // isolate: no recorder side effects for this probe
		const { ConsentBenchWorkload } = require("../src/base-workload")
		const probe = new ConsentBenchWorkload()
		probe.workerIndex = 0
		probe.recorder = { record() {}, flush() {} }
		const denial = probe._isExpectedDenial(new Error("")) // empty msg → denial
		const authDenial = probe._isExpectedDenial(new Error("ACCESS_DENIED action=READ_RECORD"))
		const timeout = probe._isExpectedDenial(new Error("request timed out"))
		const network = probe._isExpectedDenial(new Error("14 UNAVAILABLE: connection refused"))
		assert.strictEqual(denial, true, "empty-message rejection is a denial")
		assert.strictEqual(authDenial, true, "ACCESS_DENIED message is a denial")
		assert.strictEqual(timeout, false, "timeout must remain a failure")
		assert.strictEqual(network, false, "network error must remain a failure")
		if (saved !== undefined) process.env[R] = saved
	}

	// consent-revocation: revokes then replenishes without duplicate-grant conflicts
	{
		const { results } = await runWorkload(
			"../workloads/consent-revocation.js",
			{ ...DATASET, seedConsentRatio: 0.9 },
			20
		)
		assert.ok(
			results.every((r) => r.status === "success"),
			`revocation produced failures: ${JSON.stringify(results.filter((r) => r.status !== "success"))}`
		)
	}

	// mixed workload: no failures across a longer weighted run
	{
		const { results } = await runWorkload("../workloads/mixed-workload.js", DATASET, 50)
		assert.ok(results.every((r) => r.status === "success"))
	}

	// CONCURRENCY regression (found on the live network): with slow commits
	// and many transactions in flight, no operation may ever target a pair
	// whose grant/revoke is still uncommitted. Before pair locking this
	// produced duplicate-grant and missing-consent endorsement conflicts.
	{
		const { createWorkloadModule } = require("../workloads/mixed-workload.js")
		const workload = createWorkloadModule()
		const adapter = new FakeSutAdapter(25) // 25 ms simulated commit latency
		await workload.initializeWorkloadModule(
			0, 1, 0,
			{ ...DATASET, seedConsentRatio: 0.5 },
			adapter, {}
		)
		const bursts = []
		for (let round = 0; round < 5; round++) {
			const inFlight = []
			for (let i = 0; i < 12; i++) inFlight.push(workload.submitTransaction())
			bursts.push(...(await Promise.all(inFlight)))
		}
		await workload.cleanupWorkloadModule()
		const failed = bursts.filter((r) => r.status === "failed")
		assert.strictEqual(
			failed.length,
			0,
			`concurrent bursts produced conflicts: ${JSON.stringify(failed.slice(0, 3))}`
		)
		const busy = workload.dataset.pairs.filter((p) => p.busy)
		assert.strictEqual(busy.length, 0, "every pair must be released after settlement")
	}

	// recorder + manifest artifacts exist and aggregate cleanly
	{
		const rawFiles = fs.readdirSync(path.join(tmp, "raw"))
		assert.ok(rawFiles.length >= 4, "each workload should have written latency samples")
		const manifests = fs.readdirSync(path.join(tmp, "manifests"))
		assert.ok(manifests.length >= 4, "each workload should have written a dataset manifest")
		const manifest = JSON.parse(
			fs.readFileSync(path.join(tmp, "manifests", manifests[0]), "utf8")
		)
		assert.strictEqual(manifest.counts.patients, DATASET.patientCount)
		assert.strictEqual(manifest.counts.records, DATASET.patientCount * DATASET.recordsPerPatient)

		const { execFileSync } = require("child_process")
		execFileSync("node", [path.resolve(__dirname, "../src/aggregate-results.js"), tmp])
		const summary = JSON.parse(fs.readFileSync(path.join(tmp, "summary.json"), "utf8"))
		assert.ok(summary.failureDefinition.includes("30 s"))
		assert.strictEqual(Object.keys(summary.benchmarks).length, 4)
		for (const [name, bench] of Object.entries(summary.benchmarks)) {
			assert.ok(Number.isFinite(bench.pooled.p95), `pooled p95 missing for ${name}`)
			assert.strictEqual(bench.acrossRuns.totalFailed, 0, `failures in ${name}`)
		}
	}

	fs.rmSync(tmp, { recursive: true, force: true })
	console.log("workload.test.js: all assertions passed")
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
