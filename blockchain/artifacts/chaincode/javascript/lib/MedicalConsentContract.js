"use strict"

const { Contract } = require("fabric-contract-api")

class MedicalConsentContract extends Contract {
	constructor() {
		super("org.mednet.medicalconsent.MedicalConsentContract")
	}

	async getMyId(ctx) {
		return ctx.clientIdentity.getID()
	}

	// =========================================================================================
	// == Profile and Record Creation Functions
	// =========================================================================================

	/**
	 * Allows a doctor to register their profile. This is deterministic.
	 */
	async registerDoctorProfile(ctx, name, specialization) {
		await this._verifyDoctorRole(ctx)

		const doctorId = ctx.clientIdentity.getID()
		const txTimestamp = this._getTxTimestampString(ctx)

		const profile = {
			profileId: `profile_${doctorId}`, // Use the doctor's own ID for a deterministic profile ID
			docType: "DoctorProfile",
			doctorId: doctorId,
			name: name,
			specialization: specialization,
			registeredAt: txTimestamp,
		}

		// A composite key ensures a doctor can only have one profile.
		const compositeKey = ctx.stub.createCompositeKey("DoctorProfile", [
			doctorId,
		])
		await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(profile)))

		return JSON.stringify(profile)
	}

	/**
	 * Creates a new medical record initiated by a PATIENT. This is deterministic.
	 */
	async createPatientRecord(ctx, fileName, s3ObjectKey, fileHash, details) {
		// ADDED: Verify the caller has the 'patient' role.
		await this._verifyPatientRole(ctx)
		const patientId = ctx.clientIdentity.getID()
		const txId = ctx.stub.getTxID()
		const txTimestamp = this._getTxTimestampString(ctx)

		const record = {
			recordId: `record_${txId}`, // Use transaction ID for a unique, deterministic ID
			docType: "MedicalRecord",
			patientId: patientId,
			details: details,
			fileName: fileName,
			s3ObjectKey: s3ObjectKey,
			fileHash: fileHash,
			doctorCreatorId: null, // Patient-initiated
			createdAt: txTimestamp,
			archived: false,
		}

		await ctx.stub.putState(
			record.recordId,
			Buffer.from(JSON.stringify(record))
		)
		ctx.stub.setEvent(
			"CreatePatientRecord",
			Buffer.from(JSON.stringify(record))
		)
		return JSON.stringify(record)
	}

	/**
	 * Creates a new medical record initiated by a DOCTOR. This is deterministic.
	 */
	async createMedicalRecord(
		ctx,
		patientId,
		recordDetails,
		fileName,
		s3ObjectKey,
		fileHash
	) {
		await this._verifyDoctorRole(ctx)

		const txId = ctx.stub.getTxID()
		const txTimestamp = this._getTxTimestampString(ctx)

		const record = {
			recordId: `record_${txId}`, // Use transaction ID
			docType: "MedicalRecord",
			patientId: patientId,
			details: recordDetails,
			fileName: fileName || null,
			s3ObjectKey: s3ObjectKey || null,
			fileHash: fileHash || null,
			doctorCreatorId: ctx.clientIdentity.getID(),
			createdAt: txTimestamp,
			archived: false,
		}

		await ctx.stub.putState(
			record.recordId,
			Buffer.from(JSON.stringify(record))
		)
		ctx.stub.setEvent(
			"CreateMedicalRecord",
			Buffer.from(JSON.stringify(record))
		)
		return JSON.stringify(record)
	}

	// =========================================================================================
	// == Consent Management Functions
	// =========================================================================================

	/**
	 * Grants a doctor access to a specific medical record. This is deterministic.
	 */
	async grantConsent(ctx, recordId, doctorId) {
		await this._verifyPatientRole(ctx)
		const record = await this._getAsset(ctx, recordId)
		await this._verifyPatientOwnership(ctx, record.patientId)

		const txId = ctx.stub.getTxID()
		const txTimestamp = this._getTxTimestampString(ctx)

		const consent = {
			consentId: `consent_${txId}`, // Use transaction ID
			docType: "Consent",
			recordId: recordId,
			patientId: ctx.clientIdentity.getID(),
			doctorId: doctorId,
			status: "granted",
			grantedAt: txTimestamp,
			revokedAt: null,
		}

		await ctx.stub.putState(
			consent.consentId,
			Buffer.from(JSON.stringify(consent))
		)
		ctx.stub.setEvent("GrantConsent", Buffer.from(JSON.stringify(consent)))
		return JSON.stringify(consent)
	}

	/**
	 * Revokes a doctor's access to a medical record. This is deterministic.
	 */
	async revokeConsent(ctx, consentId) {
		await this._verifyPatientRole(ctx)
		const consent = await this._getAsset(ctx, consentId)
		await this._verifyPatientOwnership(ctx, consent.patientId)

		if (consent.status === "revoked") {
			throw new Error(`Consent ${consentId} has already been revoked.`)
		}

		const txTimestamp = this._getTxTimestampString(ctx)

		consent.status = "revoked"
		consent.revokedAt = txTimestamp

		await ctx.stub.putState(
			consent.consentId,
			Buffer.from(JSON.stringify(consent))
		)
		ctx.stub.setEvent("RevokeConsent", Buffer.from(JSON.stringify(consent)))
		return JSON.stringify(consent)
	}

	/**
	 * Archives a medical record (soft delete).
	 */
	async archiveMedicalRecord(ctx, recordId) {
		await this._verifyPatientRole(ctx)
		const record = await this._getAsset(ctx, recordId)
		await this._verifyPatientOwnership(ctx, record.patientId)

		record.archived = true
		await ctx.stub.putState(
			record.recordId,
			Buffer.from(JSON.stringify(record))
		)
		return `Record ${recordId} has been archived.`
	}

	/**
	 * Removes the file reference from a medical record (soft delete of the file).
	 * This is intended to be called when the off-chain file is deleted.
	 * @param {Context} ctx The transaction context.
	 * @param {string} recordId The ID of the record to modify.
	 */
	async removeFileFromRecord(ctx, recordId) {
		await this._verifyPatientRole(ctx)
		const record = await this._getAsset(ctx, recordId)
		await this._verifyPatientOwnership(ctx, record.patientId)

		record.fileName = ""
		record.s3ObjectKey = ""
		record.fileHash = ""

		await ctx.stub.putState(
			record.recordId,
			Buffer.from(JSON.stringify(record))
		)
		ctx.stub.setEvent(
			"RemoveFileFromRecord",
			Buffer.from(JSON.stringify(record))
		)
		return `File references removed from record ${recordId}.`
	}

	// =========================================================================================
	// == Private Data and Other Functions
	// =========================================================================================

	/**
	 * Adds a sensitive note to a medical record using a PDC. This is deterministic.
	 */
	async addPrivateNoteToRecord(ctx, collection, recordId) {
		await this._verifyDoctorRole(ctx)

		const transientMap = ctx.stub.getTransient()
		if (!transientMap.has("note")) {
			throw new Error('Transient field "note" not provided.')
		}

		const txId = ctx.stub.getTxID()
		const txTimestamp = this._getTxTimestampString(ctx)

		const privateNote = {
			noteId: `privnote_${txId}`,
			docType: "PrivateNote",
			note: transientMap.get("note").toString("utf8"),
			authorId: ctx.clientIdentity.getID(),
			timestamp: txTimestamp,
		}

		const privateKey = ctx.stub.createCompositeKey("Record~Note", [
			recordId,
			privateNote.noteId,
		])
		await ctx.stub.putPrivateData(
			collection,
			privateKey,
			Buffer.from(JSON.stringify(privateNote))
		)

		return `Private note added to record ${recordId} in collection ${collection}.`
	}

	/**
	 * A generic function to check if an asset exists based on a query.
	 * Returns true if at least one asset is found, false otherwise.
	 * @param {Context} ctx The transaction context.
	 * @param {string} queryString The CouchDB query string.
	 */
	async assetExistsByQuery(ctx, queryString) {
		const iterator = await ctx.stub.getQueryResult(queryString)
		const result = await iterator.next()
		// If result.value is truthy, it means at least one asset was found.
		// We close the iterator to release resources and return true.
		if (result.value) {
			await iterator.close()
			return true
		}
		return false
	}

	/**
	 * Updates the details of an existing medical record. This is deterministic.
	 */
	async updateRecordDetails(ctx, recordId, newDetails) {
		const record = await this._getAsset(ctx, recordId)
		const cid = ctx.clientIdentity

		// Only the doctor who created the record can update it.
		await this._verifyDoctorRole(ctx)

		if (record.doctorCreatorId !== cid.getID()) {
			throw new Error(
				`Only the creating doctor (${record.doctorCreatorId}) can update this record.`
			)
		}
		if (record.archived) {
			throw new Error(`Cannot update an archived record: ${recordId}`)
		}

		const txTimestamp = this._getTxTimestampString(ctx)

		record.details = newDetails
		record.updatedAt = txTimestamp
		record.updaterId = cid.getID()

		await ctx.stub.putState(
			record.recordId,
			Buffer.from(JSON.stringify(record))
		)
		ctx.stub.setEvent(
			"UpdateMedicalRecord",
			Buffer.from(JSON.stringify(record))
		)
		return JSON.stringify(record)
	}

	// =========================================================================================
	// == Query and Utility Functions (Read-Only)
	// =========================================================================================

	/**
	 * Retrieves a medical record, checking authorization.
	 */
	async getRecordById(ctx, recordId) {
		const record = await this._getAsset(ctx, recordId)
		const cid = ctx.clientIdentity

		// Owner can always access
		if (record.patientId === cid.getID()) {
			return JSON.stringify(record)
		}

		// Doctor with consent can access
		const hasAccess = await this._verifyAccess(ctx, cid.getID(), recordId)
		if (hasAccess) {
			return JSON.stringify(record)
		}

		throw new Error(
			`User ${cid.getID()} is not authorized to access record ${recordId}`
		)
	}

	/**
	 * Executes a rich query.
	 */
	async findAssetsByQuery(ctx, queryString) {
		const resultsIterator = await ctx.stub.getQueryResult(queryString)
		return this._getAllResults(resultsIterator, false)
	}

	/**
	 * Returns the history of transactions for a given asset ID.
	 */
	async getAssetHistory(ctx, id) {
		const resultsIterator = await ctx.stub.getHistoryForKey(id)
		return this._getAllResults(resultsIterator, true)
	}

	// =========================================================================================
	// == Internal Helper and Authorization Functions
	// =========================================================================================

	/**
	 * Internal function to get an asset and parse it.
	 */
	async _getAsset(ctx, id) {
		const assetJSON = await ctx.stub.getState(id)
		if (!assetJSON || assetJSON.length === 0) {
			throw new Error(`The asset ${id} does not exist`)
		}
		return JSON.parse(assetJSON.toString())
	}

	/**
	 * Verifies if a user has the 'doctor' role.
	 */
	async _verifyDoctorRole(ctx) {
		const cid = ctx.clientIdentity
		if (!cid.assertAttributeValue("organization", "doctor")) {
			throw new Error(
				'Only users with the "doctor" role can perform this operation.'
			)
		}
	}

	/**
	 *  Verifies if a user has the 'patient' role.
	 */
	async _verifyPatientRole(ctx) {
		const cid = ctx.clientIdentity
		if (!cid.assertAttributeValue("organization", "patient")) {
			throw new Error(
				'Only users with the "patient" role can perform this operation.'
			)
		}
	}

	/**
	 * Verifies if the calling user is the patient specified.
	 */
	async _verifyPatientOwnership(ctx, patientId) {
		const cid = ctx.clientIdentity
		if (cid.getID() !== patientId) {
			throw new Error(
				`Operation can only be performed by the record owner. Caller: ${cid.getID()}, Owner: ${patientId}`
			)
		}
	}

	/**
	 * Checks if a doctor has active consent for a record. Returns true/false.
	 */
	async _verifyAccess(ctx, doctorId, recordId) {
		// A non-doctor will fail this check and return false.
		if (!ctx.clientIdentity.assertAttributeValue("organization", "doctor")) {
			return false
		}

		const queryString = JSON.stringify({
			selector: {
				docType: "Consent",
				doctorId: doctorId,
				recordId: recordId,
				status: "granted",
			},
		})
		const resultsIterator = await ctx.stub.getQueryResult(queryString)
		const result = await resultsIterator.next()
		await resultsIterator.close() // Important: always close the iterator
		return !result.done // If a result exists (!result.done is true), access is granted.
	}

	/**
	 * Helper to get a deterministic, ISO-formatted timestamp string from the transaction.
	 */
	_getTxTimestampString(ctx) {
		const txTimestamp = ctx.stub.getTxTimestamp()
		// The seconds property can be a Long object, so we handle it carefully.
		const seconds = txTimestamp.seconds.low || txTimestamp.seconds
		return new Date(seconds * 1000).toISOString()
	}

	/**
	 * Helper function to process iterator results into a JSON array.
	 */
	async _getAllResults(iterator, isHistory) {
		const allResults = []
		let res = await iterator.next()
		while (!res.done) {
			if (res.value && res.value.value.toString()) {
				const jsonRes = {}
				if (isHistory) {
					jsonRes.txId = res.value.tx_id
					jsonRes.timestamp = new Date(
						res.value.timestamp.seconds.low * 1000
					).toISOString()
					jsonRes.isDelete = res.value.is_delete
					try {
						jsonRes.value = JSON.parse(res.value.value.toString("utf8"))
					} catch (err) {
						jsonRes.value = res.value.value.toString("utf8")
					}
				} else {
					jsonRes.key = res.value.key
					try {
						jsonRes.record = JSON.parse(res.value.value.toString("utf8"))
					} catch (err) {
						jsonRes.record = res.value.value.toString("utf8")
					}
				}
				allResults.push(jsonRes)
			}
			res = await iterator.next()
		}
		await iterator.close()
		return JSON.stringify(allResults)
	}
}

module.exports = MedicalConsentContract
