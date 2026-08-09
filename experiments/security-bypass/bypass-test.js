'use strict';

/**
 * Adversarial test for reviewer item 8:
 *
 *   "The claim that a compromised gateway/application layer still cannot read
 *    unauthorized data was never tested."
 *
 * This script SIMULATES a compromised application tier. It talks to the
 * chaincode directly through the Fabric SDK using a LEGITIMATE enrolled doctor
 * identity, and deliberately skips every check the Express API performs
 * (role gating, consultation verification, ownership checks). If the security
 * model holds, the CHAINCODE must still deny each unauthorized action on its
 * own — because authorization is derived from the signed X.509 certificate,
 * not from anything the application asserts.
 *
 * The same authorization matrix is proven OFFLINE, with no network, by the
 * chaincode unit tests in
 *   blockchain/artifacts/chaincode/javascript/test/policy.test.js
 * This script is the ONLINE counterpart: it validates that the deployed
 * chaincode on a live network actually enforces that matrix.
 *
 * Matrix exercised here (each row is one assertion):
 *   a) doctor reads a record with NO consent granted            -> DENIED
 *   +) doctor reads AFTER the owner grants consent               -> ALLOWED (positive control)
 *   b) doctor reads AFTER the owner revokes consent              -> DENIED
 *   c) doctor grants consent on a record they do not own         -> DENIED
 *   d) a patient who is not the owner reads the record           -> DENIED
 *
 * Exit code: 0 iff every assertion passes; non-zero otherwise.
 */

const path = require('path');
const fs = require('fs');
const { Gateway, Wallets, DefaultEventHandlerStrategies } = require('fabric-network');

// --------------------------------------------------------------------------
// Config (env vars; sensible defaults for a standard local deployment)
// --------------------------------------------------------------------------
const CFG = {
	channel: process.env.CHANNEL || 'mychannel',
	ccName: process.env.CC_NAME || 'medicalconsent',
	profileDir: process.env.PROFILE_DIR || path.resolve(__dirname, '..', '..', 'api', 'connection-profiles'),
	walletRoot: process.env.WALLET_DIR || path.resolve(__dirname, '..', '..', 'api', 'wallets'),
	asLocalhost: String(process.env.DISCOVERY_AS_LOCALHOST || 'false') === 'true',

	doctorOrg: process.env.DOCTOR_ORG || 'org1',
	doctorIdentity: process.env.DOCTOR_IDENTITY, // required
	ownerOrg: process.env.OWNER_ORG || 'org2',
	ownerIdentity: process.env.OWNER_IDENTITY, // required (patient who owns RECORD_ID)
	otherPatientOrg: process.env.OTHER_PATIENT_ORG || 'org2',
	otherPatientIdentity: process.env.OTHER_PATIENT_IDENTITY, // required (a different patient)
	recordId: process.env.RECORD_ID, // required
};

/**
 * Mirror of api/src/utils/blockchainUtils.js getCCP: return a profile with
 * TLS CA certs embedded as `pem`. Handles both connection-profile shapes this
 * repo produces: `tlsCACerts.path` (resolve + read) or an already-inlined
 * `tlsCACerts.pem` (generate-ccp.sh embeds the PEM directly).
 */
function getCCP(orgName) {
	const ccpPath = path.resolve(CFG.profileDir, `connection-${orgName}.json`);
	if (!fs.existsSync(ccpPath)) throw new Error(`connection profile not found: ${ccpPath}`);
	const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
	const ccpDir = path.dirname(ccpPath);

	const ensurePem = (node, label) => {
		if (!node || !node.tlsCACerts) return;
		const certs = node.tlsCACerts;
		if (certs.pem) return; // already inlined
		if (!certs.path) throw new Error(`${label}: connection profile has neither tlsCACerts.pem nor .path`);
		const resolved = path.resolve(ccpDir, certs.path);
		if (!fs.existsSync(resolved)) {
			throw new Error(
				`${label}: TLS CA cert not found at ${resolved}; the profile is generated for a ` +
					`different run mode (host vs container). Regenerate it or set PROFILE_DIR.`
			);
		}
		certs.pem = fs.readFileSync(resolved, 'utf8');
	};

	const peerKey = `peer0.${orgName}.example.com`;
	ensurePem(ccp.peers[peerKey], `peer ${peerKey}`);
	const orgKey = `Org${orgName.replace('org', '')}`;
	const caName = ccp.organizations[orgKey].certificateAuthorities[0];
	ensurePem(ccp.certificateAuthorities[caName], `ca ${caName}`);
	return ccp;
}

async function connect(orgName, identity) {
	const walletPath = path.join(CFG.walletRoot, orgName);
	if (!fs.existsSync(walletPath)) throw new Error(`wallet directory not found: ${walletPath}`);
	const wallet = await Wallets.newFileSystemWallet(walletPath);
	if (!(await wallet.get(identity))) throw new Error(`identity "${identity}" not found in wallet ${walletPath}`);
	const gateway = new Gateway();
	await gateway.connect(getCCP(orgName), {
		wallet,
		identity,
		discovery: { enabled: true, asLocalhost: CFG.asLocalhost },
		// Wait for the transaction to COMMIT (not merely be submitted) before
		// submitTransaction resolves. The setup steps below (grant, then read,
		// then revoke) are causally dependent: a fire-and-forget strategy lets
		// the read/revoke run against pre-commit state and spuriously fail with
		// "consent does not exist", which is a harness race, not a policy result.
		eventHandlerOptions: {
			commitTimeout: 300,
			strategy: DefaultEventHandlerStrategies.MSPID_SCOPE_ALLFORTX,
		},
	});
	const network = await gateway.getNetwork(CFG.channel);
	return { gateway, contract: network.getContract(CFG.ccName) };
}

