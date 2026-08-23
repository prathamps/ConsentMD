"use strict"

const { randomItem } = require("./fixtures")

/**
 * Benchmark operation builders shared by all workloads.
 *
 * Each builder ACQUIRES its (record, doctor) pair from the dataset — taking
 * it out of circulation for the duration of the transaction — and releases it
 * when the operation settles. Consent state flips on COMMIT only, mirroring
 * the ledger: flipping at submit time lets concurrent in-flight operations
 * pick pairs mid-transition and endorse against stale state, which shows up
 * as self-inflicted duplicate-grant / missing-consent conflicts under load.
 *
 * The base workload guarantees exactly one settlement callback per operation:
 * onCommitted for a committed transaction, onFailed for everything else
 * (including expected authorization denials).
 */

function grantOperation(gateway, dataset) {
	const pair = dataset.acquireInactivePair()
	if (!pair) return null
	return {
		name: "grantConsent",
		run: () => gateway.grantConsent(pair.patient, pair.record.recordId, pair.doctor.ledgerId),
		onCommitted: () => dataset.release(pair, { active: true }),
		onFailed: () => dataset.release(pair),
	}
}

function revokeOperation(gateway, dataset) {
	const pair = dataset.acquireActivePair()
	if (!pair) return null
	return {
		name: "revokeConsent",
		run: () => gateway.revokeConsent(pair.patient, pair.record.recordId, pair.doctor.ledgerId),
		onCommitted: () => dataset.release(pair, { active: false }),
		onFailed: () => dataset.release(pair),
	}
}

/**
 * A doctor reads a record. With probability `unauthorizedRatio` the reader
 * deliberately holds no active consent, and the chaincode's denial is the
 * expected (correct) outcome — recorded as "denied", not as a failure.
 * Acquiring the pair keeps its consent state stable while the read is in
 * flight, so the expected outcome is deterministic.
 */
function readOperation(gateway, dataset, unauthorizedRatio) {
	const preferDenied = Math.random() < unauthorizedRatio
	const pair = preferDenied
		? dataset.acquireInactivePair() || dataset.acquireActivePair()
		: dataset.acquireActivePair() || dataset.acquireInactivePair()
	if (!pair) return null
	return {
		name: "recordAccess",
		run: () => gateway.readRecordAsDoctor(pair.doctor, pair.record.recordId),
		expectDenial: !pair.active,
		onCommitted: () => dataset.release(pair),
		onFailed: () => dataset.release(pair),
	}
}

/**
 * Create a new patient record — the write-saturation operation.
 *
 * Unlike grant/revoke, a create is unbounded and always valid: every call is a
 * single endorsed ledger write with a fresh, transaction-derived record id, so
 * it can sustain any target send rate without exhausting a finite pool of
 * (record, doctor) pairs. This is what lets the write sweep reach 250 TPS.
 */
function createRecordOperation(gateway, dataset, workerIndex) {
	const patient = randomItem(dataset.patients)
	if (!patient) return null
	const seq = dataset.nextWriteSeq()
	return {
		name: "createRecord",
		run: () =>
			gateway.createPatientRecord(patient, {
				fileName: `sat_${workerIndex}_${seq}.pdf`,
				s3ObjectKey: `sat/${workerIndex}/${seq}`,
				fileHash: `sat_${workerIndex}_${seq}_${Date.now()}`,
				details: `write-saturation record ${seq}`,
			}),
	}
}

module.exports = { grantOperation, revokeOperation, readOperation, createRecordOperation }
