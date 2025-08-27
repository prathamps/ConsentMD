"use strict"

const crypto = require("crypto")

/**
 * Comprehensive data generation utilities for medical consent blockchain benchmarking
 * Provides realistic test data with proper medical terminology and referential integrity
 */
class MedicalDataGenerator {
	constructor() {
		// Medical file types with realistic extensions
		this.medicalFileTypes = [
			{ type: "medical-report", extensions: ["pdf", "doc", "docx"] },
			{ type: "lab-results", extensions: ["pdf", "csv", "xlsx"] },
			{ type: "x-ray-scan", extensions: ["jpg", "png", "dcm"] },
			{ type: "mri-scan", extensions: ["dcm", "jpg", "png"] },
			{ type: "ct-scan", extensions: ["dcm", "jpg", "png"] },
			{ type: "blood-test", extensions: ["pdf", "csv"] },
			{ type: "consultation-notes", extensions: ["pdf", "doc", "txt"] },
			{ type: "prescription", extensions: ["pdf", "jpg", "png"] },
			{ type: "discharge-summary", extensions: ["pdf", "doc"] },
			{ type: "surgical-report", extensions: ["pdf", "doc"] },
			{ type: "pathology-report", extensions: ["pdf", "doc"] },
			{ type: "ecg-report", extensions: ["pdf", "jpg", "png"] },
			{ type: "ultrasound-scan", extensions: ["jpg", "png", "dcm"] },
			{ type: "biopsy-results", extensions: ["pdf", "doc"] },
			{ type: "allergy-test", extensions: ["pdf", "csv"] },
			{ type: "vaccination-record", extensions: ["pdf", "jpg"] },
		]

		// Medical conditions with ICD-10 codes
		this.medicalConditions = [
			{ condition: "hypertension", icd10: "I10", severity: "moderate" },
			{ condition: "diabetes-type-2", icd10: "E11", severity: "chronic" },
			{ condition: "asthma", icd10: "J45", severity: "mild" },
			{ condition: "arthritis", icd10: "M19", severity: "moderate" },
			{ condition: "migraine", icd10: "G43", severity: "episodic" },
			{ condition: "allergic-reaction", icd10: "T78", severity: "acute" },
			{ condition: "chest-pain", icd10: "R06", severity: "acute" },
			{ condition: "back-pain", icd10: "M54", severity: "chronic" },
			{ condition: "anxiety-disorder", icd10: "F41", severity: "moderate" },
			{ condition: "depression", icd10: "F32", severity: "moderate" },
			{ condition: "pneumonia", icd10: "J18", severity: "acute" },
			{ condition: "bronchitis", icd10: "J40", severity: "acute" },
			{ condition: "gastritis", icd10: "K29", severity: "mild" },
			{ condition: "dermatitis", icd10: "L30", severity: "mild" },
			{ condition: "sinusitis", icd10: "J32", severity: "acute" },
		]

		// Doctor specializations with board certifications
		this.doctorSpecializations = [
			{ specialty: "Cardiology", board: "ABIM", code: "CV" },
			{ specialty: "Neurology", board: "ABPN", code: "NE" },
			{ specialty: "Oncology", board: "ABIM", code: "ON" },
			{ specialty: "Pediatrics", board: "ABP", code: "PD" },
			{ specialty: "Orthopedics", board: "ABOS", code: "OR" },
			{ specialty: "Dermatology", board: "ABD", code: "DE" },
			{ specialty: "Psychiatry", board: "ABPN", code: "PS" },
			{ specialty: "Radiology", board: "ABR", code: "RA" },
			{ specialty: "Emergency Medicine", board: "ABEM", code: "EM" },
			{ specialty: "Internal Medicine", board: "ABIM", code: "IM" },
			{ specialty: "General Surgery", board: "ABS", code: "GS" },
			{ specialty: "Anesthesiology", board: "ABA", code: "AN" },
			{ specialty: "Pathology", board: "ABPath", code: "PA" },
			{ specialty: "Gastroenterology", board: "ABIM", code: "GI" },
			{ specialty: "Pulmonology", board: "ABIM", code: "PU" },
			{ specialty: "Endocrinology", board: "ABIM", code: "EN" },
		]

		// Realistic names for test data
		this.firstNames = [
			"John",
			"Jane",
			"Michael",
			"Sarah",
			"David",
			"Emily",
			"Robert",
			"Lisa",
			"James",
			"Maria",
			"William",
			"Jennifer",
			"Richard",
			"Patricia",
			"Charles",
			"Linda",
			"Thomas",
			"Barbara",
			"Christopher",
			"Susan",
			"Daniel",
			"Jessica",
			"Matthew",
			"Karen",
			"Anthony",
			"Nancy",
			"Mark",
			"Betty",
			"Donald",
			"Helen",
		]

		this.lastNames = [
			"Smith",
			"Johnson",
			"Williams",
			"Brown",
			"Jones",
			"Garcia",
			"Miller",
			"Davis",
			"Rodriguez",
			"Martinez",
			"Hernandez",
			"Lopez",
			"Gonzalez",
			"Wilson",
			"Anderson",
			"Thomas",
			"Taylor",
			"Moore",
			"Jackson",
			"Martin",
			"Lee",
			"Perez",
			"Thompson",
			"White",
			"Harris",
			"Sanchez",
			"Clark",
			"Ramirez",
			"Lewis",
			"Robinson",
			"Walker",
			"Young",
			"Allen",
			"King",
		]

		// Consent reasons with medical context
		this.consentReasons = [
			{ reason: "routine-checkup", urgency: "routine", duration: "30-days" },
			{
				reason: "specialist-consultation",
				urgency: "scheduled",
				duration: "60-days",
			},
			{
				reason: "emergency-treatment",
				urgency: "immediate",
				duration: "24-hours",
			},
			{ reason: "second-opinion", urgency: "scheduled", duration: "90-days" },
			{ reason: "follow-up-care", urgency: "routine", duration: "30-days" },
			{
				reason: "diagnostic-review",
				urgency: "scheduled",
				duration: "45-days",
			},
			{
				reason: "treatment-planning",
				urgency: "scheduled",
				duration: "60-days",
			},
			{
				reason: "surgical-consultation",
				urgency: "scheduled",
				duration: "90-days",
			},
			{ reason: "medication-review", urgency: "routine", duration: "30-days" },
			{
				reason: "therapy-assessment",
				urgency: "scheduled",
				duration: "60-days",
			},
		]

		// Medical departments for realistic S3 key organization
		this.medicalDepartments = [
			"cardiology",
			"neurology",
			"oncology",
			"pediatrics",
			"orthopedics",
			"dermatology",
			"psychiatry",
			"radiology",
			"emergency",
			"internal-medicine",
			"surgery",
			"anesthesiology",
			"pathology",
			"gastroenterology",
			"pulmonology",
		]
	}

