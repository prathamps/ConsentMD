# Error Handling and Cleanup Verification Guide

This document describes the error handling and cleanup verification features implemented in the Caliper benchmark workloads for the ConsentMD system.

## Overview

The error handling system provides:

- **Graceful error handling** with categorization of different error types
- **Retry logic** for network timeouts and transient errors
- **Cleanup verification** to ensure test data is properly removed after benchmarks
- **Standardized error responses** for consistent reporting

## Error Categories

The system categorizes errors into the following types:

### 1. Authorization Errors

- **Category**: `AUTHORIZATION`
- **Retry**: No
- **Examples**: "authorization failed", "access denied", "unauthorized"
- **Handling**: These errors indicate permission issues and are not retried

### 2. Data Consistency Errors

- **Category**: `DATA_CONSISTENCY`
- **Retry**: No
- **Examples**: "not found", "already exists", "invalid state"
- **Handling**: These errors indicate data state issues and are not retried

### 3. Network Errors

- **Category**: `NETWORK`
- **Retry**: Yes
- **Examples**: "connection timeout", "network unavailable", "ECONNRESET"
- **Handling**: These errors are automatically retried with exponential backoff

### 4. Timeout Errors

- **Category**: `TIMEOUT`
- **Retry**: Yes
- **Examples**: "timed out", "deadline exceeded", "ETIMEDOUT"
- **Handling**: These errors are automatically retried with exponential backoff

### 5. Unknown Errors

- **Category**: `UNKNOWN`
- **Retry**: No
- **Examples**: Any error not matching the above patterns
- **Handling**: These errors are logged but not retried

## Retry Logic

The retry mechanism includes:

- **Maximum retry attempts**: Configurable (default: 3)
- **Retry delay**: Configurable with exponential backoff (default: 1000ms)
- **Retryable categories**: Only NETWORK and TIMEOUT errors are retried
- **Backoff multiplier**: Configurable (default: 2x)

### Example Retry Configuration

```javascript
const retryConfig = {
	maxRetries: 2,
	retryDelay: 1000,
	backoffMultiplier: 2,
	retryableCategories: ["NETWORK", "TIMEOUT"],
}
```

## Cleanup Verification

The cleanup verification system ensures that test data is properly removed from the blockchain after benchmark completion.

### Features

1. **Comprehensive verification** of all test data types:

   - Patient records
   - Doctor profiles
   - Consent records

2. **Detailed reporting** with:

   - Total items processed
   - Successfully cleaned items
   - Remaining items (potential issues)
   - Error count and details

3. **Configurable wait time** before verification to allow pending operations to complete

### Verification Process

1. **Data Collection**: Gather all test data IDs created during the benchmark
2. **Wait Period**: Allow time for cleanup operations to complete
3. **Query Verification**: Attempt to query each test data item
4. **Result Analysis**: Categorize results as cleaned, remaining, or error
5. **Report Generation**: Create detailed cleanup report

### Example Cleanup Report

```
=== Cleanup Verification Report - Worker 0 ===
Overall Status: SUCCESS
Total Items: 45
Cleaned Items: 45
Remaining Items: 0
Errors: 0
Cleanup Rate: 100.00%

Record Cleanup: 30/30 cleaned
Doctor Cleanup: 10/10 cleaned
Consent Cleanup: 5/5 cleaned
=== End Cleanup Report ===
```

## Implementation in Workload Modules

### Error Handling in Transactions

```javascript
// Execute transaction with retry logic
const { result, latency } = await ErrorHandler.executeWithRetry(
	executeTransaction,
	{
		maxRetries: 2,
		retryDelay: 1000,
		retryableCategories: ["NETWORK", "TIMEOUT"],
	},
	"grantConsent",
	this.workerIndex
)

// Return standardized response
return ErrorHandler.createSuccessResponse(result, "grantConsent", latency, {
	additionalInfo: "custom data",
})
```

### Error Handling in Catch Blocks

```javascript
catch (error) {
    // Handle error gracefully with categorization
    return ErrorHandler.handleTransactionError(
        error,
        "grantConsent",
        this.workerIndex,
        { additionalInfo: "custom data" }
    )
}
```

