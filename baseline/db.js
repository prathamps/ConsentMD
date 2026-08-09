'use strict';

/**
 * SQLite persistence layer for the ConsentMD non-blockchain baseline.
 *
 * Mirrors the chaincode's state model (records, consents keyed by
 * (recordId, doctorId)) plus an append-only audit_log table that stands in
 * for the ledger's implicit transaction history: every state change AND
 * every read attempt appends one row.
 *
 * All statements are prepared once; every mutation and its audit row are
 * committed in a single transaction so the log can never disagree with the
 * state, mirroring the atomicity a Fabric transaction provides.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS records (
	record_id     TEXT PRIMARY KEY,
	patient_id    TEXT NOT NULL,
	file_name     TEXT,
	s3_object_key TEXT,
	file_hash     TEXT,
	details       TEXT,
	created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_patient ON records (patient_id);

CREATE TABLE IF NOT EXISTS consents (
	consent_id  TEXT NOT NULL,
	record_id   TEXT NOT NULL,
	doctor_id   TEXT NOT NULL,
	patient_id  TEXT NOT NULL,
	status      TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
	granted_at  TEXT NOT NULL,
	revoked_at  TEXT,
	PRIMARY KEY (record_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
	id       INTEGER PRIMARY KEY AUTOINCREMENT,
	ts       TEXT NOT NULL,
	actor    TEXT NOT NULL,
	action   TEXT NOT NULL,
	resource TEXT NOT NULL,
	outcome  TEXT NOT NULL
);

-- Append-only: reject any attempt to rewrite history.
CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
	SELECT RAISE(ABORT, 'audit_log is append-only');
END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
	SELECT RAISE(ABORT, 'audit_log is append-only');
END;
`;

function openDatabase(dbPath) {
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	const db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');
	db.pragma('busy_timeout = 5000');
	db.exec(SCHEMA);

	const stmts = {
		insertRecord: db.prepare(
			`INSERT INTO records (record_id, patient_id, file_name, s3_object_key, file_hash, details, created_at)
			 VALUES (@recordId, @patientId, @fileName, @s3ObjectKey, @fileHash, @details, @createdAt)`
		),
		getRecord: db.prepare('SELECT * FROM records WHERE record_id = ?'),
		upsertConsent: db.prepare(
			`INSERT INTO consents (consent_id, record_id, doctor_id, patient_id, status, granted_at, revoked_at)
			 VALUES (@consentId, @recordId, @doctorId, @patientId, 'ACTIVE', @grantedAt, NULL)
			 ON CONFLICT (record_id, doctor_id) DO UPDATE SET
				status = 'ACTIVE', granted_at = @grantedAt, revoked_at = NULL`
		),
		getConsent: db.prepare('SELECT * FROM consents WHERE record_id = ? AND doctor_id = ?'),
		revokeConsent: db.prepare(
			`UPDATE consents SET status = 'REVOKED', revoked_at = @revokedAt
			 WHERE record_id = @recordId AND doctor_id = @doctorId`
		),
		hasActiveConsent: db.prepare(
			`SELECT 1 FROM consents WHERE record_id = ? AND doctor_id = ? AND status = 'ACTIVE'`
		),
		appendAudit: db.prepare(
			`INSERT INTO audit_log (ts, actor, action, resource, outcome)
			 VALUES (@ts, @actor, @action, @resource, @outcome)`
		),
		countAudit: db.prepare('SELECT COUNT(*) AS n FROM audit_log'),
	};

	const audit = (actor, action, resource, outcome) =>
		stmts.appendAudit.run({ ts: new Date().toISOString(), actor, action, resource, outcome });

	return {
		raw: db,

		audit,

		getRecord: (recordId) => stmts.getRecord.get(recordId),

		getConsent: (recordId, doctorId) => stmts.getConsent.get(recordId, doctorId),

		hasActiveConsent: (recordId, doctorId) =>
			stmts.hasActiveConsent.get(recordId, doctorId) !== undefined,

		/** Record creation + audit row, atomically. */
		createRecord: db.transaction((record) => {
			stmts.insertRecord.run(record);
			audit(record.patientId, 'CREATE_RECORD', record.recordId, 'allowed');
		}),

		/** Consent grant (or re-grant after revocation) + audit row, atomically. */
		grantConsent: db.transaction((consent) => {
			stmts.upsertConsent.run(consent);
			audit(consent.patientId, 'GRANT_CONSENT', `${consent.recordId}/${consent.doctorId}`, 'allowed');
		}),

		/** Consent revocation + audit row, atomically. */
		revokeConsent: db.transaction(({ recordId, doctorId, patientId, revokedAt }) => {
			stmts.revokeConsent.run({ recordId, doctorId, revokedAt });
			audit(patientId, 'REVOKE_CONSENT', `${recordId}/${doctorId}`, 'allowed');
		}),

		auditCount: () => stmts.countAudit.get().n,

		close: () => db.close(),
	};
}

module.exports = { openDatabase };
