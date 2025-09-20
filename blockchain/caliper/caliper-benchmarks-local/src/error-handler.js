"use strict"

/**
 * Error handling utility for Caliper workload modules.
 * Provides common error categorization, retry logic, and cleanup verification.
 */
class ErrorHandler {
	/**
	 * Error categories for different types of failures.
	 */
	static ERROR_CATEGORIES = {
		AUTHORIZATION: "AUTHORIZATION",
		DATA_CONSISTENCY: "DATA_CONSISTENCY",
		NETWORK: "NETWORK",
		TIMEOUT: "TIMEOUT",
		UNKNOWN: "UNKNOWN",
	}

	/**
	 * Default retry configuration.
	 */
	static DEFAULT_RETRY_CONFIG = {
		maxRetries: 3,
		retryDelay: 1000, // 1 second
		backoffMultiplier: 2,
		retryableCategories: ["NETWORK", "TIMEOUT"],
	}

	/**
	 * Categorize an error based on its message and properties.
	 * @param {Error} error - The error to categorize
	 * @param {string} transactionType - The type of transaction that failed
	 * @returns {Object} Error category information
	 */
	static categorizeError(error, transactionType = "unknown") {
		const errorMessage = error.message ? error.message.toLowerCase() : ""

		// Authorization errors
		if (
			errorMessage.includes("authorization") ||
			errorMessage.includes("permission") ||
			errorMessage.includes("access denied") ||
			errorMessage.includes("unauthorized") ||
			errorMessage.includes("forbidden")
		) {
			return {
				category: this.ERROR_CATEGORIES.AUTHORIZATION,
				retry: false,
				description: "Authorization or permission error",
			}
		}

		// Data consistency errors
		if (
			errorMessage.includes("not found") ||
			errorMessage.includes("already exists") ||
			errorMessage.includes("invalid state") ||
			errorMessage.includes("conflict") ||
			errorMessage.includes("duplicate")
		) {
			return {
				category: this.ERROR_CATEGORIES.DATA_CONSISTENCY,
				retry: false,
				description: "Data consistency or state error",
			}
		}

		// Network and timeout errors
		if (
			errorMessage.includes("timeout") ||
			errorMessage.includes("connection") ||
			errorMessage.includes("network") ||
			errorMessage.includes("unavailable") ||
			errorMessage.includes("service temporarily") ||
			error.code === "ECONNRESET" ||
			error.code === "ETIMEDOUT"
		) {
			return {
				category: this.ERROR_CATEGORIES.NETWORK,
				retry: true,
				description: "Network or timeout error",
			}
		}

		// Timeout-specific errors
		if (
			errorMessage.includes("timed out") ||
			errorMessage.includes("deadline exceeded") ||
			error.code === "TIMEOUT"
		) {
			return {
				category: this.ERROR_CATEGORIES.TIMEOUT,
				retry: true,
				description: "Transaction timeout error",
			}
		}

		// Unknown errors
		return {
			category: this.ERROR_CATEGORIES.UNKNOWN,
			retry: false,
			description: "Unknown error type",
		}
	}

	/**
	 * Execute a function with retry logic for network timeouts and transient errors.
	 * @param {Function} fn - The async function to execute
	 * @param {Object} retryConfig - Retry configuration options
	 * @param {string} operationType - Type of operation for logging
	 * @param {number} workerIndex - Worker index for logging
	 * @returns {Promise<Object>} Result of the function execution
	 */
	static async executeWithRetry(
		fn,
		retryConfig = {},
		operationType = "unknown",
		workerIndex = 0
	) {
		const config = { ...this.DEFAULT_RETRY_CONFIG, ...retryConfig }
		let lastError = null
		let attempt = 0

		while (attempt <= config.maxRetries) {
			try {
				const result = await fn()
				if (attempt > 0) {
					console.log(
						`Worker ${workerIndex}: ${operationType} succeeded on attempt ${
							attempt + 1
						}`
					)
				}
				return result
			} catch (error) {
				lastError = error
				attempt++

				const errorInfo = this.categorizeError(error, operationType)

				// Check if this error type should be retried
				if (
					!config.retryableCategories.includes(errorInfo.category) ||
					attempt > config.maxRetries
				) {
					console.error(
						`Worker ${workerIndex}: ${operationType} failed with non-retryable error (${errorInfo.category}): ${error.message}`
					)
					throw error
				}

				// Calculate delay with exponential backoff
				const delay =
					config.retryDelay * Math.pow(config.backoffMultiplier, attempt - 1)

				console.warn(
					`Worker ${workerIndex}: ${operationType} failed on attempt ${attempt} (${errorInfo.category}): ${error.message}. Retrying in ${delay}ms...`
				)

				// Wait before retrying
				await this.sleep(delay)
			}
		}

		// If we get here, all retries failed
		throw lastError
	}

