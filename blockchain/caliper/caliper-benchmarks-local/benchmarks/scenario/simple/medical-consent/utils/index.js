"use strict"

/**
 * Data Generation and Management Utilities Index
 * Exports all utility classes for easy import in workload modules
 */

const { MedicalDataGenerator } = require("./dataGenerators")
const { IdentityManager } = require("./identityManager")
const { RelationshipManager } = require("./relationshipManager")
const { DataCleanupManager } = require("./dataCleanup")
const { DataValidator } = require("./dataValidator")

/**
 * Utility factory for creating and managing all data utilities
 */
class DataUtilityFactory {
	constructor() {
		this.dataGenerator = new MedicalDataGenerator()
		this.identityManager = new IdentityManager()
		this.relationshipManager = new RelationshipManager()
		this.cleanupManager = new DataCleanupManager()
		this.validator = new DataValidator()
	}

	/**
	 * Get data generator instance
	 */
	getDataGenerator() {
		return this.dataGenerator
	}

	/**
	 * Get identity manager instance
	 */
	getIdentityManager() {
		return this.identityManager
	}

	/**
	 * Get relationship manager instance
	 */
	getRelationshipManager() {
		return this.relationshipManager
	}

	/**
	 * Get cleanup manager instance
	 */
	getCleanupManager() {
		return this.cleanupManager
	}

	/**
	 * Get validator instance
	 */
	getValidator() {
		return this.validator
	}

	/**
	 * Initialize all utilities for a new test run
	 */
	initializeForTestRun(options = {}) {
		console.log("Initializing data utilities for test run...")

		// Clean up previous test data if requested
		if (options.cleanupBefore) {
			this.cleanupManager.performFullCleanup()
		}

		// Initialize fresh state
		this.cleanupManager.resetForNewTestRun({
			preserveIdentities: options.preserveIdentities || false,
			preserveRelationships: options.preserveRelationships || false,
			clearMetrics: options.clearMetrics !== false,
		})

		console.log("Data utilities initialized successfully")
		return {
			initialized: true,
			timestamp: new Date().toISOString(),
			options: options,
		}
	}

	/**
	 * Validate all data before test execution
	 */
	validateBeforeTest() {
		console.log("Validating data before test execution...")

		const validationResults = this.validator.validateCompleteDataSet()

		if (validationResults.summary.critical > 0) {
			throw new Error(
				`Critical data validation issues found: ${validationResults.summary.critical}`
			)
		}

		if (validationResults.summary.errors > 0) {
			console.warn(
				`Data validation errors found: ${validationResults.summary.errors}`
			)
		}

		console.log("Data validation completed successfully")
		return validationResults
	}

	/**
	 * Clean up after test execution
	 */
	cleanupAfterTest(strategy = "full") {
		console.log(`Performing ${strategy} cleanup after test execution...`)

		let cleanupResult
		switch (strategy) {
			case "full":
				cleanupResult = this.cleanupManager.performFullCleanup()
				break
			case "selective":
				cleanupResult = this.cleanupManager.performSelectiveCleanup({
					clearPatients: true,
					clearDoctors: true,
					clearRecords: true,
					clearConsents: true,
					clearRelationships: true,
					clearGlobalArrays: true,
				})
				break
			case "soft":
				cleanupResult = this.cleanupManager.performSoftCleanup()
				break
			case "validation":
				cleanupResult = this.cleanupManager.performValidationCleanup()
				break
			default:
				throw new Error(`Unknown cleanup strategy: ${strategy}`)
		}

		console.log("Cleanup completed successfully")
		return cleanupResult
	}

	/**
	 * Generate comprehensive test report
	 */
	generateTestReport() {
		const dataStats = this.cleanupManager.getDataStats()
		const validationResults = this.validator.validateCompleteDataSet()
		const relationshipStats = this.relationshipManager.getRelationshipStats()

		return {
			timestamp: new Date().toISOString(),
			dataStatistics: dataStats,
			validationResults: validationResults,
			relationshipStatistics: relationshipStats,
			summary: {
				totalEntities:
					dataStats.identityRegistry.patients +
					dataStats.identityRegistry.doctors +
					dataStats.identityRegistry.records +
					dataStats.identityRegistry.consents,
				totalRelationships:
					relationshipStats.patientRecords +
					relationshipStats.doctorRecords +
					relationshipStats.consentChains,
				validationIssues: validationResults.summary.totalIssues,
				dataQuality: this.calculateDataQuality(validationResults),
			},
		}
	}

	/**
	 * Calculate data quality score
	 */
	calculateDataQuality(validationResults) {
		const { critical, errors, warnings, totalIssues } =
			validationResults.summary

		if (totalIssues === 0) {
			return "excellent"
		}

		if (critical > 0) {
			return "poor"
		}

		if (errors > 5) {
			return "fair"
		}

		if (warnings > 10) {
			return "good"
		}

		return "very_good"
	}
}

// Export individual classes
module.exports = {
	MedicalDataGenerator,
	IdentityManager,
	RelationshipManager,
	DataCleanupManager,
	DataValidator,
	DataUtilityFactory,
}

// Export factory instance for convenience
module.exports.createUtilityFactory = () => new DataUtilityFactory()

// Export utility functions for common operations
module.exports.utils = {
	/**
	 * Quick setup for workload modules
	 */
	setupForWorkload: (options = {}) => {
		const factory = new DataUtilityFactory()
		factory.initializeForTestRun(options)
		return {
			dataGenerator: factory.getDataGenerator(),
			identityManager: factory.getIdentityManager(),
			relationshipManager: factory.getRelationshipManager(),
		}
	},

	/**
	 * Quick cleanup for workload modules
	 */
	cleanupForWorkload: (strategy = "full") => {
		const factory = new DataUtilityFactory()
		return factory.cleanupAfterTest(strategy)
	},

	/**
	 * Quick validation for workload modules
	 */
	validateForWorkload: () => {
		const factory = new DataUtilityFactory()
		return factory.validateBeforeTest()
	},
}
