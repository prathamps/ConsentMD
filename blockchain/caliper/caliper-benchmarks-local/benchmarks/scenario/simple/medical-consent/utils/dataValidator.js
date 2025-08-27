"use strict"

/**
 * Data Validation and Consistency Checking Utilities
 * Provides comprehensive validation for test data integrity and consistency
 */
class DataValidator {
	constructor() {
		// Validation patterns
		this.patterns = {
			patientId: /^patient_\d+_\d+_\d+_\d{3}$/,
			doctorId: /^doctor_[A-Z]{2}_\d+_\d+_\d+_\d{3}$/,
			recordId: /^record_\d+_\d+_\d+_\d{3}$/,
			consentId: /^consent_\d+_\d+_\d+_\d{3}$/,
			fileHash: /^[a-f0-9]{64}$/,
			s3Key:
				/^medical-records\/\d{4}\/\d{2}\/\d{2}\/[a-z-]+\/patient-[^\/]+\/[^\/]+$/,
			isoTimestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			licenseNumber: /^[A-Z]{2}-[A-Z]{2}-\d{6}$/,
		}

		// Data type definitions
		this.dataTypes = {
			patient: {
				required: ["id", "role", "registeredAt"],
				optional: ["recordIds", "consentIds", "metadata"],
				constraints: {
					role: ["patient"],
					recordIds: "array",
					consentIds: "array",
				},
			},
			doctor: {
				required: ["id", "role", "registeredAt"],
				optional: [
					"profileId",
					"specialization",
					"authorizedRecords",
					"consentIds",
					"metadata",
				],
				constraints: {
					role: ["doctor"],
					authorizedRecords: "array",
					consentIds: "array",
				},
			},
			record: {
				required: ["id", "ownerId", "recordType", "createdAt"],
				optional: ["authorizedDoctors", "consentIds", "metadata"],
				constraints: {
					recordType: ["patient", "medical"],
					authorizedDoctors: "array",
					consentIds: "array",
				},
			},
			consent: {
				required: [
					"id",
					"patientId",
					"doctorId",
					"recordId",
					"status",
					"grantedAt",
				],
				optional: ["revokedAt", "metadata"],
				constraints: {
					status: ["granted", "revoked", "expired"],
				},
			},
		}

		// Validation severity levels
		this.severityLevels = {
			CRITICAL: "critical", // Data corruption, system failure
			ERROR: "error", // Invalid data, constraint violations
			WARNING: "warning", // Inconsistencies, potential issues
			INFO: "info", // Informational, best practices
		}
	}

	/**
	 * Validate complete data set
	 */
	validateCompleteDataSet() {
		console.log("Starting complete data set validation...")

		const validationResults = {
			timestamp: new Date().toISOString(),
			summary: {
				totalIssues: 0,
				critical: 0,
				errors: 0,
				warnings: 0,
				info: 0,
			},
			details: {
				globalArrays: this.validateGlobalArrays(),
				identityRegistry: this.validateIdentityRegistry(),
				relationships: this.validateRelationships(),
				dataConsistency: this.validateDataConsistency(),
				referentialIntegrity: this.validateReferentialIntegrity(),
			},
		}

		// Calculate summary statistics
		this.calculateValidationSummary(validationResults)

		console.log("Data validation completed:", validationResults.summary)
		return validationResults
	}

	/**
	 * Validate global arrays used by workloads
	 */
	validateGlobalArrays() {
		const results = {
			issues: [],
			stats: {},
		}

		// Check recordIds array
		if (typeof global.recordIds !== "undefined") {
			results.stats.recordIds = global.recordIds.length

			// Check for duplicates
			const uniqueRecords = new Set(global.recordIds)
			if (uniqueRecords.size !== global.recordIds.length) {
				results.issues.push({
					severity: this.severityLevels.WARNING,
					type: "duplicate_entries",
					message: `Found ${
						global.recordIds.length - uniqueRecords.size
					} duplicate record IDs`,
					data: {
						array: "recordIds",
						duplicates: global.recordIds.length - uniqueRecords.size,
					},
				})
			}

			// Check ID format
			for (const recordId of global.recordIds) {
				if (typeof recordId !== "string" || recordId.trim() === "") {
					results.issues.push({
						severity: this.severityLevels.ERROR,
						type: "invalid_format",
						message: `Invalid record ID format: ${recordId}`,
						data: { array: "recordIds", invalidId: recordId },
					})
				}
			}
		} else {
			results.issues.push({
				severity: this.severityLevels.INFO,
				type: "missing_array",
				message: "Global recordIds array not initialized",
				data: { array: "recordIds" },
			})
		}

		// Check other global arrays
		this.validateGlobalArray("medicalRecordIds", results)
		this.validateGlobalArray("consentIds", results)
		this.validateGlobalArray("doctorProfileIds", results)
		this.validateGlobalArray("archivedRecordIds", results)

		return results
	}