	/**
	 * Handle transaction errors gracefully and return standardized error response.
	 * @param {Error} error - The error that occurred
	 * @param {string} operationType - Type of operation that failed
	 * @param {number} workerIndex - Worker index for logging
	 * @param {Object} additionalInfo - Additional information to include in response
	 * @returns {Object} Standardized error response
	 */
	static handleTransactionError(
		error,
		operationType,
		workerIndex = 0,
		additionalInfo = {}
	) {
		const errorInfo = this.categorizeError(error, operationType)

		console.error(
			`Worker ${workerIndex}: ${operationType} transaction failed (${errorInfo.category}): ${error.message}`
		)

		return {
			status: "failed",
			error: error.message,
			errorCategory: errorInfo.category,
			errorDescription: errorInfo.description,
			operationType: operationType,
			workerIndex: workerIndex,
			timestamp: new Date().toISOString(),
			...additionalInfo,
		}
	}

	/**
	 * Sleep for a specified number of milliseconds.
	 * @param {number} ms - Milliseconds to sleep
	 * @returns {Promise<void>}
	 */
	static sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * Verify cleanup by attempting to query test data and ensuring it's been removed.
	 * @param {Object} sutAdapter - Caliper SUT adapter
	 * @param {Array} testDataIds - Array of test data IDs to verify cleanup
	 * @param {string} queryFunction - Chaincode function to query data
	 * @param {string} invokerIdentity - Identity to use for queries
	 * @param {string} invokerMspId - MSP ID for the invoker
	 * @param {number} workerIndex - Worker index for logging
	 * @returns {Promise<Object>} Cleanup verification results
	 */
	static async verifyCleanup(
		sutAdapter,
		testDataIds,
		queryFunction,
		invokerIdentity,
		invokerMspId,
		workerIndex = 0
	) {
		const verificationResults = {
			totalItems: testDataIds.length,
			cleanedItems: 0,
			remainingItems: 0,
			errors: 0,
			details: [],
		}

		console.log(
			`Worker ${workerIndex}: Verifying cleanup of ${testDataIds.length} test data items`
		)

		for (const dataId of testDataIds) {
			try {
				const request = {
					contractId: "medicalconsent",
					contractFunction: queryFunction,
					contractArguments: [dataId],
					invokerIdentity: invokerIdentity,
					invokerMspId: invokerMspId,
					readOnly: true,
				}

				const result = await sutAdapter.sendRequests(request)

				if (result.status === "success" && result.result) {
					// Data still exists - not cleaned up
					verificationResults.remainingItems++
					verificationResults.details.push({
						id: dataId,
						status: "remaining",
						message: "Data still exists after cleanup",
					})
				} else {
					// Data not found - successfully cleaned up
					verificationResults.cleanedItems++
					verificationResults.details.push({
						id: dataId,
						status: "cleaned",
						message: "Data successfully removed",
					})
				}
			} catch (error) {
				// Query error - might indicate cleanup or other issues
				verificationResults.errors++
				verificationResults.details.push({
					id: dataId,
					status: "error",
					message: `Verification error: ${error.message}`,
				})

				console.warn(
					`Worker ${workerIndex}: Error verifying cleanup for ${dataId}: ${error.message}`
				)
			}
		}

		const cleanupSuccess =
			verificationResults.cleanedItems === verificationResults.totalItems

		console.log(
			`Worker ${workerIndex}: Cleanup verification complete - Cleaned: ${verificationResults.cleanedItems}, Remaining: ${verificationResults.remainingItems}, Errors: ${verificationResults.errors}`
		)

		return {
			...verificationResults,
			success: cleanupSuccess,
			cleanupRate:
				verificationResults.totalItems > 0
					? (verificationResults.cleanedItems /
							verificationResults.totalItems) *
					  100
					: 100,
		}
	}

	/**
	 * Create a standardized success response for transactions.
	 * @param {Object} result - Transaction result
	 * @param {string} operationType - Type of operation
	 * @param {number} latency - Transaction latency in milliseconds
	 * @param {Object} additionalInfo - Additional information to include
	 * @returns {Object} Standardized success response
	 */
	static createSuccessResponse(
		result,
		operationType,
		latency,
		additionalInfo = {}
	) {
		return {
			status: "success",
			latency: latency,
			operationType: operationType,
			timestamp: new Date().toISOString(),
			...additionalInfo,
		}
	}

	/**
	 * Log performance metrics for debugging and monitoring.
	 * @param {number} workerIndex - Worker index
	 * @param {string} operationType - Type of operation
	 * @param {Object} metrics - Performance metrics to log
	 */
	static logPerformanceMetrics(workerIndex, operationType, metrics) {
		console.log(
			`Worker ${workerIndex}: ${operationType} metrics - ${JSON.stringify(
				metrics,
				null,
				2
			)}`
		)
	}
}

module.exports = ErrorHandler
