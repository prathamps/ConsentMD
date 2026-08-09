'use strict';

/**
 * Component (a): DIRECT CouchDB `_find` latency, bypassing the peer, the
 * chaincode and the SDK entirely.
 *
 * This isolates the state-database layer. Run once WITH the consent-lookup
 * index (`--use-index`) and once WITHOUT it (index design doc deleted by
 * run.sh, and this invoked with no `--use-index`), so the delta is a measured
 * fact rather than a claim: "reads are slow because of CouchDB" is only true
 * if this number is a large fraction of the peer/gateway numbers, and the
 * indexed-vs-unindexed delta shows how much of that the index removes.
 *
 * Stdlib only. Basic-auth credentials are taken from the base URL userinfo
 * (e.g. http://admin:pw@localhost:5984) so no secret is ever an argv token.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');

function parseArgs(argv) {
	const out = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) {
			out[key] = true; // boolean flag
		} else {
			out[key] = next;
			i++;
		}
	}
	return out;
}

/** One POST /{db}/_find. Resolves { ms, status, docs } or rejects on error. */
function findOnce(base, db, body) {
	return new Promise((resolve, reject) => {
		const url = new URL(`${base.replace(/\/$/, '')}/${db}/_find`);
		const lib = url.protocol === 'https:' ? https : http;
		const payload = Buffer.from(JSON.stringify(body));
		const opts = {
			method: 'POST',
			hostname: url.hostname,
			port: url.port || (url.protocol === 'https:' ? 443 : 80),
			path: url.pathname,
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': payload.length,
			},
		};
		if (url.username || url.password) {
			opts.auth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
		}
		const start = process.hrtime.bigint();
		const req = lib.request(opts, (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => {
				const ms = Number(process.hrtime.bigint() - start) / 1e6;
				const raw = Buffer.concat(chunks).toString('utf8');
				let docs = null;
				try {
					docs = JSON.parse(raw).docs;
				} catch (_) {
					/* leave docs null */
				}
				resolve({ ms, status: res.statusCode, docs });
			});
		});
		req.on('error', reject);
		req.write(payload);
		req.end();
	});
}

async function main() {
	const args = parseArgs(process.argv);
	const base = args.url || 'http://admin:adminpassword@localhost:5984';
	const db = args.db || 'mychannel_medicalconsent';
	const n = parseInt(args.n || '200', 10);
	const warmup = parseInt(args.warmup || '5', 10);
	const out = args.out;
	if (!out) {
		console.error('couchdb-timing: --out <rawfile> is required');
		process.exit(2);
	}

	const selector = args.selector
		? JSON.parse(args.selector)
		: {
				docType: 'Consent',
				doctorId: args['doctor-id'],
				recordId: args['record-id'],
				status: 'granted',
		  };

	const body = { selector };
	if (args['use-index']) {
		body.use_index = [args['index-ddoc'] || 'idxConsentLookupDoc', args['index-name'] || 'index-consent-lookup'];
	}

	// Preflight: one request that must return HTTP 200. A 4xx here (e.g. the DB
	// does not exist, or bad credentials) is a setup error, not a data point.
	const probe = await findOnce(base, db, body).catch((e) => {
		console.error(`couchdb-timing: cannot reach CouchDB at ${base.replace(/\/\/.*@/, '//***@')} : ${e.message}`);
		process.exit(3);
	});
	if (probe.status !== 200) {
		console.error(
			`couchdb-timing: _find on "${db}" returned HTTP ${probe.status} (expected 200). ` +
				`Check the database name and that the network is initialised.`
		);
		process.exit(3);
	}

	const samples = [];
	for (let i = 0; i < warmup + n; i++) {
		// eslint-disable-next-line no-await-in-loop
		const res = await findOnce(base, db, body);
		if (res.status !== 200) {
			console.error(`couchdb-timing: sample ${i} returned HTTP ${res.status}; aborting`);
			process.exit(3);
		}
		if (i >= warmup) samples.push(res.ms);
	}

	const label = args['use-index'] ? 'couchdb_find_indexed' : 'couchdb_find_noindex';
	const lines = ['latency_ms'].concat(samples.map((x) => x.toFixed(4)));
	fs.writeFileSync(out, lines.join('\n') + '\n');
	console.error(`couchdb-timing[${label}]: wrote ${samples.length} samples to ${out}`);
}

main().catch((e) => {
	console.error(`couchdb-timing: ${e.stack || e.message}`);
	process.exit(1);
});
