"use strict"

const { CONTRACT_ID, PATIENT_MSP, DOCTOR_MSP } = require("./config")

/**
 * Thin, typed facade over Caliper's SUT adapter.
 *
 * This is the only file in the suite that knows chaincode function names,
 * argument orders, and Caliper's TxStatus API. Workloads speak in domain
 * verbs (grantConsent, readRecord, ...) and receive parsed JSON payloads.
 */

/** Thrown when the SDK reports a transaction as not committed. */
class TransactionFailedError extends Error {
	constructor(operation, reason) {
		super(`${operation} failed: ${reason}`)
		this.name = "TransactionFailedError"
		this.operation = operation
	}
}

/** True when an error is the chaincode's fail-closed authorization denial. */
function isAuthorizationDenial(error) {
	return /is not permitted to|denied|unauthorized|forbidden/i.test(
		error.message || ""
	)
}

class ChaincodeGateway {
	constructor(sutAdapter) {
		this.sutAdapter = sutAdapter
	}

	// --- domain operations -------------------------------------------------

	/** @returns {Promise<object>} the doctor profile, whose doctorId is the ledger identity. */
	registerDoctorProfile(doctor) {
		return this._submit("registerDoctorProfile", {
			args: [doctor.name, doctor.specialization],
			identity: doctor.identityName,
			mspId: DOCTOR_MSP,
		})
	}

	/** @returns {Promise<object>} the created record (recordId, patientId are ledger-assigned). */
	createPatientRecord(patient, { fileName, s3ObjectKey, fileHash, details }) {
		return this._submit("createPatientRecord", {
			args: [fileName, s3ObjectKey, fileHash, details],
			identity: patient.identityName,
			mspId: PATIENT_MSP,
		})
	}

	grantConsent(patient, recordId, doctorLedgerId) {
		return this._submit("grantConsent", {
			args: [recordId, doctorLedgerId],
			identity: patient.identityName,
			mspId: PATIENT_MSP,
		})
	}

	revokeConsent(patient, recordId, doctorLedgerId) {
		return this._submit("revokeConsent", {
			args: [recordId, doctorLedgerId],
			identity: patient.identityName,
			mspId: PATIENT_MSP,
		})
	}

	/** Doctor-side read; the chaincode enforces consent. */
	readRecordAsDoctor(doctor, recordId) {
		return this._submit("getRecordById", {
			args: [recordId],
			identity: doctor.identityName,
			mspId: DOCTOR_MSP,
			readOnly: true,
		})
	}

	/** Identity self-check used by verify-setup to prove role attributes exist. */
	whoAmI(identityName, mspId) {
		return this._submit("whoAmI", {
			args: [],
			identity: identityName,
			mspId,
			readOnly: true,
		})
	}

	// --- transport ---------------------------------------------------------

	async _submit(fn, { args, identity, mspId, readOnly = false }) {
		const status = await this.sutAdapter.sendRequests({
			contractId: CONTRACT_ID,
			contractFunction: fn,
			contractArguments: args,
			invokerIdentity: identity,
			invokerMspId: mspId,
			readOnly,
		})
		assertCommitted(status, fn)
		return parsePayload(status)
	}
}

function assertCommitted(txStatus, operation) {
	const status = Array.isArray(txStatus) ? txStatus[0] : txStatus
	if (!status || typeof status.IsCommitted !== "function") {
		throw new TransactionFailedError(operation, "no transaction status returned")
	}
	if (!status.IsCommitted()) {
		throw new TransactionFailedError(operation, errorMessageOf(status))
	}
}

function errorMessageOf(txStatus) {
	const errors =
		typeof txStatus.GetErrMsg === "function" ? txStatus.GetErrMsg() : null
	if (Array.isArray(errors) && errors.length > 0) return errors.join("; ")
	if (errors) return String(errors)
	return "transaction was not committed"
}

/** Decode TxStatus result bytes into parsed JSON (or null when empty). */
function parsePayload(txStatus) {
	const status = Array.isArray(txStatus) ? txStatus[0] : txStatus
	if (!status || typeof status.GetResult !== "function") return null
	const raw = status.GetResult()
	if (raw == null) return null

	let text
	if (typeof raw === "string") text = raw
	else if (Buffer.isBuffer(raw)) text = raw.toString("utf8")
	else if (ArrayBuffer.isView(raw)) text = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8")
	else if (raw instanceof ArrayBuffer) text = Buffer.from(raw).toString("utf8")
	else if (typeof raw === "object") return raw
	else return null

	const trimmed = text.trim()
	if (!trimmed) return null
	try {
		return JSON.parse(trimmed)
	} catch {
		return trimmed
	}
}

module.exports = { ChaincodeGateway, TransactionFailedError, isAuthorizationDenial }
