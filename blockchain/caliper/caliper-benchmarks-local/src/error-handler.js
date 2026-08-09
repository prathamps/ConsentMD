"use strict"

/**
 * Error categorization and retry policy for workload transactions.
 *
 * Only transient transport problems (NETWORK, TIMEOUT) are ever retried;
 * authorization and state errors are deterministic and retrying them would
 * just re-count the same failure.
 */

const CATEGORY = Object.freeze({
	AUTHORIZATION: "AUTHORIZATION",
	DATA_CONSISTENCY: "DATA_CONSISTENCY",
	NETWORK: "NETWORK",
	TIMEOUT: "TIMEOUT",
	UNKNOWN: "UNKNOWN",
})

const DEFAULT_RETRY = Object.freeze({
	maxRetries: 3,
	retryDelay: 1000,
	backoffMultiplier: 2,
	retryableCategories: [CATEGORY.NETWORK, CATEGORY.TIMEOUT],
})

const MATCHERS = [
	{
		category: CATEGORY.AUTHORIZATION,
		test: /authorization|permission|access denied|unauthorized|forbidden|not permitted/,
	},
	{
		category: CATEGORY.DATA_CONSISTENCY,
		test: /not found|already exists|already granted|already revoked|invalid state|conflict|duplicate/,
	},
	{
		category: CATEGORY.TIMEOUT,
		test: /timed out|deadline exceeded|timeout/,
	},
	{
		category: CATEGORY.NETWORK,
		test: /connection|network|unavailable|service temporarily|econnreset|etimedout/,
	},
]

class ErrorHandler {
	static ERROR_CATEGORIES = CATEGORY

	/** @returns {{category: string, retry: boolean}} */
	static categorizeError(error) {
		const haystack = `${error.message || ""} ${error.code || ""}`.toLowerCase()
		for (const { category, test } of MATCHERS) {
			if (test.test(haystack)) {
				return {
					category,
					retry: category === CATEGORY.NETWORK || category === CATEGORY.TIMEOUT,
				}
			}
		}
		return { category: CATEGORY.UNKNOWN, retry: false }
	}

	/**
	 * Run `fn`, retrying with exponential backoff while the failure category
	 * is in `retryableCategories`. Rethrows the last error when exhausted.
	 */
	static async executeWithRetry(fn, retryConfig = {}, operationType = "unknown", workerIndex = 0) {
		const config = { ...DEFAULT_RETRY, ...retryConfig }
		let lastError = null

		for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
			try {
				return await fn()
			} catch (error) {
				lastError = error
				const { category } = this.categorizeError(error)
				const retriesLeft = attempt < config.maxRetries
				if (!config.retryableCategories.includes(category) || !retriesLeft) {
					throw error
				}
				const delay = config.retryDelay * config.backoffMultiplier ** attempt
				console.warn(
					`Worker ${workerIndex}: ${operationType} attempt ${attempt + 1} failed ` +
						`(${category}): ${error.message}. Retrying in ${delay}ms`
				)
				await sleep(delay)
			}
		}
		throw lastError
	}

	/** Standardized failure object returned from submitTransaction. */
	static handleTransactionError(error, operationType, workerIndex = 0) {
		const { category } = this.categorizeError(error)
		console.error(
			`Worker ${workerIndex}: ${operationType} failed (${category}): ${error.message}`
		)
		return {
			status: "failed",
			error: error.message,
			errorCategory: category,
			operationType,
			workerIndex,
		}
	}
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = ErrorHandler
