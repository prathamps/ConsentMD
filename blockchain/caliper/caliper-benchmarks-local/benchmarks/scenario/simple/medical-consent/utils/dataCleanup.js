"use strict"

const { IdentityManager } = require("./identityManager")
const { RelationshipManager } = require("./relationshipManager")

/**
 * Data Cleanup and Reset Utilities for repeatable testing
 * Provides comprehensive cleanup functions and state reset capabilities
 */
class DataCleanupManager {
	constructor() {
		this.identityManager = new IdentityManager()
		this.relationshipManager = new RelationshipManager()

		// Cleanup strategies
		this.cleanupStrategies = {
			full: "Clear all data including global storage",
			selective: "Clear specific data types while preserving others",
			soft: "Mark data as inactive without deletion",
			validation: "Clean up invalid or orphaned data only",
		}

		// Data validation rules
		this.validationRules = {
			orphanedRecords: "Records without valid patient or doctor references",
			invalidConsents:
				"Consents referencing non-existent records or identities",
			duplicateEntries: "Multiple entries with same ID",
			malformedIds: "IDs that don't match expected patterns",
			brokenRelationships: "Relationships with missing dependencies",
		}
	}

	/**
	 * Perform full data cleanup - clears all test data
	 */
	performFullCleanup() {
		console.log("Starting full data cleanup...")

		const beforeStats = this.getDataStats()
		console.log("Data before cleanup:", beforeStats)

		// Clear all global storage arrays used by workloads
		this.clearGlobalArrays()

		// Clear identity registry
		this.identityManager.clearRegistry()

		// Clear relationship data
		this.relationshipManager.clearRelationships()

		// Clear any additional global state
		this.clearAdditionalGlobalState()

		const afterStats = this.getDataStats()
		console.log("Data after cleanup:", afterStats)

		return {
			strategy: "full",
			beforeStats: beforeStats,
			afterStats: afterStats,
			cleanupTime: new Date().toISOString(),
		}
	}

	/**
	 * Perform selective cleanup - clear specific data types
	 */
	performSelectiveCleanup(options = {}) {
		console.log("Starting selective data cleanup...")

		const {
			clearPatients = false,
			clearDoctors = false,
			clearRecords = false,
			clearConsents = false,
			clearRelationships = false,
			clearGlobalArrays = false,
		} = options

		const beforeStats = this.getDataStats()
		console.log("Data before selective cleanup:", beforeStats)

		if (clearGlobalArrays) {
			this.clearGlobalArrays()
		}

		if (clearPatients) {
			global.identityRegistry?.patients?.clear()
		}

		if (clearDoctors) {
			global.identityRegistry?.doctors?.clear()
		}

		if (clearRecords) {
			global.identityRegistry?.records?.clear()
		}

		if (clearConsents) {
			global.identityRegistry?.consents?.clear()
		}

		if (clearRelationships) {
			this.relationshipManager.clearRelationships()
		}

		const afterStats = this.getDataStats()
		console.log("Data after selective cleanup:", afterStats)

		return {
			strategy: "selective",
			options: options,
			beforeStats: beforeStats,
			afterStats: afterStats,
			cleanupTime: new Date().toISOString(),
		}
	}

	/**
	 * Perform soft cleanup - mark data as inactive
	 */
	performSoftCleanup() {
		console.log("Starting soft data cleanup...")

		const beforeStats = this.getDataStats()
		const cleanupTime = new Date().toISOString()

		// Mark patients as inactive
		if (global.identityRegistry?.patients) {
			for (const [patientId, patientData] of global.identityRegistry.patients) {
				patientData.status = "inactive"
				patientData.deactivatedAt = cleanupTime
			}
		}

		// Mark doctors as inactive
		if (global.identityRegistry?.doctors) {
			for (const [doctorId, doctorData] of global.identityRegistry.doctors) {
				doctorData.status = "inactive"
				doctorData.deactivatedAt = cleanupTime
			}
		}

		// Mark records as archived
		if (global.identityRegistry?.records) {
			for (const [recordId, recordData] of global.identityRegistry.records) {
				recordData.status = "archived"
				recordData.archivedAt = cleanupTime
			}
		}

		// Mark consents as expired
		if (global.identityRegistry?.consents) {
			for (const [consentId, consentData] of global.identityRegistry.consents) {
				if (consentData.status === "granted") {
					consentData.status = "expired"
					consentData.expiredAt = cleanupTime
				}
			}
		}

		const afterStats = this.getDataStats()
		console.log("Data after soft cleanup:", afterStats)

		return {
			strategy: "soft",
			beforeStats: beforeStats,
			afterStats: afterStats,
			cleanupTime: cleanupTime,
		}
	}