	/**
	 * Generate unique patient ID with proper formatting
	 */
	generatePatientId(workerIndex, txIndex, prefix = "patient") {
		const timestamp = Date.now()
		const random = Math.floor(Math.random() * 1000)
			.toString()
			.padStart(3, "0")
		return `${prefix}_${workerIndex}_${txIndex}_${timestamp}_${random}`
	}

	/**
	 * Generate unique doctor ID with specialty context
	 */
	generateDoctorId(workerIndex, txIndex, specialtyCode = null) {
		const specialty = specialtyCode || this.getRandomSpecialty().code
		const timestamp = Date.now()
		const random = Math.floor(Math.random() * 1000)
			.toString()
			.padStart(3, "0")
		return `doctor_${specialty}_${workerIndex}_${txIndex}_${timestamp}_${random}`
	}

	/**
	 * Generate realistic medical file name with proper structure
	 */
	generateMedicalFileName(patientId, fileTypeOverride = null) {
		const fileTypeData = fileTypeOverride || this.getRandomFileType()
		const timestamp = new Date().toISOString().split("T")[0] // YYYY-MM-DD
		const timeComponent = new Date()
			.toTimeString()
			.split(" ")[0]
			.replace(/:/g, "")
		const extension = this.getRandomExtension(fileTypeData.extensions)

		return `${fileTypeData.type}-${patientId}-${timestamp}-${timeComponent}.${extension}`
	}

	/**
	 * Generate realistic S3 object key with proper hierarchical structure
	 */
	generateS3ObjectKey(patientId, fileName, department = null) {
		const year = new Date().getFullYear()
		const month = String(new Date().getMonth() + 1).padStart(2, "0")
		const day = String(new Date().getDate()).padStart(2, "0")
		const dept = department || this.getRandomDepartment()

		return `medical-records/${year}/${month}/${day}/${dept}/patient-${patientId}/${fileName}`
	}

	/**
	 * Generate SHA256 hash for file content simulation
	 */
	generateFileHash(fileName, patientId, additionalData = "") {
		const content = `${fileName}-${patientId}-${Date.now()}-${Math.random()}-${additionalData}`
		return crypto.createHash("sha256").update(content).digest("hex")
	}

	/**
	 * Generate realistic medical record details with proper terminology
	 */
	generateMedicalDetails(patientId, conditionOverride = null) {
		const conditionData = conditionOverride || this.getRandomCondition()
		const timestamp = new Date().toISOString()

		const detailTemplates = [
			`Patient ${patientId} presented with symptoms consistent with ${conditionData.condition} (ICD-10: ${conditionData.icd10}). Severity assessed as ${conditionData.severity}. Initial evaluation completed on ${timestamp}.`,
			`Follow-up consultation for patient ${patientId} regarding ongoing ${conditionData.condition} management. Current status: ${conditionData.severity}. Treatment plan reviewed and updated.`,
			`Diagnostic assessment for patient ${patientId} reveals findings indicative of ${conditionData.condition}. Clinical severity: ${conditionData.severity}. Further monitoring recommended.`,
			`Treatment response evaluation for patient ${patientId} with diagnosed ${conditionData.condition}. Current severity level: ${conditionData.severity}. Therapeutic adjustments made.`,
			`Emergency consultation for patient ${patientId} presenting acute exacerbation of ${conditionData.condition}. Immediate intervention required. Severity: ${conditionData.severity}.`,
		]

		return detailTemplates[Math.floor(Math.random() * detailTemplates.length)]
	}

