"use strict"

/**
 * Shared configuration for the ConsentMD Caliper benchmark suite.
 *
 * Everything the workloads, the identity provisioner, the run scripts, and
 * the results aggregator must agree on lives here, so a change to (say) the
 * failure timeout is one edit rather than five.
 */

/** Chaincode name as deployed on the channel. */
const CONTRACT_ID = "medicalconsent"

/** MSP each role's identities belong to. Patients enroll with the Org1 CA, doctors with Org2's. */
const PATIENT_MSP = "Org1MSP"
const DOCTOR_MSP = "Org2MSP"

/**
 * Naming convention for CA-provisioned benchmark identities.
 *
 * setup/provision-identities.js registers and enrolls these exact names, and
 * the workloads reconstruct them from nothing but the configured counts — so
 * the two sides never need to exchange a file.
 */
const patientIdentityName = (index) => `bench_patient_${index}`
const doctorIdentityName = (index) => `bench_doctor_${index}`

/**
 * Failure definition (reviewer item 12 — see docs/methodology.md).
 *
 * A transaction counts as FAILED when either:
 *   1. the Fabric SDK reports it as not committed (endorsement/validation
 *      error, chaincode error, or explicit rejection), or
 *   2. no final response is observed within FAILURE_TIMEOUT_MS.
 * Authorization denials that a scenario *expects* (e.g. the unauthorized-read
 * mix in the record-access workload) are recorded separately as "denied" and
 * count as CORRECT outcomes, not failures.
 */
const FAILURE_TIMEOUT_MS = 30_000

/**
 * Environment variables set by run-benchmarks.sh so worker processes know
 * where to write per-transaction latency samples and dataset manifests.
 */
const RESULTS_DIR_ENV = "CONSENTMD_RESULTS_DIR"
const RUN_LABEL_ENV = "CONSENTMD_RUN_LABEL"

module.exports = Object.freeze({
	CONTRACT_ID,
	PATIENT_MSP,
	DOCTOR_MSP,
	patientIdentityName,
	doctorIdentityName,
	FAILURE_TIMEOUT_MS,
	RESULTS_DIR_ENV,
	RUN_LABEL_ENV,
})