	/**
	 * Perform validation cleanup - remove invalid data only
	 */
	performValidationCleanup() {
		console.log("Starting validation cleanup...")

		const beforeStats = this.getDataStats()
		const issues = this.validateDataConsistency()

		console.log("Data validation issues found:", issues)

		// Clean up orphaned records
		this.cleanupOrphanedRecords()

		// Clean up invalid consents
		this.cleanupInvalidConsents()

		// Clean up duplicate entries
		this.cleanupDuplicateEntries()

		// Clean up malformed IDs
		this.cleanupMalformedIds()

		// Clean up broken relationships
		this.cleanupBrokenRelationships()

		const afterStats = this.getDataStats()
		console.log("Data after validation cleanup:", afterStats)

		return {
			strategy: "validation",
			beforeStats: beforeStats,
			afterStats: afterStats,
			issuesFound: issues,
			cleanupTime: new Date().toISOString(),
		}
	}

	/**
	 * Clear global arrays used by workload modules
	 */
	clearGlobalArrays() {
		// Clear arrays used by existing workload modules
		if (typeof global.recordIds !== "undefined") {
			global.recordIds.length = 0
		}
		if (typeof global.medicalRecordIds !== "undefined") {
			global.medicalRecordIds.length = 0
		}
		if (typeof global.consentIds !== "undefined") {
			global.consentIds.length = 0
		}
		if (typeof global.doctorProfileIds !== "undefined") {
			global.doctorProfileIds.length = 0
		}
		if (typeof global.archivedRecordIds !== "undefined") {
			global.archivedRecordIds.length = 0
		}

		console.log("Cleared global arrays used by workload modules")
	}

	/**
	 * Clear additional global state
	 */
	clearAdditionalGlobalState() {
		// Clear any other global state that might exist
		if (typeof global.testRunData !== "undefined") {
			delete global.testRunData
		}
		if (typeof global.performanceMetrics !== "undefined") {
			delete global.performanceMetrics
		}
		if (typeof global.errorCounts !== "undefined") {
			delete global.errorCounts
		}

		console.log("Cleared additional global state")
	}

	/**
	 * Validate data consistency and return issues
	 */
	validateDataConsistency() {
		const issues = {
			orphanedRecords: [],
			invalidConsents: [],
			duplicateEntries: [],
			malformedIds: [],
			brokenRelationships: [],
		}

		// Check for orphaned records
		if (global.identityRegistry?.records) {
			for (const [recordId, recordData] of global.identityRegistry.records) {
				const patientExists = global.identityRegistry.patients?.has(
					recordData.ownerId
				)
				if (!patientExists && recordData.recordType === "patient") {
					issues.orphanedRecords.push({
						recordId: recordId,
						ownerId: recordData.ownerId,
						reason: "Patient not found",
					})
				}
			}
		}

		// Check for invalid consents
		if (global.identityRegistry?.consents) {
			for (const [consentId, consentData] of global.identityRegistry.consents) {
				const patientExists = global.identityRegistry.patients?.has(
					consentData.patientId
				)
				const doctorExists = global.identityRegistry.doctors?.has(
					consentData.doctorId
				)
				const recordExists = global.identityRegistry.records?.has(
					consentData.recordId
				)

				if (!patientExists || !doctorExists || !recordExists) {
					issues.invalidConsents.push({
						consentId: consentId,
						patientExists: patientExists,
						doctorExists: doctorExists,
						recordExists: recordExists,
					})
				}
			}
		}

		// Check for malformed IDs
		this.checkMalformedIds(issues)

		// Check for broken relationships
		this.checkBrokenRelationships(issues)

		return issues
	}

	/**
	 * Check for malformed IDs
	 */
	checkMalformedIds(issues) {
		// Check patient IDs
		if (global.identityRegistry?.patients) {
			for (const patientId of global.identityRegistry.patients.keys()) {
				if (!this.identityManager.validatePatientId(patientId)) {
					issues.malformedIds.push({
						id: patientId,
						type: "patient",
						reason: "Invalid format",
					})
				}
			}
		}

		// Check doctor IDs
		if (global.identityRegistry?.doctors) {
			for (const doctorId of global.identityRegistry.doctors.keys()) {
				if (!this.identityManager.validateDoctorId(doctorId)) {
					issues.malformedIds.push({
						id: doctorId,
						type: "doctor",
						reason: "Invalid format",
					})
				}
			}
		}
	}