const isDenied = (err) => /ACCESS_DENIED/.test(err && err.message ? err.message : String(err));

// A recorded assertion outcome for the final table.
const results = [];
function record(name, expected, passed, detail) {
	results.push({ name, expected, passed, detail });
}

async function expectDenied(name, thunk) {
	try {
		await thunk();
		record(name, 'DENIED', false, 'chaincode ALLOWED the action (SECURITY FAILURE)');
	} catch (err) {
		record(name, 'DENIED', isDenied(err), isDenied(err) ? 'denied by policy' : `threw non-authz error: ${err.message}`);
	}
}

async function expectAllowed(name, thunk) {
	try {
		const out = await thunk();
		record(name, 'ALLOWED', true, `ok (${String(out).slice(0, 40)}...)`);
		return out;
	} catch (err) {
		record(name, 'ALLOWED', false, `chaincode DENIED a legitimate action: ${err.message}`);
		return null;
	}
}

function requireCfg() {
	const missing = [];
	if (!CFG.doctorIdentity) missing.push('DOCTOR_IDENTITY');
	if (!CFG.ownerIdentity) missing.push('OWNER_IDENTITY');
	if (!CFG.otherPatientIdentity) missing.push('OTHER_PATIENT_IDENTITY');
	if (!CFG.recordId) missing.push('RECORD_ID');
	if (missing.length) {
		console.error(`Missing required env vars: ${missing.join(', ')}`);
		console.error('See README.md for the full list and an example invocation.');
		process.exit(2);
	}
}

async function main() {
	requireCfg();

	const doctor = await connect(CFG.doctorOrg, CFG.doctorIdentity);
	const owner = await connect(CFG.ownerOrg, CFG.ownerIdentity);
	const other = await connect(CFG.otherPatientOrg, CFG.otherPatientIdentity);

	try {
		// The doctor's on-ledger X.509 id, exactly as the chaincode derives it.
		const doctorId = (await doctor.contract.evaluateTransaction('getMyId')).toString();
		console.error(`Doctor blockchain id: ${doctorId}`);

		// Setup: the doctor must have a registered profile, else grantConsent
		// legitimately fails with NOT_FOUND rather than exercising the read
		// policy. Idempotent upsert; ignore benign errors.
		await doctor.contract
			.submitTransaction('registerDoctorProfile', 'Bypass Test Doctor', 'General')
			.catch((e) => console.error(`(profile upsert note: ${e.message})`));

		// Normalize to a known NO-CONSENT baseline (ignore "already revoked" / "not found").
		await owner.contract
			.submitTransaction('revokeConsent', CFG.recordId, doctorId)
			.catch(() => {});

		// (a) doctor reads with no consent -> DENIED
		await expectDenied('a. doctor read, no consent', () =>
			doctor.contract.evaluateTransaction('getRecordById', CFG.recordId)
		);

		// (+) owner grants consent, doctor reads -> ALLOWED (positive control)
		await owner.contract.submitTransaction('grantConsent', CFG.recordId, doctorId);
		await expectAllowed('+. doctor read, consent granted (control)', () =>
			doctor.contract.evaluateTransaction('getRecordById', CFG.recordId)
		);

		// (b) owner revokes consent, doctor reads -> DENIED
		await owner.contract.submitTransaction('revokeConsent', CFG.recordId, doctorId);
		await expectDenied('b. doctor read, consent revoked', () =>
			doctor.contract.evaluateTransaction('getRecordById', CFG.recordId)
		);

		// (c) doctor tries to grant consent on a record they do not own -> DENIED
		await expectDenied('c. doctor grants consent on foreign record', () =>
			doctor.contract.submitTransaction('grantConsent', CFG.recordId, doctorId)
		);

		// (d) a non-owner patient reads the record -> DENIED
		await expectDenied('d. non-owner patient read', () =>
			other.contract.evaluateTransaction('getRecordById', CFG.recordId)
		);
	} finally {
		doctor.gateway.disconnect();
		owner.gateway.disconnect();
		other.gateway.disconnect();
	}

	// ---- report ----
	const nameW = Math.max(...results.map((r) => r.name.length), 'assertion'.length);
	const pad = (s, w) => String(s).padEnd(w);
	console.log('\nCompromised-gateway assertion matrix (validated on the live network)\n');
	console.log(`${pad('assertion', nameW)}  expected  result  detail`);
	console.log(`${'-'.repeat(nameW)}  --------  ------  ------`);
	let failed = 0;
	for (const r of results) {
		if (!r.passed) failed++;
		console.log(`${pad(r.name, nameW)}  ${pad(r.expected, 8)}  ${pad(r.passed ? 'PASS' : 'FAIL', 6)}  ${r.detail}`);
	}
	console.log(`\n${results.length - failed}/${results.length} assertions passed.`);
	if (failed > 0) {
		console.error(`\nFAILED: ${failed} assertion(s) did not hold. The security claim is NOT satisfied on this deployment.`);
		process.exit(1);
	}
	console.log('\nPASS: the chaincode enforced every access rule independently of the (simulated compromised) application layer.');
}

main().catch((e) => {
	console.error(`bypass-test: fatal: ${e.stack || e.message}`);
	process.exit(1);
});