### Cleanup Verification in Workload Modules

```javascript
async cleanupWorkloadModule() {
    try {
        // Collect test data IDs
        const testDataIds = {
            recordIds: this.testRecords.map(record => record.recordId),
            doctorIds: this.testDoctors.map(doctor => doctor.doctorId),
            consentIds: this.activeConsents.map(consent => consent.consentId)
        }

        // Sample identities for verification
        const sampleIdentities = {
            patient: this.testPatients[0]?.patientId,
            doctor: this.testDoctors[0]?.doctorId
        }

        // Clear local arrays
        this.testPatients = []
        this.testDoctors = []
        this.testRecords = []

        // Verify cleanup
        if (sampleIdentities.patient && sampleIdentities.doctor) {
            await CleanupVerifier.waitForCleanup(1500, this.workerIndex)

            const verificationResults = await CleanupVerifier.verifyComprehensiveCleanup(
                this.sutAdapter,
                testDataIds,
                sampleIdentities,
                this.workerIndex
            )

            const report = CleanupVerifier.generateCleanupReport(
                verificationResults,
                this.workerIndex
            )
            console.log(report)
        }
    } catch (error) {
        const errorInfo = ErrorHandler.categorizeError(error, "cleanup")
        console.error(`Cleanup error (${errorInfo.category}): ${error.message}`)
    }

    await super.cleanupWorkloadModule()
}
```

## Benefits

### 1. Improved Reliability

- Automatic retry of transient network errors
- Graceful handling of different error types
- Reduced benchmark failures due to temporary issues

### 2. Better Debugging

- Categorized error reporting
- Detailed error information with timestamps
- Performance metrics tracking

### 3. Data Integrity

- Verification that test data is properly cleaned up
- Detection of data leakage between benchmark runs
- Detailed cleanup reporting

### 4. Consistent Behavior

- Standardized error responses across all workload modules
- Uniform retry logic and configuration
- Consistent logging and reporting format

## Configuration

### Error Handler Configuration

The error handling behavior can be customized through configuration objects:

```javascript
const customRetryConfig = {
	maxRetries: 5, // Maximum retry attempts
	retryDelay: 2000, // Initial delay in milliseconds
	backoffMultiplier: 1.5, // Exponential backoff multiplier
	retryableCategories: ["NETWORK", "TIMEOUT", "UNKNOWN"], // Which errors to retry
}
```

### Cleanup Verifier Configuration

Cleanup verification can be customized:

```javascript
// Wait time before verification
await CleanupVerifier.waitForCleanup(3000, this.workerIndex) // 3 seconds

// Custom verification for specific data types
const recordVerification = await CleanupVerifier.verifyRecordCleanup(
	this.sutAdapter,
	recordIds,
	patientIdentity,
	this.workerIndex
)
```

## Best Practices

1. **Use appropriate retry configurations** for different operation types:

   - Shorter delays for read operations
   - Longer delays for write operations
   - Lower retry counts for expensive operations

2. **Always verify cleanup** in production benchmarks to prevent data accumulation

3. **Monitor error categories** to identify systemic issues:

   - High authorization errors may indicate configuration issues
   - High network errors may indicate infrastructure problems

4. **Log performance metrics** to track the impact of error handling on benchmark results

5. **Test error handling** in development environments to ensure proper behavior

## Troubleshooting

### Common Issues

1. **High retry rates**: May indicate network instability or configuration issues
2. **Cleanup verification failures**: May indicate missing cleanup functions in chaincode
3. **Authorization errors**: May indicate incorrect identity configuration
4. **Timeout errors**: May indicate network latency or overloaded system

### Debugging Tips

1. Check error categories in benchmark logs
2. Review retry attempt logs for patterns
3. Examine cleanup verification reports for data leakage
4. Monitor system resources during benchmarks
5. Verify network connectivity and chaincode deployment

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **Requirement 6.2**: Handle common transaction errors gracefully
- **Requirement 7.2**: Verify test data cleanup after each benchmark run
- **Requirement 7.4**: Add simple retry logic for network timeouts

The error handling and cleanup verification system provides a robust foundation for reliable and maintainable Caliper benchmarks.
