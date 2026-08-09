'use strict';

/**
 * Off-chain file-storage load generator for reviewer item 10:
 *
 *   "Off-chain file storage is described but never benchmarked."
 *
 * ConsentMD keeps medical files in S3-compatible object storage and puts only
 * the SHA-256 + object key on-chain. This tool drives the REAL API endpoints
 * that exercise that path and reports throughput and latency distributions,
 * so the off-chain design has measured numbers behind it.
 *
 * Endpoints exercised (discovered from api/src/routes/v1):
 *   auth:     POST /v1/auth/login            body {email,password}
 *                                            -> payload.access.token  (Bearer)
 *   upload:   POST /v1/records/self          multipart: file=<pdf>, details=<text>
 *                                            (patient self-upload; PDF only)
 *                                            -> payload.recordId, payload.s3ObjectKey
 *   download: GET  /v1/records/:id/file-url  -> payload.url (pre-signed URL);
 *                                            with --download-object the object
 *                                            itself is then fetched from storage.
 *
 * Dependency-light: Node stdlib only (http, https, crypto).
 *
 * Failure (identical definition across all experiments): HTTP status >= 400,
 * any network error, or a response taking longer than 30s.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const { summarize, r3 } = require('./stats');

const TIMEOUT_MS = 30000;

// --------------------------------------------------------------------------
// Args / env
// --------------------------------------------------------------------------
function parseArgs(argv) {
	const out = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) out[key] = true;
		else {
			out[key] = next;
			i++;
		}
	}
	return out;
}

function parseSize(s) {
	const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|b)?$/i);
	if (!m) throw new Error(`bad size: ${s}`);
	const n = parseFloat(m[1]);
	const unit = (m[2] || 'b').toLowerCase();
	const mult = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 }[unit];
	return Math.round(n * mult);
}

const args = parseArgs(process.argv);
const CFG = {
	baseUrl: (args['base-url'] || process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
	email: args.email || process.env.API_EMAIL,
	password: args.password || process.env.API_PASSWORD,
	sizes: (args.sizes || '100KB,1MB,5MB').split(',').map(parseSize),
	requests: parseInt(args.requests || '50', 10),
	concurrency: parseInt(args.concurrency || '10', 10),
	details: args.details || 'file-storage benchmark record',
	downloadObject: Boolean(args['download-object']),
	uploadPath: args['upload-path'] || '/v1/records/self',
};

// --------------------------------------------------------------------------
// HTTP helper. Resolves { status, headers, body, ms } or rejects (network /
// timeout). Never throws on 4xx/5xx — the caller classifies those.
// --------------------------------------------------------------------------
function request(method, urlStr, { headers = {}, body = null, auth = null } = {}) {
	return new Promise((resolve, reject) => {
		const url = new URL(urlStr);
		const lib = url.protocol === 'https:' ? https : http;
		const opts = {
			method,
			hostname: url.hostname,
			port: url.port || (url.protocol === 'https:' ? 443 : 80),
			path: url.pathname + url.search,
			headers: { ...headers },
		};
		if (auth) opts.headers.Authorization = `Bearer ${auth}`;
		if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
		const start = process.hrtime.bigint();
		const req = lib.request(opts, (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => {
				const ms = Number(process.hrtime.bigint() - start) / 1e6;
				resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), ms });
			});
		});
		req.on('error', reject);
		req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`timeout after ${TIMEOUT_MS}ms`)));
		if (body) req.write(body);
		req.end();
	});
}

// --------------------------------------------------------------------------
// Payloads
// --------------------------------------------------------------------------
/** A byte buffer of exactly `size` bytes that begins like a PDF (the API only
 *  gates on mimetype) and carries a unique nonce so every upload has a distinct
 *  SHA-256 — otherwise the API's duplicate-hash check would reject repeats. */
function makePdf(size) {
	const nonce = crypto.randomBytes(16).toString('hex');
	const head = Buffer.from(`%PDF-1.4\n% consentmd-bench ${nonce}\n`, 'utf8');
	const tail = Buffer.from('\n%%EOF\n', 'utf8');
	const fillLen = Math.max(0, size - head.length - tail.length);
	const fill = Buffer.alloc(fillLen, 0x20); // spaces
	return Buffer.concat([head, fill, tail]).subarray(0, Math.max(size, head.length + tail.length));
}

