'use strict';

/**
 * Backup / delete / restore of a CouchDB `_design` document.
 *
 * run.sh uses this to temporarily remove the consent-lookup index so the
 * "without index" arm of the CouchDB measurement can run, then to put the
 * index back EXACTLY as it was. Splitting it out of run.sh (rather than doing
 * it with curl + jq) keeps the experiment dependency-light: node is already
 * required for the timing scripts, jq is not.
 *
 *   node couchdb-index.js backup  --url <u> --db <d> --ddoc <name> --file <f>
 *   node couchdb-index.js delete  --url <u> --db <d> --ddoc <name>
 *   node couchdb-index.js restore --url <u> --db <d> --ddoc <name> --file <f>
 *
 * `restore` re-creates the design doc from the backup, stripping `_rev` so the
 * PUT is a fresh create after the delete. All operations are idempotent and
 * tolerate a missing document, so it is safe to call from an EXIT trap.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');

function parseArgs(argv) {
	const out = { _: [] };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next === undefined || next.startsWith('--')) {
				out[key] = true;
			} else {
				out[key] = next;
				i++;
			}
		} else {
			out._.push(a);
		}
	}
	return out;
}

function request(base, method, path, body) {
	return new Promise((resolve, reject) => {
		const url = new URL(`${base.replace(/\/$/, '')}${path}`);
		const lib = url.protocol === 'https:' ? https : http;
		const payload = body ? Buffer.from(JSON.stringify(body)) : null;
		const opts = {
			method,
			hostname: url.hostname,
			port: url.port || (url.protocol === 'https:' ? 443 : 80),
			path: url.pathname + url.search,
			headers: { 'Content-Type': 'application/json' },
		};
		if (payload) opts.headers['Content-Length'] = payload.length;
		if (url.username || url.password) {
			opts.auth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
		}
		const req = lib.request(opts, (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => {
				const raw = Buffer.concat(chunks).toString('utf8');
				let json = null;
				try {
					json = raw ? JSON.parse(raw) : null;
				} catch (_) {
					/* non-JSON body */
				}
				resolve({ status: res.statusCode, json, raw });
			});
		});
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

async function main() {
	const args = parseArgs(process.argv);
	const cmd = args._[0];
	const base = args.url || 'http://admin:adminpassword@localhost:5984';
	const db = args.db || 'mychannel_medicalconsent';
	const ddoc = args.ddoc || 'idxConsentLookupDoc';
	const file = args.file;
	const designPath = `/${db}/_design/${ddoc}`;

	if (cmd === 'backup') {
		const res = await request(base, 'GET', designPath);
		if (res.status === 404) {
			console.error(`couchdb-index backup: _design/${ddoc} not present; nothing to back up`);
			process.exit(0);
		}
		if (res.status !== 200) throw new Error(`GET ${designPath} -> HTTP ${res.status}: ${res.raw}`);
		fs.writeFileSync(file, JSON.stringify(res.json));
		console.error(`couchdb-index backup: saved _design/${ddoc} (rev ${res.json._rev}) to ${file}`);
		return;
	}

	if (cmd === 'delete') {
		const head = await request(base, 'GET', designPath);
		if (head.status === 404) {
			console.error(`couchdb-index delete: _design/${ddoc} already absent`);
			return;
		}
		if (head.status !== 200) throw new Error(`GET ${designPath} -> HTTP ${head.status}: ${head.raw}`);
		const rev = head.json._rev;
		const res = await request(base, 'DELETE', `${designPath}?rev=${encodeURIComponent(rev)}`);
		if (res.status !== 200 && res.status !== 202) {
			throw new Error(`DELETE ${designPath} -> HTTP ${res.status}: ${res.raw}`);
		}
		console.error(`couchdb-index delete: removed _design/${ddoc}`);
		return;
	}

	if (cmd === 'restore') {
		if (!file || !fs.existsSync(file)) {
			console.error(`couchdb-index restore: no backup file at ${file}; nothing to restore`);
			process.exit(0);
		}
		const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
		delete doc._rev; // fresh create after the delete
		// If it somehow still exists, adopt the current rev so the PUT succeeds.
		const head = await request(base, 'GET', designPath);
		if (head.status === 200) doc._rev = head.json._rev;
		const res = await request(base, 'PUT', designPath, doc);
		if (res.status !== 201 && res.status !== 200 && res.status !== 202) {
			throw new Error(`PUT ${designPath} -> HTTP ${res.status}: ${res.raw}`);
		}
		console.error(`couchdb-index restore: restored _design/${ddoc}`);
		return;
	}

	console.error('couchdb-index: first argument must be one of backup|delete|restore');
	process.exit(2);
}

main().catch((e) => {
	console.error(`couchdb-index: ${e.message}`);
	process.exit(1);
});