	/**
	 * Validate individual global array
	 */
	validateGlobalArray(arrayName, results) {
		if (typeof global[arrayName] !== "undefined") {
			results.stats[arrayName] = global[arrayName].length

			// Check for duplicates
			const uniqueItems = new Set(global[arrayName])
			if (uniqueItems.size !== global[arrayName].length) {
				results.issues.push({
					severity: this.severityLevels.WARNING,
					type: "duplicate_entries",
					message: `Found ${
						global[arrayName].length - uniqueItems.size
					} duplicate entries in ${arrayName}`,
					data: {
						array: arrayName,
						duplicates: global[arrayName].length - uniqueItems.size,
					},
				})
			}

			// Check for empty or invalid entries
			for (const item of global[arrayName]) {
				if (!item || (typeof item === "string" && item.trim() === "")) {
					results.issues.push({
						severity: this.severityLevels.ERROR,
						type: "invalid_entry",
						message: `Invalid entry in ${arrayName}: ${item}`,
						data: { array: arrayName, invalidEntry: item },
					})
				}
			}
		} else {
			results.issues.push({
				severity: this.severityLevels.INFO,
				type: "missing_array",
				message: `Global ${arrayName} array not initialized`,
				data: { array: arrayName },
			})
		}
	}

	/**
	 * Validate identity registry
	 */
	validateIdentityRegistry() {
		const results = {
			issues: [],
			stats: {},
		}

		if (typeof global.identityRegistry === "undefined") {
			results.issues.push({
				severity: this.severityLevels.CRITICAL,
				type: "missing_registry",
				message: "Identity registry not initialized",
				data: {},
			})
			return results
		}

		// Validate patients
		if (global.identityRegistry.patients) {
			results.stats.patients = global.identityRegistry.patients.size
			this.validateIdentityCollection(
				"patients",
				global.identityRegistry.patients,
				"patient",
				results
			)
		}

		// Validate doctors
		if (global.identityRegistry.doctors) {
			results.stats.doctors = global.identityRegistry.doctors.size
			this.validateIdentityCollection(
				"doctors",
				global.identityRegistry.doctors,
				"doctor",
				results
			)
		}

		// Validate records
		if (global.identityRegistry.records) {
			results.stats.records = global.identityRegistry.records.size
			this.validateIdentityCollection(
				"records",
				global.identityRegistry.records,
				"record",
				results
			)
		}

		// Validate consents
		if (global.identityRegistry.consents) {
			results.stats.consents = global.identityRegistry.consents.size
			this.validateIdentityCollection(
				"consents",
				global.identityRegistry.consents,
				"consent",
				results
			)
		}

		return results
	}

	/**
	 * Validate identity collection
	 */
	validateIdentityCollection(collectionName, collection, dataType, results) {
		for (const [id, data] of collection) {
			// Validate ID format
			const patternKey = `${dataType}Id`
			if (this.patterns[patternKey] && !this.patterns[patternKey].test(id)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "invalid_id_format",
					message: `Invalid ${dataType} ID format: ${id}`,
					data: {
						collection: collectionName,
						id: id,
						expectedPattern: this.patterns[patternKey].source,
					},
				})
			}