/** Build a multipart/form-data body for { details, file }. */
function buildMultipart(pdfBuffer) {
	const boundary = `----consentmdbench${crypto.randomBytes(12).toString('hex')}`;
	const CRLF = '\r\n';
	const preamble = Buffer.from(
		`--${boundary}${CRLF}` +
			`Content-Disposition: form-data; name="details"${CRLF}${CRLF}` +
			`${CFG.details}${CRLF}` +
			`--${boundary}${CRLF}` +
			`Content-Disposition: form-data; name="file"; filename="bench-${crypto.randomBytes(6).toString('hex')}.pdf"${CRLF}` +
			`Content-Type: application/pdf${CRLF}${CRLF}`,
		'utf8'
	);
	const epilogue = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
	const body = Buffer.concat([preamble, pdfBuffer, epilogue]);
	return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function parseJson(buf) {
	try {
		return JSON.parse(buf.toString('utf8'));
	} catch (_) {
		return null;
	}
}

// --------------------------------------------------------------------------
// Concurrency pool: run `total` tasks, at most `limit` in flight. `task(i)`
// returns a result object; results are collected in completion order.
// --------------------------------------------------------------------------
async function pool(total, limit, task) {
	const results = [];
	let next = 0;
	async function worker() {
		while (next < total) {
			const i = next++;
			// eslint-disable-next-line no-await-in-loop
			results.push(await task(i));
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, total) }, worker));
	return results;
}

// --------------------------------------------------------------------------
// Phases
// --------------------------------------------------------------------------
async function login() {
	const res = await request('POST', `${CFG.baseUrl}/v1/auth/login`, {
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: CFG.email, password: CFG.password }),
	});
	if (res.status >= 400) throw new Error(`login failed: HTTP ${res.status} ${res.body.toString('utf8').slice(0, 200)}`);
	const json = parseJson(res.body);
	const token = json && json.payload && json.payload.access && json.payload.access.token;
	if (!token) throw new Error(`login response had no payload.access.token: ${res.body.toString('utf8').slice(0, 200)}`);
	return token;
}

async function uploadPhase(token, size) {
	const latencies = [];
	const recordIds = [];
	let ok = 0;
	let fail = 0;
	let bytesOk = 0;
	const wallStart = process.hrtime.bigint();
	await pool(CFG.requests, CFG.concurrency, async () => {
		const pdf = makePdf(size);
		const { body, contentType } = buildMultipart(pdf);
		try {
			const res = await request('POST', `${CFG.baseUrl}${CFG.uploadPath}`, {
				headers: { 'Content-Type': contentType },
				body,
				auth: token,
			});
			if (res.status >= 400) {
				fail++;
				return { failDetail: `HTTP ${res.status}: ${res.body.toString('utf8').slice(0, 120)}` };
			}
			ok++;
			bytesOk += pdf.length;
			latencies.push(res.ms);
			const json = parseJson(res.body);
			const rec = json && json.payload;
			if (rec && rec.recordId) recordIds.push(rec.recordId);
			return {};
		} catch (e) {
			fail++;
			return { failDetail: e.message };
		}
	});
	const wallSec = Number(process.hrtime.bigint() - wallStart) / 1e9;
	return { latencies, recordIds, ok, fail, bytesOk, wallSec };
}

