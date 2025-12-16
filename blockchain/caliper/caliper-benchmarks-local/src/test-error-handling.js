"use strict"

const ErrorHandler = require("./error-handler")
const CleanupVerifier = require("./cleanup-verifier")

/**
 * Simple test script to verify error handling functionality.
 */
async function testErrorHandling() {
	console.log("=== Testing Error Handler ===\n")

	// Test error categorization
	console.log("1. Testing error categorization:")

	const testErrors = [
		new Error("authorization failed"),
		new Error("record not found"),
		new Error("connection timeout"),
		new Error("network unavailable"),
		new Error("unknown error occurred"),
	]

	testErrors.forEach((error, index) => {
		const category = ErrorHandler.categorizeError(error, "testOperation")
		console.log(
			`   Error ${index + 1}: "${error.message}" -> ${
				category.category
			} (retry: ${category.retry})`
		)
	})

	// Test retry logic with mock function
	console.log("\n2. Testing retry logic:")

	let attemptCount = 0
	const mockFailingFunction = async () => {
		attemptCount++
		if (attemptCount < 3) {
			const error = new Error("connection timeout")
			error.code = "ETIMEDOUT"
			throw error
		}
		return { status: "success", data: "operation completed" }
	}

	try {
		const result = await ErrorHandler.executeWithRetry(
			mockFailingFunction,
			{
				maxRetries: 3,
				retryDelay: 100, // Short delay for testing
				retryableCategories: ["NETWORK", "TIMEOUT"],
			},
			"testRetry",
			0
		)
		console.log(
			`   Retry test succeeded after ${attemptCount} attempts:`,
			result
		)
	} catch (error) {
		console.log(`   Retry test failed:`, error.message)
	}

	// Test standardized responses
	console.log("\n3. Testing standardized responses:")

	const successResponse = ErrorHandler.createSuccessResponse(
		{ status: "success" },
		"testOperation",
		150,
		{ additionalInfo: "test data" }
	)
	console.log("   Success response:", JSON.stringify(successResponse, null, 2))

	const errorResponse = ErrorHandler.handleTransactionError(
		new Error("test error"),
		"testOperation",
		0,
		{ additionalInfo: "test data" }
	)
	console.log("   Error response:", JSON.stringify(errorResponse, null, 2))

	console.log("\n=== Error Handler Tests Complete ===\n")
}

/**
 * Test cleanup verifier functionality.
 */
async function testCleanupVerifier() {
	console.log("=== Testing Cleanup Verifier ===\n")

	// Mock SUT adapter for testing
	const mockSutAdapter = {
		sendRequests: async (request) => {
			// Simulate different responses based on the request
			if (request.contractArguments[0].includes("existing")) {
				return { status: "success", result: "data found" }
			} else {
				return { status: "failed", result: null }
			}
		},
	}

	// Test data for verification
	const testDataIds = {
		recordIds: ["record_existing_1", "record_cleaned_1", "record_cleaned_2"],
		doctorIds: ["doctor_cleaned_1", "doctor_existing_1"],
		consentIds: ["consent_cleaned_1", "consent_cleaned_2"],
	}

	const sampleIdentities = {
		patient: "patient_test@org1.example.com",
		doctor: "doctor_test@org2.example.com",
	}

	console.log("1. Testing comprehensive cleanup verification:")

	try {
		const verificationResults =
			await CleanupVerifier.verifyComprehensiveCleanup(
				mockSutAdapter,
				testDataIds,
				sampleIdentities,
				0
			)

		console.log(
			"   Verification results:",
			JSON.stringify(verificationResults.overall, null, 2)
		)

		// Generate and display report
		const report = CleanupVerifier.generateCleanupReport(verificationResults, 0)
		console.log("   Cleanup report:")
		console.log(report)
	} catch (error) {
		console.log("   Verification test failed:", error.message)
	}

	console.log("=== Cleanup Verifier Tests Complete ===\n")
}

/**
 * Run all tests.
 */
async function runTests() {
	console.log("Starting Error Handling and Cleanup Verification Tests\n")

	try {
		await testErrorHandling()
		await testCleanupVerifier()
		console.log("All tests completed successfully!")
	} catch (error) {
		console.error("Test execution failed:", error.message)
		process.exit(1)
	}
}

// Run tests if this script is executed directly
if (require.main === module) {
	runTests()
}

module.exports = {
	testErrorHandling,
	testCleanupVerifier,
	runTests,
}