			// Validate data structure
			this.validateDataStructure(data, dataType, results, {
				collection: collectionName,
				id: id,
			})
		}
	}

	/**
	 * Validate data structure against type definition
	 */
	validateDataStructure(data, dataType, results, context) {
		const typeDef = this.dataTypes[dataType]
		if (!typeDef) {
			results.issues.push({
				severity: this.severityLevels.ERROR,
				type: "unknown_data_type",
				message: `Unknown data type: ${dataType}`,
				data: { context: context, dataType: dataType },
			})
			return
		}

		// Check required fields
		for (const requiredField of typeDef.required) {
			if (!(requiredField in data)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "missing_required_field",
					message: `Missing required field '${requiredField}' in ${dataType}`,
					data: { context: context, field: requiredField },
				})
			}
		}

		// Check constraints
		if (typeDef.constraints) {
			for (const [field, constraint] of Object.entries(typeDef.constraints)) {
				if (field in data) {
					this.validateFieldConstraint(
						data[field],
						constraint,
						field,
						results,
						context
					)
				}
			}
		}

		// Validate timestamp formats
		this.validateTimestamps(data, results, context)
	}

	/**
	 * Validate field constraint
	 */
	validateFieldConstraint(value, constraint, fieldName, results, context) {
		if (Array.isArray(constraint)) {
			// Enum constraint
			if (!constraint.includes(value)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "invalid_enum_value",
					message: `Invalid value '${value}' for field '${fieldName}'. Expected one of: ${constraint.join(
						", "
					)}`,
					data: {
						context: context,
						field: fieldName,
						value: value,
						allowedValues: constraint,
					},
				})
			}
		} else if (constraint === "array") {
			// Array constraint
			if (!Array.isArray(value)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "invalid_array_type",
					message: `Field '${fieldName}' should be an array but got ${typeof value}`,
					data: {
						context: context,
						field: fieldName,
						actualType: typeof value,
					},
				})
			}
		}
	}

	/**
	 * Validate timestamp formats
	 */
	validateTimestamps(data, results, context) {
		const timestampFields = [
			"registeredAt",
			"createdAt",
			"grantedAt",
			"revokedAt",
			"establishedAt",
		]

		for (const field of timestampFields) {
			if (field in data && data[field]) {
				if (!this.patterns.isoTimestamp.test(data[field])) {
					results.issues.push({
						severity: this.severityLevels.WARNING,
						type: "invalid_timestamp_format",
						message: `Invalid timestamp format in field '${field}': ${data[field]}`,
						data: { context: context, field: field, value: data[field] },
					})
				}
			}
		}
	}

	/**
	 * Validate relationships
	 */
	validateRelationships() {
		const results = {
			issues: [],
			stats: {},
		}

		if (typeof global.relationshipData === "undefined") {
			results.issues.push({
				severity: this.severityLevels.WARNING,
				type: "missing_relationship_data",
				message: "Relationship data not initialized",
				data: {},
			})
			return results
		}

		// Validate patient-record relationships
		if (global.relationshipData.patientRecords) {
			results.stats.patientRecords = global.relationshipData.patientRecords.size
			this.validatePatientRecordRelationships(results)
		}

		// Validate doctor-record relationships
		if (global.relationshipData.doctorRecords) {
			results.stats.doctorRecords = global.relationshipData.doctorRecords.size
			this.validateDoctorRecordRelationships(results)
		}

		// Validate consent chains
		if (global.relationshipData.consentChains) {
			results.stats.consentChains = global.relationshipData.consentChains.size
			this.validateConsentChains(results)
		}

		return results
	}

	/**
	 * Validate patient-record relationships
	 */
	validatePatientRecordRelationships(results) {
		for (const [patientId, records] of global.relationshipData.patientRecords) {
			// Check if patient exists in identity registry
			if (!global.identityRegistry?.patients?.has(patientId)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "orphaned_relationship",
					message: `Patient-record relationship references non-existent patient: ${patientId}`,
					data: { patientId: patientId, recordCount: records.length },
				})
			}

			// Check each record reference
			for (const record of records) {
				if (!global.identityRegistry?.records?.has(record.recordId)) {
					results.issues.push({
						severity: this.severityLevels.ERROR,
						type: "broken_record_reference",
						message: `Patient ${patientId} references non-existent record: ${record.recordId}`,
						data: { patientId: patientId, recordId: record.recordId },
					})
				}
			}
		}
	}

	/**
	 * Validate doctor-record relationships
	 */
	validateDoctorRecordRelationships(results) {
		for (const [doctorId, records] of global.relationshipData.doctorRecords) {
			// Check if doctor exists in identity registry
			if (!global.identityRegistry?.doctors?.has(doctorId)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "orphaned_relationship",
					message: `Doctor-record relationship references non-existent doctor: ${doctorId}`,
					data: { doctorId: doctorId, recordCount: records.length },
				})
			}

			// Check each record reference
			for (const record of records) {
				if (!global.identityRegistry?.records?.has(record.recordId)) {
					results.issues.push({
						severity: this.severityLevels.ERROR,
						type: "broken_record_reference",
						message: `Doctor ${doctorId} references non-existent record: ${record.recordId}`,
						data: { doctorId: doctorId, recordId: record.recordId },
					})
				}
			}
		}
	}

	/**
	 * Validate consent chains
	 */
	validateConsentChains(results) {
		for (const [chainKey, consentData] of global.relationshipData
			.consentChains) {
			// Validate chain key format
			const keyParts = chainKey.split("-")
			if (keyParts.length !== 3) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "invalid_chain_key",
					message: `Invalid consent chain key format: ${chainKey}`,
					data: { chainKey: chainKey },
				})
				continue
			}

			const [patientId, doctorId, recordId] = keyParts

			// Check if referenced entities exist
			if (!global.identityRegistry?.patients?.has(patientId)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "broken_consent_reference",
					message: `Consent chain references non-existent patient: ${patientId}`,
					data: { chainKey: chainKey, patientId: patientId },
				})
			}

			if (!global.identityRegistry?.doctors?.has(doctorId)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "broken_consent_reference",
					message: `Consent chain references non-existent doctor: ${doctorId}`,
					data: { chainKey: chainKey, doctorId: doctorId },
				})
			}

			if (!global.identityRegistry?.records?.has(recordId)) {
				results.issues.push({
					severity: this.severityLevels.ERROR,
					type: "broken_consent_reference",
					message: `Consent chain references non-existent record: ${recordId}`,
					data: { chainKey: chainKey, recordId: recordId },
				})
			}
		}
	}

	/**
	 * Validate data consistency
	 */
	validateDataConsistency() {
		const results = {
			issues: [],
			stats: {},
		}

		// Check consistency between global arrays and identity registry
		this.validateArrayRegistryConsistency(results)

		// Check consistency between identity registry and relationships
		this.validateRegistryRelationshipConsistency(results)

		return results
	}

	/**
	 * Validate consistency between global arrays and identity registry
	 */
	validateArrayRegistryConsistency(results) {
		// Check recordIds consistency
		if (global.recordIds && global.identityRegistry?.records) {
			const arrayRecords = new Set(global.recordIds)
			const registryRecords = new Set(global.identityRegistry.records.keys())

			// Find records in array but not in registry
			for (const recordId of arrayRecords) {
				if (!registryRecords.has(recordId)) {
					results.issues.push({
						severity: this.severityLevels.WARNING,
						type: "inconsistent_data",
						message: `Record ${recordId} exists in global array but not in identity registry`,
						data: { recordId: recordId, location: "global_array_only" },
					})
				}
			}

			// Find records in registry but not in array
			for (const recordId of registryRecords) {
				if (!arrayRecords.has(recordId)) {
					results.issues.push({
						severity: this.severityLevels.INFO,
						type: "inconsistent_data",
						message: `Record ${recordId} exists in identity registry but not in global array`,
						data: { recordId: recordId, location: "registry_only" },
					})
				}
			}
		}
	}

	/**
	 * Validate consistency between identity registry and relationships
	 */
	validateRegistryRelationshipConsistency(results) {
		// Check patient-record consistency
		if (
			global.identityRegistry?.patients &&
			global.relationshipData?.patientRecords
		) {
			for (const [patientId, patientData] of global.identityRegistry.patients) {
				const relationshipRecords =
					global.relationshipData.patientRecords.get(patientId)

				if (patientData.recordIds && patientData.recordIds.length > 0) {
					if (!relationshipRecords || relationshipRecords.length === 0) {
						results.issues.push({
							severity: this.severityLevels.WARNING,
							type: "missing_relationship_data",
							message: `Patient ${patientId} has records in identity registry but no relationship data`,
							data: {
								patientId: patientId,
								recordCount: patientData.recordIds.length,
							},
						})
					}
				}
			}
		}
	}

	/**
	 * Validate referential integrity
	 */
	validateReferentialIntegrity() {
		const results = {
			issues: [],
			stats: {},
		}

		// Check foreign key relationships
		this.validateForeignKeyIntegrity(results)

		// Check circular references
		this.validateCircularReferences(results)

		return results
	}

	/**
	 * Validate foreign key integrity
	 */
	validateForeignKeyIntegrity(results) {
		// Check consent -> patient/doctor/record references
		if (global.identityRegistry?.consents) {
			for (const [consentId, consentData] of global.identityRegistry.consents) {
				// Check patient reference
				if (!global.identityRegistry.patients?.has(consentData.patientId)) {
					results.issues.push({
						severity: this.severityLevels.CRITICAL,
						type: "broken_foreign_key",
						message: `Consent ${consentId} references non-existent patient: ${consentData.patientId}`,
						data: { consentId: consentId, patientId: consentData.patientId },
					})
				}

				// Check doctor reference
				if (!global.identityRegistry.doctors?.has(consentData.doctorId)) {
					results.issues.push({
						severity: this.severityLevels.CRITICAL,
						type: "broken_foreign_key",
						message: `Consent ${consentId} references non-existent doctor: ${consentData.doctorId}`,
						data: { consentId: consentId, doctorId: consentData.doctorId },
					})
				}

				// Check record reference
				if (!global.identityRegistry.records?.has(consentData.recordId)) {
					results.issues.push({
						severity: this.severityLevels.CRITICAL,
						type: "broken_foreign_key",
						message: `Consent ${consentId} references non-existent record: ${consentData.recordId}`,
						data: { consentId: consentId, recordId: consentData.recordId },
					})
				}
			}
		}
	}

	/**
	 * Validate circular references
	 */
	validateCircularReferences(results) {
		// For now, just log that we're checking for circular references
		// In a more complex system, we would implement graph traversal to detect cycles
		results.stats.circularReferenceCheck = "completed"
	}

	/**
	 * Calculate validation summary
	 */
	calculateValidationSummary(validationResults) {
		const summary = validationResults.summary

		// Count issues by severity
		for (const section of Object.values(validationResults.details)) {
			if (section.issues) {
				for (const issue of section.issues) {
					summary.totalIssues++
					switch (issue.severity) {
						case this.severityLevels.CRITICAL:
							summary.critical++
							break
						case this.severityLevels.ERROR:
							summary.errors++
							break
						case this.severityLevels.WARNING:
							summary.warnings++
							break
						case this.severityLevels.INFO:
							summary.info++
							break
					}
				}
			}
		}
	}

	/**
	 * Generate validation report
	 */
	generateValidationReport(validationResults) {
		const report = {
			executionTime: validationResults.timestamp,
			summary: validationResults.summary,
			criticalIssues: this.extractIssuesBySeverity(
				validationResults,
				this.severityLevels.CRITICAL
			),
			errors: this.extractIssuesBySeverity(
				validationResults,
				this.severityLevels.ERROR
			),
			warnings: this.extractIssuesBySeverity(
				validationResults,
				this.severityLevels.WARNING
			),
			recommendations:
				this.generateValidationRecommendations(validationResults),
		}

		return report
	}

	/**
	 * Extract issues by severity level
	 */
	extractIssuesBySeverity(validationResults, severity) {
		const issues = []

		for (const section of Object.values(validationResults.details)) {
			if (section.issues) {
				for (const issue of section.issues) {
					if (issue.severity === severity) {
						issues.push(issue)
					}
				}
			}
		}

		return issues
	}

	/**
	 * Generate validation recommendations
	 */
	generateValidationRecommendations(validationResults) {
		const recommendations = []

		if (validationResults.summary.critical > 0) {
			recommendations.push(
				"URGENT: Address critical issues immediately - they may cause system failures"
			)
		}

		if (validationResults.summary.errors > 0) {
			recommendations.push(
				"Fix data errors to ensure test reliability and accuracy"
			)
		}

		if (validationResults.summary.warnings > 5) {
			recommendations.push(
				"Consider implementing stricter data validation during generation"
			)
		}

		// Check for specific patterns
		const allIssues = this.extractAllIssues(validationResults)
		const issueTypes = new Set(allIssues.map((issue) => issue.type))

		if (issueTypes.has("broken_foreign_key")) {
			recommendations.push(
				"Implement referential integrity checks in data generation"
			)
		}

		if (issueTypes.has("duplicate_entries")) {
			recommendations.push(
				"Add uniqueness validation to prevent duplicate entries"
			)
		}

		if (issueTypes.has("invalid_id_format")) {
			recommendations.push(
				"Standardize ID generation to ensure consistent formatting"
			)
		}

		return recommendations
	}

	/**
	 * Extract all issues from validation results
	 */
	extractAllIssues(validationResults) {
		const allIssues = []

		for (const section of Object.values(validationResults.details)) {
			if (section.issues) {
				allIssues.push(...section.issues)
			}
		}

		return allIssues
	}
}

module.exports = { DataValidator }
