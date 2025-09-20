"use strict"

const ErrorHandler = require("./error-handler")

/**
 * Cleanup verification utility for Caliper workload modules.
 * Provides methods to verify that test data has been properly cleaned up after benchmarks.
 */
class CleanupVerifier {
	/**
	 * Verify that patient records have been cleaned up.
	 * @param {Object} sutAdapter - Caliper SUT adapter
	 * @param {Array} recordIds - Array of record IDs to verify
	 * @param {string} patientIdentity - Patient identity for queries
	 * @param {number} workerIndex - Worker index for logging
	 * @returns {Promise<Object>} Cleanup verification results
	 */
	static async verifyRecordCleanup(
		sutAdapter,
		recordIds,
		patientIdentity,
		workerIndex = 0
	) {
		console.log(
			`Worker ${workerIndex}: Verifying cleanup of ${recordIds.length} patient records (identity: ${patientIdentity})`
		)

		return await ErrorHandler.verifyCleanup(
			sutAdapter,
			recordIds,
			"getRecordById",
			patientIdentity,
			"Org1MSP",
			workerIndex
		)
	}

	/**
	 * Verify that doctor profiles have been cleaned up.
	 * @param {Object} sutAdapter - Caliper SUT adapter
	 * @param {Array} doctorIds - Array of doctor IDs to verify
	 * @param {string} doctorIdentity - Doctor identity for queries
	 * @param {number} workerIndex - Worker index for logging
	 * @returns {Promise<Object>} Cleanup verification results
	 */
	static async verifyDoctorCleanup(
		sutAdapter,
		doctorIds,
		doctorIdentity,
		workerIndex = 0
	) {
		console.log(
			`Worker ${workerIndex}: Verifying cleanup of ${doctorIds.length} doctor profiles`
		)

		return await ErrorHandler.verifyCleanup(
			sutAdapter,
			doctorIds,
			"getDoctorProfile",
			doctorIdentity,
			"Org2MSP",
			workerIndex
		)
	}

	/**
	 * Verify that consent records have been cleaned up.
	 * @param {Object} sutAdapter - Caliper SUT adapter
	 * @param {Array} consentIds - Array of consent IDs to verify
	 * @param {string} patientIdentity - Patient identity for queries
	 * @param {number} workerIndex - Worker index for logging
	 * @returns {Promise<Object>} Cleanup verification results
	 */
	static async verifyConsentCleanup(
		sutAdapter,
		consentIds,
		patientIdentity,
		workerIndex = 0
	) {
		console.log(
			`Worker ${workerIndex}: Verifying cleanup of ${consentIds.length} consent records`
		)

		return await ErrorHandler.verifyCleanup(
			sutAdapter,
			consentIds,
			"getConsentStatus",
			patientIdentity,
			"Org1MSP",
			workerIndex
		)
	}

	/**
	 * Perform comprehensive cleanup verification for all test data types.
	 * @param {Object} sutAdapter - Caliper SUT adapter
	 * @param {Object} testData - Object containing arrays of test data IDs
	 * @param {Object} identities - Object containing sample identities for queries
	 * @param {number} workerIndex - Worker index for logging
	 * @returns {Promise<Object>} Comprehensive cleanup verification results
	 */
	static async verifyComprehensiveCleanup(
		sutAdapter,
		testData = {},
		identities = {},
		workerIndex = 0
	) {
		const results = {
			overall: {
				success: true,
				totalItems: 0,
				cleanedItems: 0,
				remainingItems: 0,
				errors: 0,
			},
			records: null,
			doctors: null,
			consents: null,
		}

		try {
			const recordGroups = testData.recordIdsByIdentity || {}

			if (recordGroups && Object.keys(recordGroups).length > 0) {
				results.records = {
					totalItems: 0,
					cleanedItems: 0,
					remainingItems: 0,
					errors: 0,
					details: [],
					perIdentity: [],
				}

				for (const [identity, recordIds] of Object.entries(recordGroups)) {
					const recordResult = await this.verifyRecordCleanup(
						sutAdapter,
						recordIds,
						identity,
						workerIndex
					)

					results.records.totalItems += recordResult.totalItems
					results.records.cleanedItems += recordResult.cleanedItems
					results.records.remainingItems += recordResult.remainingItems
					results.records.errors += recordResult.errors

					if (recordResult.details) {
						results.records.details.push(
							...recordResult.details.map((detail) => ({
								...detail,
								identity,
							}))
						)
					}

					results.records.perIdentity.push({ identity, ...recordResult })
				}

				results.overall.totalItems += results.records.totalItems
				results.overall.cleanedItems += results.records.cleanedItems
				results.overall.remainingItems += results.records.remainingItems
				results.overall.errors += results.records.errors
			} else if (
				Array.isArray(testData.recordIds) &&
				testData.recordIds.length > 0
			) {
				const patientIdentity =
					identities?.patient ||
					Object.keys(identities?.recordInvokerMap || {})[0]

				if (!patientIdentity) {
					throw new Error(
						"No patient identity available for record cleanup verification"
					)
				}

				results.records = await this.verifyRecordCleanup(
					sutAdapter,
					testData.recordIds,
					patientIdentity,
					workerIndex
				)
				results.overall.totalItems += results.records.totalItems
				results.overall.cleanedItems += results.records.cleanedItems
				results.overall.remainingItems += results.records.remainingItems
				results.overall.errors += results.records.errors
			}

			// Verify doctor cleanup if requested (legacy behaviour)
			if (testData.doctorIds && testData.doctorIds.length > 0) {
				const doctorIdentity = identities?.doctor
				if (!doctorIdentity) {
					console.warn(
						"No doctor identity provided for cleanup verification; skipping doctor checks"
					)
				} else {
					results.doctors = await this.verifyDoctorCleanup(
						sutAdapter,
						testData.doctorIds,
						doctorIdentity,
						workerIndex
					)
					results.overall.totalItems += results.doctors.totalItems
					results.overall.cleanedItems += results.doctors.cleanedItems
					results.overall.remainingItems += results.doctors.remainingItems
					results.overall.errors += results.doctors.errors
				}
			}

			if (testData.consentIds && testData.consentIds.length > 0) {
				const patientIdentity =
					identities?.patient ||
					Object.keys(identities?.recordInvokerMap || {})[0]

				if (!patientIdentity) {
					console.warn(
						"No patient identity provided for consent cleanup verification; skipping consent checks"
					)
				} else {
					results.consents = await this.verifyConsentCleanup(
						sutAdapter,
						testData.consentIds,
						patientIdentity,
						workerIndex
					)
					results.overall.totalItems += results.consents.totalItems
					results.overall.cleanedItems += results.consents.cleanedItems
					results.overall.remainingItems += results.consents.remainingItems
					results.overall.errors += results.consents.errors
				}
			}

			results.overall.success =
				results.overall.cleanedItems === results.overall.totalItems &&
				results.overall.errors === 0

			results.overall.cleanupRate =
				results.overall.totalItems > 0
					? (results.overall.cleanedItems / results.overall.totalItems) * 100
					: 100

			console.log(
				`Worker ${workerIndex}: Comprehensive cleanup verification complete - Success: ${
					results.overall.success
				}, Rate: ${results.overall.cleanupRate.toFixed(2)}%`
			)

			return results
		} catch (error) {
			console.error(
				`Worker ${workerIndex}: Error during comprehensive cleanup verification: ${error.message}`
			)
			results.overall.success = false
			results.overall.error = error.message
			return results
		}
	}