	/**
	 * Generate realistic doctor profile data
	 */
	generateDoctorProfile(workerIndex, txIndex) {
		const firstName = this.getRandomFirstName()
		const lastName = this.getRandomLastName()
		const specialization = this.getRandomSpecialization()
		const licenseNumber = this.generateLicenseNumber(specialization.code)
		const yearsExperience = Math.floor(Math.random() * 30) + 1

		return {
			name: `Dr. ${firstName} ${lastName}`,
			specialization: specialization.specialty,
			board: specialization.board,
			licenseNumber: licenseNumber,
			yearsExperience: yearsExperience,
			registeredAt: new Date().toISOString(),
		}
	}

	/**
	 * Generate realistic consent scenario data
	 */
	generateConsentScenario(patientId, doctorId, recordId) {
		const reasonData = this.getRandomConsentReason()
		const expirationDate = this.calculateExpirationDate(reasonData.duration)

		return {
			patientId: patientId,
			doctorId: doctorId,
			recordId: recordId,
			reason: reasonData.reason,
			urgency: reasonData.urgency,
			duration: reasonData.duration,
			expirationDate: expirationDate,
			grantedAt: new Date().toISOString(),
			scenario: `Patient ${patientId} granting consent to ${doctorId} for ${reasonData.reason} (${reasonData.urgency} priority)`,
		}
	}

	/**
	 * Generate private note content for PDC testing
	 */
	generatePrivateNote(patientId, doctorId) {
		const noteTypes = [
			"confidential-assessment",
			"sensitive-diagnosis",
			"family-history",
			"psychological-evaluation",
			"substance-abuse-history",
			"genetic-information",
		]

		const noteType = noteTypes[Math.floor(Math.random() * noteTypes.length)]
		const timestamp = new Date().toISOString()

		return {
			noteType: noteType,
			content: `Private medical note for patient ${patientId} - ${noteType}. Confidential information recorded by ${doctorId} on ${timestamp}. This information requires special privacy protection.`,
			sensitivity: "high",
			accessLevel: "doctor-only",
			createdAt: timestamp,
		}
	}

	// Helper methods for random selection
	getRandomFileType() {
		return this.medicalFileTypes[
			Math.floor(Math.random() * this.medicalFileTypes.length)
		]
	}

	getRandomExtension(extensions) {
		return extensions[Math.floor(Math.random() * extensions.length)]
	}

	getRandomCondition() {
		return this.medicalConditions[
			Math.floor(Math.random() * this.medicalConditions.length)
		]
	}

	getRandomSpecialty() {
		return this.doctorSpecializations[
			Math.floor(Math.random() * this.doctorSpecializations.length)
		]
	}

	getRandomSpecialization() {
		return this.doctorSpecializations[
			Math.floor(Math.random() * this.doctorSpecializations.length)
		]
	}

	getRandomFirstName() {
		return this.firstNames[Math.floor(Math.random() * this.firstNames.length)]
	}

	getRandomLastName() {
		return this.lastNames[Math.floor(Math.random() * this.lastNames.length)]
	}

	getRandomConsentReason() {
		return this.consentReasons[
			Math.floor(Math.random() * this.consentReasons.length)
		]
	}

	getRandomDepartment() {
		return this.medicalDepartments[
			Math.floor(Math.random() * this.medicalDepartments.length)
		]
	}

	// Utility methods
	generateLicenseNumber(specialtyCode) {
		const stateCode = ["CA", "NY", "TX", "FL", "IL"][
			Math.floor(Math.random() * 5)
		]
		const number = Math.floor(Math.random() * 900000) + 100000
		return `${stateCode}-${specialtyCode}-${number}`
	}

	calculateExpirationDate(duration) {
		const now = new Date()
		const days = parseInt(duration.split("-")[0])
		const expirationDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
		return expirationDate.toISOString()
	}

	/**
	 * Validate data format and structure
	 */
	validatePatientId(patientId) {
		const pattern = /^patient_\d+_\d+_\d+_\d{3}$/
		return pattern.test(patientId)
	}

	validateDoctorId(doctorId) {
		const pattern = /^doctor_[A-Z]{2}_\d+_\d+_\d+_\d{3}$/
		return pattern.test(doctorId)
	}

	validateFileHash(hash) {
		const pattern = /^[a-f0-9]{64}$/
		return pattern.test(hash)
	}

	validateS3Key(s3Key) {
		const pattern =
			/^medical-records\/\d{4}\/\d{2}\/\d{2}\/[a-z-]+\/patient-[^\/]+\/[^\/]+$/
		return pattern.test(s3Key)
	}
}

module.exports = { MedicalDataGenerator }
