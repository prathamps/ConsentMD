'use strict';

/**
 * ConsentMD baseline server: the "normal system" a reviewer would compare the
 * blockchain against -- a single Express process over a single SQLite file,
 * with an append-only audit_log standing in for the ledger.
 *
 * It implements the SAME domain operations and the SAME authorization policy
 * as the chaincode facade (blockchain/artifacts/chaincode/javascript/lib/
 * MedicalConsentContract.js + lib/access/policy.js):
 *
 *   POST   /records        createPatientRecord   (patient creates own record)
 *   POST   /consents       grantConsent          (only the record's owner)
 *   DELETE /consents       revokeConsent         (only the consent's patient)
 *   GET    /records/:id    getRecordById         (owner always; doctor only
 *                                                 with an ACTIVE consent;
 *                                                 403 otherwise)
 *
 * One deliberate simplification: identity. Fabric derives the principal from
 * the signed X.509 certificate; here the caller supplies its id in the body
 * (or ?actorId= for reads). Authenticating callers is orthogonal to the
 * storage/consensus overhead this baseline exists to measure.
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');

const { openDatabase } = require('./db');

const PORT = Number(process.env.BASELINE_PORT || 3100);
const DB_PATH = process.env.BASELINE_DB || path.join(__dirname, 'data', 'baseline.db');

const db = openDatabase(DB_PATH);
const app = express();
app.use(express.json());

const nowISO = () => new Date().toISOString();
const badRequest = (res, msg) => res.status(400).json({ error: msg });

app.get('/health', (req, res) => {
	res.json({ status: 'ok', auditRows: db.auditCount() });
});

/**
 * Create a patient record. Mirrors createPatientRecord: the creating patient
 * is the owner (policy CREATE_RECORD_AS_PATIENT).
 */
app.post('/records', (req, res) => {
	const { fileName, s3ObjectKey, fileHash, details, patientId } = req.body || {};
	if (!patientId) return badRequest(res, 'patientId is required');
	const record = {
		recordId: `record_${crypto.randomUUID()}`,
		patientId,
		fileName: fileName || null,
		s3ObjectKey: s3ObjectKey || null,
		fileHash: fileHash || null,
		details: details || null,
		createdAt: nowISO(),
	};
	db.createRecord(record);
	res.status(201).json(record);
});

/**
 * Grant consent. Mirrors grantConsent: only the owning patient may grant
 * (policy GRANT_CONSENT: who.role === PATIENT && rec.patientId === who.id).
 */
app.post('/consents', (req, res) => {
	const { recordId, doctorId, patientId } = req.body || {};
	if (!recordId || !doctorId || !patientId) {
		return badRequest(res, 'recordId, doctorId and patientId are required');
	}
	const record = db.getRecord(recordId);
	if (!record) {
		db.audit(patientId, 'GRANT_CONSENT', recordId, 'not_found');
		return res.status(404).json({ error: 'record not found' });
	}
	if (record.patient_id !== patientId) {
		db.audit(patientId, 'GRANT_CONSENT', `${recordId}/${doctorId}`, 'denied');
		return res.status(403).json({ error: 'only the record owner may grant consent' });
	}
	const consent = {
		consentId: `consent_${crypto.randomUUID()}`,
		recordId,
		doctorId,
		patientId,
		grantedAt: nowISO(),
	};
	db.grantConsent(consent);
	res.status(201).json({ ...consent, status: 'ACTIVE' });
});

/**
 * Revoke consent. Mirrors revokeConsent, addressed by (recordId, doctorId)
 * exactly as the revised chaincode is (policy REVOKE_CONSENT:
 * con.patientId === who.id).
 */
app.delete('/consents', (req, res) => {
	const { recordId, doctorId, patientId } = req.body || {};
	if (!recordId || !doctorId || !patientId) {
		return badRequest(res, 'recordId, doctorId and patientId are required');
	}
	const consent = db.getConsent(recordId, doctorId);
	if (!consent) {
		db.audit(patientId, 'REVOKE_CONSENT', `${recordId}/${doctorId}`, 'not_found');
		return res.status(404).json({ error: 'consent not found' });
	}
	if (consent.patient_id !== patientId) {
		db.audit(patientId, 'REVOKE_CONSENT', `${recordId}/${doctorId}`, 'denied');
		return res.status(403).json({ error: 'only the granting patient may revoke consent' });
	}
	db.revokeConsent({ recordId, doctorId, patientId, revokedAt: nowISO() });
	res.json({ recordId, doctorId, status: 'REVOKED' });
});

/**
 * Read a record. Mirrors getRecordById + policy READ_RECORD: readable by the
 * owning patient, or by a doctor holding an ACTIVE consent for this specific
 * record. No third case. Every attempt -- allowed or denied -- is audited,
 * because "who looked at what" is the property the audit log exists for.
 */
app.get('/records/:id', (req, res) => {
	const recordId = req.params.id;
	const actorId = req.query.actorId;
	if (!actorId) return badRequest(res, 'actorId query parameter is required');
	const record = db.getRecord(recordId);
	if (!record) {
		db.audit(actorId, 'READ_RECORD', recordId, 'not_found');
		return res.status(404).json({ error: 'record not found' });
	}
	const allowed = record.patient_id === actorId || db.hasActiveConsent(recordId, actorId);
	db.audit(actorId, 'READ_RECORD', recordId, allowed ? 'allowed' : 'denied');
	if (!allowed) {
		return res.status(403).json({ error: 'access denied: no active consent' });
	}
	res.json({
		recordId: record.record_id,
		patientId: record.patient_id,
		fileName: record.file_name,
		s3ObjectKey: record.s3_object_key,
		fileHash: record.file_hash,
		details: record.details,
		createdAt: record.created_at,
	});
});

const server = app.listen(PORT, () => {
	console.log(`consentmd-baseline listening on :${PORT} (db: ${DB_PATH})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		server.close(() => {
			db.close();
			process.exit(0);
		});
	});
}
