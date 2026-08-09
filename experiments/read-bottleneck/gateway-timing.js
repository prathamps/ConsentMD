'use strict';

/**
 * Component (c): FULL-PATH read latency through the Fabric SDK gateway — the
 * same code path the Express API uses (fabric-network Gateway, service
 * discovery, endorsement, chaincode execution, state read).
 *
 * It reuses the API's own connection profiles and file-system wallets
 * (api/connection-profiles, api/wallets) via the same resolution logic as
 * api/src/utils/blockchainUtils.js, so the number it produces is representative
 * of production, not of a bespoke client.
 *
 * Subtracting component (b) [peer-only] from this isolates the SDK / gateway /
 * discovery overhead; subtracting component (a) [CouchDB] from (b) isolates the
 * peer + chaincode overhead. Together the three arms attribute read latency to
 * "gateway vs blockchain vs database" as a measurement.
 *
 * --fn getRecordById         : PRODUCTION path (consent = one getState)
 * --fn getRecordByIdRichQuery: same policy, consent resolved via a CouchDB
 *                              Mango query — lets the gateway arm show the
 *                              rich-query cost end-to-end as well.
 */

const path = require('path');
const fs = require('fs');
const { Gateway, Wallets } = require('fabric-network');
const { summarize, r3 } = require('./stats');

function parseArgs(argv) {
	const out = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) {
			out[key] = true;
		} else {
			out[key] = next;
			i++;
		}
	}
	return out;
}

/** Mirror of api/src/utils/blockchainUtils.js getCCP: load + embed PEMs. */
function getCCP(profileDir, orgName) {
	const ccpPath = path.resolve(profileDir, `connection-${orgName}.json`);
	if (!fs.existsSync(ccpPath)) {
		throw new Error(`connection profile not found: ${ccpPath}`);
	}
	const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
	const ccpDir = path.dirname(ccpPath);

	// Accept both connection-profile shapes this repo produces: an inlined
	// `tlsCACerts.pem` (generate-ccp.sh embeds it) or a `tlsCACerts.path` to
	// resolve and read.
	const ensurePem = (node, label) => {
		if (!node || !node.tlsCACerts) return;
		const certs = node.tlsCACerts;
		if (certs.pem) return;
		if (!certs.path) throw new Error(`${label}: connection profile has neither tlsCACerts.pem nor .path`);
		const resolved = path.resolve(ccpDir, certs.path);
		if (!fs.existsSync(resolved)) {
			throw new Error(
				`${label}: TLS CA cert not found at ${resolved}. The connection profile appears to be ` +
					`generated for a different run mode (host vs container). Regenerate it or point ` +
					`--profile-dir at the matching one.`
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

async function main() {
	const args = parseArgs(process.argv);
	const orgName = args.org || 'org1';
	const identity = args.identity;
	const recordId = args['record-id'];
	const fn = args.fn || 'getRecordById';
	const channel = args.channel || 'mychannel';
	const ccName = args['cc-name'] || 'medicalconsent';
	const n = parseInt(args.n || '200', 10);
	const warmup = parseInt(args.warmup || '5', 10);
	const out = args.out;
	const profileDir = args['profile-dir'] || path.resolve(__dirname, '..', '..', 'api', 'connection-profiles');
	const walletRoot = args['wallet-dir'] || path.resolve(__dirname, '..', '..', 'api', 'wallets');
	const asLocalhost = String(args['as-localhost'] || 'false') === 'true';

	if (!identity || !recordId || !out) {
		console.error('gateway-timing: --identity, --record-id and --out are all required');
		process.exit(2);
	}

	const ccp = getCCP(profileDir, orgName);
	const walletPath = path.join(walletRoot, orgName);
	if (!fs.existsSync(walletPath)) {
		throw new Error(`wallet directory not found: ${walletPath} (register the identity via the API first)`);
	}
	const wallet = await Wallets.newFileSystemWallet(walletPath);
	if (!(await wallet.get(identity))) {
		throw new Error(`identity "${identity}" not found in wallet ${walletPath}`);
	}

	const gateway = new Gateway();
	const connectStart = process.hrtime.bigint();
	await gateway.connect(ccp, {
		wallet,
		identity,
		discovery: { enabled: true, asLocalhost },
		eventHandlerOptions: { commitTimeout: 100, strategy: null },
	});
	const network = await gateway.getNetwork(channel);
	const contract = network.getContract(ccName);
	const connectMs = Number(process.hrtime.bigint() - connectStart) / 1e6;

	try {
		// Preflight: one authorized read must succeed, else the samples would
		// just be timing an ACCESS_DENIED and the attribution would be wrong.
		try {
			await contract.evaluateTransaction(fn, recordId);
		} catch (e) {
			throw new Error(
				`preflight ${fn}(${recordId}) as "${identity}" failed: ${e.message}\n` +
					`The identity must be authorized to read this record (owner patient, or a ` +
					`doctor holding active consent). Grant consent first, or use an owner identity.`
			);
		}

		const samples = [];
		for (let i = 0; i < warmup + n; i++) {
			const start = process.hrtime.bigint();
			// eslint-disable-next-line no-await-in-loop
			await contract.evaluateTransaction(fn, recordId);
			const ms = Number(process.hrtime.bigint() - start) / 1e6;
			if (i >= warmup) samples.push(ms);
		}

		const lines = ['latency_ms'].concat(samples.map((x) => x.toFixed(4)));
		fs.writeFileSync(out, lines.join('\n') + '\n');
		const s = summarize(samples);
		console.error(
			`gateway-timing[${fn}]: connect=${r3(connectMs)}ms; ` +
				`n=${s.n} mean=${r3(s.mean)} p50=${r3(s.p50)} p95=${r3(s.p95)} p99=${r3(s.p99)} (ms) -> ${out}`
		);
	} finally {
		gateway.disconnect();
	}
}

main().catch((e) => {
	console.error(`gateway-timing: ${e.message}`);
	process.exit(1);
});