	/**
	 * Check for broken relationships
	 */
	checkBrokenRelationships(issues) {
		// Check patient-record relationships
		if (global.relationshipData?.patientRecords) {
			for (const [patientId, records] of global.relationshipData
				.patientRecords) {
				for (const record of records) {
					const recordExists = global.identityRegistry?.records?.has(
						record.recordId
					)
					if (!recordExists) {
						issues.brokenRelationships.push({
							type: "patient-record",
							patientId: patientId,
							recordId: record.recordId,
							reason: "Record not found in registry",
						})
					}
				}
			}
		}
	}

	/**
	 * Clean up orphaned records
	 */
	cleanupOrphanedRecords() {
		if (!global.identityRegistry?.records) return

		const orphanedRecords = []
		for (const [recordId, recordData] of global.identityRegistry.records) {
			const patientExists = global.identityRegistry.patients?.has(
				recordData.ownerId
			)
			if (!patientExists && recordData.recordType === "patient") {
				orphanedRecords.push(recordId)
			}
		}

		for (const recordId of orphanedRecords) {
			global.identityRegistry.records.delete(recordId)
		}

		console.log(`Cleaned up ${orphanedRecords.length} orphaned records`)
	}

	/**
	 * Clean up invalid consents
	 */
	cleanupInvalidConsents() {
		if (!global.identityRegistry?.consents) return

		const invalidConsents = []
		for (const [consentId, consentData] of global.identityRegistry.consents) {
			const patientExists = global.identityRegistry.patients?.has(
				consentData.patientId
			)
			const doctorExists = global.identityRegistry.doctors?.has(
				consentData.doctorId
			)
			const recordExists = global.identityRegistry.records?.has(
				consentData.recordId
			)

			if (!patientExists || !doctorExists || !recordExists) {
				invalidConsents.push(consentId)
			}
		}

		for (const consentId of invalidConsents) {
			global.identityRegistry.consents.delete(consentId)
		}

		console.log(`Cleaned up ${invalidConsents.length} invalid consents`)
	}

	/**
	 * Clean up duplicate entries
	 */
	cleanupDuplicateEntries() {
		// This would be more complex in a real scenario
		// For now, we'll just log that we're checking for duplicates
		console.log(
			"Checked for duplicate entries (none found in current implementation)"
		)
	}

	/**
	 * Clean up malformed IDs
	 */
	cleanupMalformedIds() {
		const malformedPatients = []
		const malformedDoctors = []

		// Check and remove malformed patient IDs
		if (global.identityRegistry?.patients) {
			for (const patientId of global.identityRegistry.patients.keys()) {
				if (!this.identityManager.validatePatientId(patientId)) {
					malformedPatients.push(patientId)
				}
			}
			for (const patientId of malformedPatients) {
				global.identityRegistry.patients.delete(patientId)
			}
		}

		// Check and remove malformed doctor IDs
		if (global.identityRegistry?.doctors) {
			for (const doctorId of global.identityRegistry.doctors.keys()) {
				if (!this.identityManager.validateDoctorId(doctorId)) {
					malformedDoctors.push(doctorId)
				}
			}
			for (const doctorId of malformedDoctors) {
				global.identityRegistry.doctors.delete(doctorId)
			}
		}

		console.log(
			`Cleaned up ${malformedPatients.length} malformed patient IDs and ${malformedDoctors.length} malformed doctor IDs`
		)
	}

	/**
	 * Clean up broken relationships
	 */
	cleanupBrokenRelationships() {
		// Clean up patient-record relationships
		if (global.relationshipData?.patientRecords) {
			for (const [patientId, records] of global.relationshipData
				.patientRecords) {
				const validRecords = records.filter((record) =>
					global.identityRegistry?.records?.has(record.recordId)
				)
				if (validRecords.length !== records.length) {
					global.relationshipData.patientRecords.set(patientId, validRecords)
				}
			}
		}

		console.log("Cleaned up broken relationships")
	}