	/**
	 * Generate a cleanup verification report.
	 * @param {Object} verificationResults - Results from cleanup verification
	 * @param {number} workerIndex - Worker index for logging
	 * @returns {string} Formatted cleanup report
	 */
	static generateCleanupReport(verificationResults, workerIndex = 0) {
		const report = []
		report.push(`\n=== Cleanup Verification Report - Worker ${workerIndex} ===`)

		if (verificationResults.overall) {
			const overall = verificationResults.overall
			report.push(`Overall Status: ${overall.success ? "SUCCESS" : "FAILED"}`)
			report.push(`Total Items: ${overall.totalItems}`)
			report.push(`Cleaned Items: ${overall.cleanedItems}`)
			report.push(`Remaining Items: ${overall.remainingItems}`)
			report.push(`Errors: ${overall.errors}`)
			report.push(`Cleanup Rate: ${overall.cleanupRate?.toFixed(2) || 0}%`)
		}

		// Add detailed results for each data type
		if (verificationResults.records) {

			report.push(

				`\nRecord Cleanup: ${verificationResults.records.cleanedItems}/${verificationResults.records.totalItems} cleaned`

			)

			if (verificationResults.records.perIdentity) {

				verificationResults.records.perIdentity.forEach((group) => {

					report.push(

						`  - ${group.identity}: ${group.cleanedItems}/${group.totalItems} cleaned`

					)

				})

			}

		}


		if (verificationResults.doctors) {
			report.push(
				`Doctor Cleanup: ${verificationResults.doctors.cleanedItems}/${verificationResults.doctors.totalItems} cleaned`
			)
		}

		if (verificationResults.consents) {
			report.push(
				`Consent Cleanup: ${verificationResults.consents.cleanedItems}/${verificationResults.consents.totalItems} cleaned`
			)
		}

		// Add error details if any
		const allDetails = []
		if (verificationResults.records?.details)
			allDetails.push(...verificationResults.records.details)
		if (verificationResults.doctors?.details)
			allDetails.push(...verificationResults.doctors.details)
		if (verificationResults.consents?.details)
			allDetails.push(...verificationResults.consents.details)

		const errorDetails = allDetails.filter(
			(detail) => detail.status === "error" || detail.status === "remaining"
		)
		if (errorDetails.length > 0) {
			report.push(`\nIssues Found:`)
			errorDetails.forEach((detail) => {
				report.push(`  - ${detail.id}: ${detail.message}`)
			})
		}

		report.push(`=== End Cleanup Report ===\n`)

		return report.join("\n")
	}

	/**
	 * Wait for cleanup operations to complete before verification.
	 * @param {number} delayMs - Delay in milliseconds before verification
	 * @param {number} workerIndex - Worker index for logging
	 * @returns {Promise<void>}
	 */
	static async waitForCleanup(delayMs = 2000, workerIndex = 0) {
		console.log(
			`Worker ${workerIndex}: Waiting ${delayMs}ms for cleanup operations to complete...`
		)
		await ErrorHandler.sleep(delayMs)
	}
}

module.exports = CleanupVerifier