async function downloadPhase(token, recordIds) {
	const latencies = [];
	let ok = 0;
	let fail = 0;
	let bytesOk = 0;
	if (!recordIds.length) return { latencies, ok, fail, bytesOk, wallSec: 0 };
	const wallStart = process.hrtime.bigint();
	await pool(recordIds.length, CFG.concurrency, async (i) => {
		const id = recordIds[i];
		try {
			const res = await request('GET', `${CFG.baseUrl}/v1/records/${encodeURIComponent(id)}/file-url`, { auth: token });
			if (res.status >= 400) {
				fail++;
				return;
			}
			let ms = res.ms;
			let bytes = res.body.length;
			if (CFG.downloadObject) {
				const json = parseJson(res.body);
				const url = json && json.payload && json.payload.url;
				if (url) {
					const obj = await request('GET', url);
					if (obj.status >= 400) {
						fail++;
						return;
					}
					ms += obj.ms;
					bytes = obj.body.length;
				}
			}
			ok++;
			bytesOk += bytes;
			latencies.push(ms);
		} catch (e) {
			fail++;
		}
	});
	const wallSec = Number(process.hrtime.bigint() - wallStart) / 1e9;
	return { latencies, ok, fail, bytesOk, wallSec };
}

// --------------------------------------------------------------------------
// Reporting
// --------------------------------------------------------------------------
function fmtSize(bytes) {
	if (bytes >= 1024 * 1024) return `${r3(bytes / (1024 * 1024))}MB`;
	if (bytes >= 1024) return `${r3(bytes / 1024)}KB`;
	return `${bytes}B`;
}

function reportRow(label, size, phase) {
	const s = summarize(phase.latencies);
	const rps = phase.wallSec > 0 ? phase.ok / phase.wallSec : 0;
	const mbps = phase.wallSec > 0 ? phase.bytesOk / phase.wallSec / 1e6 : 0;
	return [
		label,
		fmtSize(size),
		String(phase.ok),
		String(phase.fail),
		r3(rps),
		r3(mbps),
		r3(s.mean),
		r3(s.p50),
		r3(s.p95),
		r3(s.p99),
	].map(String);
}

async function main() {
	if (!CFG.email || !CFG.password) {
		console.error('Missing credentials. Set API_EMAIL and API_PASSWORD (or --email/--password). See README.md.');
		process.exit(2);
	}

	// Preflight: reach the health endpoint and log in. Fail fast if the API is down.
	console.error(`Preflight: GET ${CFG.baseUrl}/v1/auth/test ...`);
	try {
		const ping = await request('GET', `${CFG.baseUrl}/v1/auth/test`);
		if (ping.status >= 500) throw new Error(`health endpoint returned HTTP ${ping.status}`);
	} catch (e) {
		console.error(`API not reachable at ${CFG.baseUrl}: ${e.message}`);
		process.exit(3);
	}
	const token = await login().catch((e) => {
		console.error(e.message);
		process.exit(3);
	});
	console.error('Logged in. Starting benchmark.\n');

	const rows = [];
	for (const size of CFG.sizes) {
		console.error(`--- size ${fmtSize(size)} : ${CFG.requests} uploads @ concurrency ${CFG.concurrency} ---`);
		const up = await uploadPhase(token, size);
		console.error(`    upload: ok=${up.ok} fail=${up.fail} in ${r3(up.wallSec)}s`);
		const down = await downloadPhase(token, up.recordIds);
		console.error(`    download: ok=${down.ok} fail=${down.fail} in ${r3(down.wallSec)}s`);
		rows.push(reportRow('upload', size, up));
		rows.push(reportRow('download', size, down));
	}

	const header = ['op', 'size', 'ok', 'fail', 'req/s', 'MB/s', 'mean_ms', 'p50_ms', 'p95_ms', 'p99_ms'];
	const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
	const fmt = (cells) => cells.map((c, i) => (i <= 1 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
	console.log('\nOff-chain file storage throughput & latency\n');
	console.log(fmt(header));
	console.log(widths.map((w) => '-'.repeat(w)).join('  '));
	for (const r of rows) console.log(fmt(r));

	// CSV alongside the human table.
	const csv = [header.join(',')].concat(rows.map((r) => r.join(','))).join('\n');
	require('fs').writeFileSync(require('path').join(__dirname, 'results.csv'), csv + '\n');
	console.log(`\nWrote ${require('path').join(__dirname, 'results.csv')}\n`);

	const anyFail = rows.some((r) => parseInt(r[3], 10) > 0);
	process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
	console.error(`file-bench: fatal: ${e.stack || e.message}`);
	process.exit(1);
});