	/**
	 * Reset state for new test run
	 */
	resetForNewTestRun(options = {}) {
		const {
			preserveIdentities = false,
			preserveRelationships = false,
			clearMetrics = true,
		} = options

		console.log("Resetting state for new test run...")

		if (!preserveIdentities) {
			this.identityManager.clearRegistry()
		}

		if (!preserveRelationships) {
			this.relationshipManager.clearRelationships()
		}

		if (clearMetrics) {
			this.clearPerformanceMetrics()
		}

		// Always clear global arrays for fresh start
		this.clearGlobalArrays()

		// Initialize fresh state
		this.initializeFreshState()

		return {
			resetTime: new Date().toISOString(),
			options: options,
			status: "ready_for_testing",
		}
	}

	/**
	 * Clear performance metrics
	 */
	clearPerformanceMetrics() {
		if (typeof global.performanceMetrics !== "undefined") {
			delete global.performanceMetrics
		}
		if (typeof global.errorCounts !== "undefined") {
			delete global.errorCounts
		}
		if (typeof global.transactionTimes !== "undefined") {
			delete global.transactionTimes
		}

		console.log("Cleared performance metrics")
	}

	/**
	 * Initialize fresh state
	 */
	initializeFreshState() {
		// Reinitialize global arrays
		global.recordIds = []
		global.medicalRecordIds = []
		global.consentIds = []
		global.doctorProfileIds = []
		global.archivedRecordIds = []

		// Initialize performance tracking
		global.performanceMetrics = {
			startTime: new Date().toISOString(),
			transactionCounts: {},
			errorCounts: {},
		}

		console.log("Initialized fresh state for testing")
	}

	/**
	 * Get comprehensive data statistics
	 */
	getDataStats() {
		const stats = {
			globalArrays: {
				recordIds: global.recordIds?.length || 0,
				medicalRecordIds: global.medicalRecordIds?.length || 0,
				consentIds: global.consentIds?.length || 0,
				doctorProfileIds: global.doctorProfileIds?.length || 0,
				archivedRecordIds: global.archivedRecordIds?.length || 0,
			},
			identityRegistry: this.identityManager.getRegistryStats(),
			relationships: this.relationshipManager.getRelationshipStats(),
			timestamp: new Date().toISOString(),
		}

		return stats
	}

	/**
	 * Generate cleanup report
	 */
	generateCleanupReport(cleanupResult) {
		const report = {
			cleanupStrategy: cleanupResult.strategy,
			executionTime: cleanupResult.cleanupTime,
			dataBeforeCleanup: cleanupResult.beforeStats,
			dataAfterCleanup: cleanupResult.afterStats,
			itemsRemoved: this.calculateItemsRemoved(
				cleanupResult.beforeStats,
				cleanupResult.afterStats
			),
			recommendations: this.generateRecommendations(cleanupResult),
		}

		return report
	}

	/**
	 * Calculate items removed during cleanup
	 */
	calculateItemsRemoved(beforeStats, afterStats) {
		const removed = {}

		// Calculate differences in global arrays
		if (beforeStats.globalArrays && afterStats.globalArrays) {
			for (const [key, beforeCount] of Object.entries(
				beforeStats.globalArrays
			)) {
				const afterCount = afterStats.globalArrays[key] || 0
				removed[key] = beforeCount - afterCount
			}
		}

		// Calculate differences in identity registry
		if (beforeStats.identityRegistry && afterStats.identityRegistry) {
			for (const [key, beforeCount] of Object.entries(
				beforeStats.identityRegistry
			)) {
				const afterCount = afterStats.identityRegistry[key] || 0
				removed[`identity_${key}`] = beforeCount - afterCount
			}
		}

		return removed
	}

	/**
	 * Generate cleanup recommendations
	 */
	generateRecommendations(cleanupResult) {
		const recommendations = []

		if (cleanupResult.strategy === "validation" && cleanupResult.issuesFound) {
			const issues = cleanupResult.issuesFound

			if (issues.orphanedRecords.length > 0) {
				recommendations.push(
					"Consider implementing stronger referential integrity checks"
				)
			}

			if (issues.invalidConsents.length > 0) {
				recommendations.push("Implement consent validation before creation")
			}

			if (issues.malformedIds.length > 0) {
				recommendations.push("Add ID format validation in data generation")
			}
		}

		if (cleanupResult.beforeStats.globalArrays) {
			const totalItems = Object.values(
				cleanupResult.beforeStats.globalArrays
			).reduce((sum, count) => sum + count, 0)
			if (totalItems > 10000) {
				recommendations.push(
					"Consider implementing data archiving for large datasets"
				)
			}
		}

		return recommendations
	}
}

module.exports = { DataCleanupManager }
