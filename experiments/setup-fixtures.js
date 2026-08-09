'use strict';

/**
 * Provision the on-ledger fixtures the experiments need, and print the ids
 * they consume. Generalises the ad-hoc setup used during bring-up.
 *
 * Given the CA-enrolled benchmark identities (from the Caliper suite's
 * `provision-identities.js`), this:
 *   1. imports bench_patient_0, bench_patient_1 (Org1) and bench_doctor_0
 *      (Org2) into fabric-network file wallets under --wallet-dir,
 *   2. registers bench_doctor_0's doctor profile (grantConsent requires it),
 *   3. creates one record owned by bench_patient_0,
 *   4. grants bench_doctor_0 active consent on that record.
 *
 * It prints KEY=VALUE lines (and writes them to --out as a JSON) so a shell
 * orchestrator can `eval`/read them:
 *   RECORD_ID, DOCTOR_ID, GATEWAY_IDENTITY, GATEWAY_ORG, WALLET_DIR
 *
 * Usage:
 *   node experiments/setup-fixtures.js \
 *     [--wallet-dir <dir>] [--out <file.json>] [--as-localhost true|false]
 *
 * Requires the network up, chaincode committed, and identities provisioned.
 */

const path = require('path');
const fs = require('fs');
const { Gateway, Wallets } = require('fabric-network');

const REPO = path.resolve(__dirname, '..');
const SUITE = path.join(REPO, 'blockchain/caliper/caliper-benchmarks-local');
const BENCH_IDS = path.join(SUITE, 'networks/fabric/bench-identities');
const PROFILE_DIR = path.join(REPO, 'api/connection-profiles');

function arg(flag, def) {
	const i = process.argv.indexOf(flag);
	return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

const WALLET_DIR = path.resolve(arg('--wallet-dir', path.join(REPO, 'api/wallets')));
const OUT = arg('--out', null);
const AS_LOCALHOST = String(arg('--as-localhost', 'true')) === 'true';

const IDENTITIES = [
	{ org: 'org1', mspId: 'Org1MSP', name: 'bench_patient_0' },
	{ org: 'org1', mspId: 'Org1MSP', name: 'bench_patient_1' },
	{ org: 'org2', mspId: 'Org2MSP', name: 'bench_doctor_0' },
];

function ccp(org) {
	const file = path.join(PROFILE_DIR, `connection-${org}.json`);
	if (!fs.existsSync(file)) throw new Error(`connection profile missing: ${file} (run generate-ccp.sh)`);
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function importIdentity({ org, mspId, name }) {
	const dir = path.join(BENCH_IDS, org, name);
	const cert = path.join(dir, 'cert.pem');
	const key = path.join(dir, 'key.pem');
	if (!fs.existsSync(cert) || !fs.existsSync(key)) {
		throw new Error(`bench identity ${name} not found under ${dir} (run provision-identities.js)`);
	}
	const wallet = await Wallets.newFileSystemWallet(path.join(WALLET_DIR, org));
	await wallet.put(name, {
		credentials: {
			certificate: fs.readFileSync(cert, 'utf8'),
			privateKey: fs.readFileSync(key, 'utf8'),
		},
		mspId,
		type: 'X.509',
	});
	return wallet;
}

async function connect(org, identity) {
	const wallet = await Wallets.newFileSystemWallet(path.join(WALLET_DIR, org));
	const gateway = new Gateway();
	await gateway.connect(ccp(org), {
		wallet,
		identity,
		discovery: { enabled: true, asLocalhost: AS_LOCALHOST },
	});
	const contract = (await gateway.getNetwork('mychannel')).getContract('medicalconsent');
	return { gateway, contract };
}

async function main() {
	for (const id of IDENTITIES) await importIdentity(id);

	// Register the doctor profile (idempotent) and learn its ledger id.
	const doctor = await connect('org2', 'bench_doctor_0');
	await doctor.contract
		.submitTransaction('registerDoctorProfile', 'Experiment Doctor', 'General')
		.catch(() => {}); // already registered is fine
	const doctorId = (await doctor.contract.evaluateTransaction('getMyId')).toString();
	doctor.gateway.disconnect();

	// Create a record owned by patient_0 and grant the doctor consent on it.
	const owner = await connect('org1', 'bench_patient_0');
	const record = JSON.parse(
		(
			await owner.contract.submitTransaction(
				'createPatientRecord',
				'experiment-fixture.pdf',
				'experiments/fixture-key',
				'experiment-fixture-hash',
				'Experiment fixture record'
			)
		).toString()
	);
	await owner.contract.submitTransaction('grantConsent', record.recordId, doctorId).catch((e) => {
		if (!/already granted/i.test(e.message)) throw e;
	});
	owner.gateway.disconnect();

	const result = {
		RECORD_ID: record.recordId,
		DOCTOR_ID: doctorId,
		GATEWAY_IDENTITY: 'bench_patient_0',
		GATEWAY_ORG: 'org1',
		WALLET_DIR,
	};
	if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, '\t'));
	for (const [k, v] of Object.entries(result)) console.log(`${k}=${v}`);
}

main().catch((e) => {
	console.error(`setup-fixtures: ${e.message}`);
	process.exit(1);
});
