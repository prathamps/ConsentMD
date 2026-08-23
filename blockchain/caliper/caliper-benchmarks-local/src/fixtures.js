"use strict"

const fs = require("fs")
const path = require("path")
const {
	patientIdentityName,
	doctorIdentityName,
	RESULTS_DIR_ENV,
	RUN_LABEL_ENV,
} = require("./config")

/**
 * Test dataset: who exists on the ledger and which consents are active.
 *
 * The dataset is seeded once per round by `seedDataset` and then mutated by
 * the workloads as they grant/revoke, so the local picture always mirrors the
 * ledger. Consent state is tracked per (record, doctor) pair because that is
 * exactly how the chaincode keys consents — granting an already-active pair
 * is a Conflict, and the workloads must not generate those by accident.
 *
 * Pairs are ACQUIRED for one operation at a time and only released when that
 * operation settles (commit or failure). The local `active` flag flips on
 * COMMIT, never at submit time: the ledger's state changes when the
 * transaction commits, so an in-flight pair must be untouchable — selecting
 * it again mid-transition produces self-inflicted endorsement conflicts.
 *
 * Patients (and therefore records and consent pairs) are partitioned across
 * Caliper workers, so two workers never race on the same consent pair.
 */
class Dataset {
	constructor(patients, doctors, records, pairs) {
		this.patients = patients
		this.doctors = doctors
		this.records = records
		this.pairs = pairs
		this.writeSeq = 0
	}

	/** Monotonic counter for uniquely naming write-saturation records. */
	nextWriteSeq() {
		return this.writeSeq++
	}

	get activePairs() {
		return this.pairs.filter((p) => p.active)
	}

	get inactivePairs() {
		return this.pairs.filter((p) => !p.active)
	}

	/** Reserve a random pair with active consent, or null if none is free. */
	acquireActivePair() {
		return this._acquire(this.pairs.filter((p) => p.active && !p.busy))
	}

	/** Reserve a random pair without active consent, or null if none is free. */
	acquireInactivePair() {
		return this._acquire(this.pairs.filter((p) => !p.active && !p.busy))
	}

	_acquire(candidates) {
		const pair = randomItem(candidates)
		if (pair) pair.busy = true
		return pair
	}

	/** Settle an operation: optionally flip consent state, then free the pair. */
	release(pair, { active } = {}) {
		if (typeof active === "boolean") pair.active = active
		pair.busy = false
	}

	/** Counts reported in the dataset manifest (reviewer item 7). */
	counts() {
		return {
			patients: this.patients.length,
			doctors: this.doctors.length,
			records: this.records.length,
			consentPairs: this.pairs.length,
			activeConsents: this.activePairs.length,
		}
	}
}

function randomItem(list) {
	if (list.length === 0) return null
	return list[Math.floor(Math.random() * list.length)]
}

/**
 * Identities this worker owns, by the provisioning naming convention.
 * Global identity index = workerIndex + k * totalWorkers, so workers hold
 * disjoint slices and the required pool size is count * totalWorkers.
 */
function workerIdentities(nameFor, count, workerIndex, totalWorkers) {
	const identities = []
	for (let k = 0; k < count; k++) {
		identities.push({ identityName: nameFor(workerIndex + k * totalWorkers), ledgerId: null })
	}
	return identities
}

/** Concurrency for seeding transactions: high enough to hide the ~1-2 s
 * commit latency, low enough not to contend with other workers. */
const SEED_CONCURRENCY = 8

/** Run tasks with bounded concurrency, failing fast on the first error. */
async function inBatches(items, worker) {
	const queue = [...items.entries()]
	const runners = Array.from(
		{ length: Math.min(SEED_CONCURRENCY, queue.length) },
		async () => {
			while (queue.length > 0) {
				const [index, item] = queue.shift()
				await worker(item, index)
			}
		}
	)
	await Promise.all(runners)
}

/**
 * Seed the ledger for one benchmark round: register doctors, create records,
 * grant the initial consent set. Ledger-assigned identifiers (doctorId,
 * recordId, patientId) are captured from the transaction payloads — they are
 * certificate-derived and cannot be predicted client-side.
 *
 * Initial consents are granted DETERMINISTICALLY (every pair whose index
 * falls under seedConsentRatio) so repeated runs seed identical datasets.
 * Seeding runs SEED_CONCURRENCY transactions in flight; targets are all
 * distinct, so no seeding transaction ever conflicts with another.
 */
async function seedDataset(gateway, settings, workerIndex, totalWorkers) {
	const patients = workerIdentities(
		patientIdentityName,
		settings.patientCount,
		workerIndex,
		totalWorkers
	)
	const doctors = workerIdentities(
		doctorIdentityName,
		settings.doctorCount,
		workerIndex,
		totalWorkers
	)

	await inBatches(doctors, async (doctor, i) => {
		doctor.name = `Dr. Bench ${workerIndex}_${i}`
		doctor.specialization = "General Practice"
		const profile = await gateway.registerDoctorProfile(doctor)
		doctor.ledgerId = profile.doctorId
	})

	const recordSlots = []
	for (const patient of patients) {
		for (let i = 0; i < settings.recordsPerPatient; i++) recordSlots.push({ patient, i })
	}
	const records = []
	await inBatches(recordSlots, async ({ patient, i }) => {
		const created = await gateway.createPatientRecord(patient, {
			fileName: `bench_${workerIndex}_${i}.pdf`,
			s3ObjectKey: `bench/${workerIndex}/${patient.identityName}/${i}`,
			fileHash: `hash_${patient.identityName}_${i}`,
			details: `Benchmark medical record ${i}`,
		})
		patient.ledgerId = created.patientId
		records.push({ recordId: created.recordId, patient })
	})

	const pairs = []
	for (const record of records) {
		for (const doctor of doctors) {
			pairs.push({ record, doctor, patient: record.patient, active: false, busy: false })
		}
	}
	const toActivate = pairs.slice(0, Math.round(pairs.length * settings.seedConsentRatio))
	await inBatches(toActivate, async (pair) => {
		await gateway.grantConsent(pair.patient, pair.record.recordId, pair.doctor.ledgerId)
		pair.active = true
	})

	return new Dataset(patients, doctors, records, pairs)
}

/**
 * Persist what this worker put on the ledger, so every report states the
 * exact dataset size behind its numbers (reviewer item 7). The aggregator
 * sums manifests across workers per round.
 */
function writeDatasetManifest(dataset, settings, { workerIndex, roundIndex }) {
	const resultsDir = process.env[RESULTS_DIR_ENV]
	if (!resultsDir) return
	const dir = path.join(resultsDir, "manifests")
	fs.mkdirSync(dir, { recursive: true })
	const runLabel = process.env[RUN_LABEL_ENV] || "run"
	const file = path.join(dir, `${runLabel}.round${roundIndex}.worker${workerIndex}.json`)
	fs.writeFileSync(
		file,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				workerIndex,
				roundIndex,
				settings,
				counts: dataset.counts(),
			},
			null,
			"\t"
		)
	)
}

module.exports = { Dataset, seedDataset, writeDatasetManifest, randomItem }
