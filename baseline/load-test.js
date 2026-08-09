'use strict';

/**
 * Dependency-light load generator for the ConsentMD baseline server.
 * Plain Node `http` only -- no external load-testing library -- so the
 * measured numbers contain no framework overhead of their own.
 *
 * Usage:
 *   node load-test.js [--patients 20] [--doctors 10] [--records-per-patient 15]
 *                     [--tps 50] [--duration 30] [--workload mixed]
 *                     [--runs 10] [--url http://127.0.0.1:3100] [--out DIR]
 *
 * Workloads: create | read | grant | revoke | mixed
 *
 * FAILURE DEFINITION (also printed with every run): a request counts as a
 * failure if it hits a network error, exceeds the 30 s timeout, or returns
 * HTTP >= 400 -- EXCEPT an expected 403 on a deliberately unauthorized read,
 * which is the policy working and is counted separately as "denied".
 * Latency statistics are computed over all requests that received an HTTP
 * response (successes + expected denials); failures are excluded.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// ---------------------------------------------------------------------------
// Configuration (CLI flags override env vars override defaults)
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 30_000;
const FAILURE_DEFINITION =
	'failure = network error, timeout > 30s, or HTTP >= 400 other than an ' +
	'expected 403 on a deliberately unauthorized read (counted as "denied")';

function parseArgs(argv) {
	const flags = {};
	for (let i = 2; i < argv.length; i++) {
		const m = /^--([a-z-]+)$/.exec(argv[i]);
		if (!m) throw new Error(`unrecognized argument: ${argv[i]}`);
		flags[m[1]] = argv[i + 1];
		i++;
	}
	const pick = (flag, env, fallback) => flags[flag] ?? process.env[env] ?? fallback;
	const num = (flag, env, fallback) => {
		const v = Number(pick(flag, env, fallback));
		if (!Number.isFinite(v) || v <= 0) throw new Error(`--${flag} must be a positive number`);
		return v;
	};
	const config = {
		url: pick('url', 'BASELINE_URL', 'http://127.0.0.1:3100'),
		patients: num('patients', 'PATIENTS', 20),
		doctors: num('doctors', 'DOCTORS', 10),
		recordsPerPatient: num('records-per-patient', 'RECORDS_PER_PATIENT', 15),
		tps: num('tps', 'TPS', 50),
		duration: num('duration', 'DURATION', 30),
		workload: pick('workload', 'WORKLOAD', 'mixed'),
		runs: num('runs', 'RUNS', 10),
		out: pick('out', 'BASELINE_RESULTS', path.join(__dirname, 'results')),
	};
	const workloads = ['create', 'read', 'grant', 'revoke', 'mixed'];
	if (!workloads.includes(config.workload)) {
		throw new Error(`--workload must be one of: ${workloads.join(', ')}`);
	}
	return config;
}

// ---------------------------------------------------------------------------
// HTTP client (keep-alive, per-request latency, 30 s timeout)
// ---------------------------------------------------------------------------

const agent = new http.Agent({ keepAlive: true, maxSockets: 512 });

function request(baseUrl, method, pathname, body) {
	return new Promise((resolve) => {
		const started = performance.now();
		const payload = body === undefined ? null : JSON.stringify(body);
		const req = http.request(new URL(pathname, baseUrl), {
			method,
			agent,
			timeout: REQUEST_TIMEOUT_MS,
			headers: payload
				? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
				: {},
		});
		const done = (result) => resolve({ ...result, latencyMs: performance.now() - started });
		req.on('response', (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => done({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
			res.on('error', () => done({ status: 0, error: 'response error' }));
		});
		req.on('timeout', () => { req.destroy(new Error('timeout')); });
		req.on('error', (err) => done({ status: 0, error: err.message }));
		if (payload) req.write(payload);
		req.end();
	});
}

// ---------------------------------------------------------------------------
// Dataset seeding + in-memory state model
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(4, '0');
const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function seed(config) {
	const patients = Array.from({ length: config.patients }, (_, i) => `patient_${pad(i + 1)}`);
	const doctors = Array.from({ length: config.doctors }, (_, i) => `doctor_${pad(i + 1)}`);
	const records = [];

	const jobs = [];
	for (const patientId of patients) {
		for (let r = 0; r < config.recordsPerPatient; r++) {
			jobs.push({ patientId, r });
		}
	}
	const BATCH = 50;
	for (let i = 0; i < jobs.length; i += BATCH) {
		const results = await Promise.all(
			jobs.slice(i, i + BATCH).map(({ patientId, r }) =>
				request(config.url, 'POST', '/records', {
					patientId,
					fileName: `seed-${patientId}-${r}.pdf`,
					s3ObjectKey: `seed/${patientId}/${r}`,
					fileHash: `hash_${patientId}_${r}`,
					details: `Seed record ${r} for ${patientId}`,
				})
			)
		);
		for (const res of results) {
			if (res.status !== 201) throw new Error(`seeding failed: HTTP ${res.status} ${res.error || res.body}`);
			const rec = JSON.parse(res.body);
			records.push({ recordId: rec.recordId, patientId: rec.patientId });
		}
	}

	// Pre-grant one consent per record so read/revoke workloads have material
	// to work with from the first request.
	const consents = new ConsentSet();
	for (let i = 0; i < records.length; i += BATCH) {
		const slice = records.slice(i, i + BATCH).map((rec) => {
			const doctorId = randomOf(doctors);
			return { rec, doctorId };
		});
		const results = await Promise.all(
			slice.map(({ rec, doctorId }) =>
				request(config.url, 'POST', '/consents', {
					recordId: rec.recordId,
					doctorId,
					patientId: rec.patientId,
				})
			)
		);
		results.forEach((res, j) => {
			if (res.status !== 201) throw new Error(`consent seeding failed: HTTP ${res.status}`);
			const { rec, doctorId } = slice[j];
			consents.add(rec.recordId, doctorId, rec.patientId);
		});
	}

	return { patients, doctors, records, consents };
}

/** Active-consent set with O(1) random pick and O(1) removal. */
class ConsentSet {
	constructor() {
		this.items = [];
		this.index = new Map();
	}
	key(recordId, doctorId) {
		return `${recordId}|${doctorId}`;
	}
	add(recordId, doctorId, patientId) {
		const k = this.key(recordId, doctorId);
		if (this.index.has(k)) return;
		this.index.set(k, this.items.length);
		this.items.push({ recordId, doctorId, patientId });
	}
	remove(recordId, doctorId) {
		const k = this.key(recordId, doctorId);
		const i = this.index.get(k);
		if (i === undefined) return;
		const last = this.items.pop();
		this.index.delete(k);
		if (i < this.items.length) {
			this.items[i] = last;
			this.index.set(this.key(last.recordId, last.doctorId), i);
		}
	}
	has(recordId, doctorId) {
		return this.index.has(this.key(recordId, doctorId));
	}
	pick() {
		return this.items.length ? randomOf(this.items) : null;
	}
	get size() {
		return this.items.length;
	}
}

// ---------------------------------------------------------------------------
// Operations. Each returns { op, expectDenied, exec() -> Promise<result> }.
// ---------------------------------------------------------------------------

function buildOperation(kind, config, state) {
	const { url } = config;
	const { patients, doctors, records, consents } = state;

	switch (kind) {
		case 'create': {
			const patientId = randomOf(patients);
			return {
				op: 'create',
				expectDenied: false,
				exec: async () => {
					const res = await request(url, 'POST', '/records', {
						patientId,
						fileName: 'load.pdf',
						s3ObjectKey: `load/${patientId}`,
						fileHash: `hash_${Math.random().toString(36).slice(2)}`,
						details: 'load-test record',
					});
					if (res.status === 201) {
						const rec = JSON.parse(res.body);
						records.push({ recordId: rec.recordId, patientId: rec.patientId });
					}
					return res;
				},
			};
		}
		case 'read-allowed': {
			// Half owner reads, half doctor-with-consent reads (when available):
			// the two authorized paths of policy READ_RECORD.
			const viaConsent = consents.size > 0 && Math.random() < 0.5;
			const target = viaConsent ? consents.pick() : randomOf(records);
			const actorId = viaConsent ? target.doctorId : target.patientId;
			return {
				op: 'read',
				expectDenied: false,
				exec: () =>
					request(url, 'GET', `/records/${target.recordId}?actorId=${encodeURIComponent(actorId)}`),
			};
		}
		case 'read-denied': {
			// A doctor with no active consent for this record: the policy MUST
			// answer 403, and that answer is a correct outcome, not a failure.
			const rec = randomOf(records);
			let doctorId = randomOf(doctors);
			for (let i = 0; i < doctors.length && consents.has(rec.recordId, doctorId); i++) {
				doctorId = doctors[(doctors.indexOf(doctorId) + 1) % doctors.length];
			}
			if (consents.has(rec.recordId, doctorId)) {
				// Every doctor holds consent for this record; fall back to an
				// authorized read rather than mislabel an expected outcome.
				return buildOperation('read-allowed', config, state);
			}
			return {
				op: 'read',
				expectDenied: true,
				exec: () =>
					request(url, 'GET', `/records/${rec.recordId}?actorId=${encodeURIComponent(doctorId)}`),
			};
		}
		case 'grant': {
			const rec = randomOf(records);
			const doctorId = randomOf(doctors);
			return {
				op: 'grant',
				expectDenied: false,
				exec: async () => {
					const res = await request(url, 'POST', '/consents', {
						recordId: rec.recordId,
						doctorId,
						patientId: rec.patientId,
					});
					if (res.status === 201) consents.add(rec.recordId, doctorId, rec.patientId);
					return res;
				},
			};
		}
		case 'revoke': {
			const consent = consents.pick();
			if (!consent) {
				// Pool exhausted: replenish with a grant (reported under "grant").
				return buildOperation('grant', config, state);
			}
			consents.remove(consent.recordId, consent.doctorId);
			return {
				op: 'revoke',
				expectDenied: false,
				exec: () =>
					request(url, 'DELETE', '/consents', {
						recordId: consent.recordId,
						doctorId: consent.doctorId,
						patientId: consent.patientId,
					}),
			};
		}
		default:
			throw new Error(`unknown operation kind: ${kind}`);
	}
}

/** Draw the next operation kind according to the selected workload mix. */
function nextKind(workload) {
	const r = Math.random();
	switch (workload) {
		case 'create':
			return 'create';
		case 'read':
			// 90% authorized reads, 10% deliberately unauthorized (expected 403).
			return r < 0.9 ? 'read-allowed' : 'read-denied';
		case 'grant':
			return 'grant';
		case 'revoke':
			return 'revoke';
		case 'mixed':
			// 25% create, 36% authorized read, 4% denied read, 20% grant, 15% revoke.
			if (r < 0.25) return 'create';
			if (r < 0.61) return 'read-allowed';
			if (r < 0.65) return 'read-denied';
			if (r < 0.85) return 'grant';
			return 'revoke';
		default:
			throw new Error(`unknown workload: ${workload}`);
	}
}

// ---------------------------------------------------------------------------
// One measured run: open-loop scheduler firing at the target rate
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOnce(config, state) {
	const latencies = [];
	const counts = { success: 0, denied: 0, failed: 0 };
	const perOp = {};
	const inflight = [];

	const intervalMs = 1000 / config.tps;
	const start = performance.now();
	const endAt = start + config.duration * 1000;
	let scheduledAt = start;

	while (scheduledAt < endAt) {
		const now = performance.now();
		if (now < scheduledAt) await sleep(scheduledAt - now);
		const operation = buildOperation(nextKind(config.workload), config, state);
		inflight.push(
			operation.exec().then((res) => {
				const bucket = (perOp[operation.op] ??= { issued: 0, success: 0, denied: 0, failed: 0 });
				bucket.issued++;
				if (res.status === 0) {
					counts.failed++;
					bucket.failed++;
				} else if (operation.expectDenied && res.status === 403) {
					counts.denied++;
					bucket.denied++;
					latencies.push(res.latencyMs);
				} else if (res.status >= 400) {
					counts.failed++;
					bucket.failed++;
				} else {
					counts.success++;
					bucket.success++;
					latencies.push(res.latencyMs);
				}
			})
		);
		scheduledAt += intervalMs;
	}
	await Promise.all(inflight);
	const elapsedSec = (performance.now() - start) / 1000;

	return {
		workload: config.workload,
		targetTps: config.tps,
		durationSec: config.duration,
		elapsedSec: round(elapsedSec, 3),
		issued: inflight.length,
		success: counts.success,
		deniedExpected403: counts.denied,
		failed: counts.failed,
		throughputTps: round((counts.success + counts.denied) / elapsedSec, 2),
		latencyMs: latencyStats(latencies),
		perOperation: perOp,
		failureDefinition: FAILURE_DEFINITION,
		_latencies: latencies,
	};
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function round(x, dp = 2) {
	const f = 10 ** dp;
	return Math.round(x * f) / f;
}

function percentile(sorted, p) {
	if (sorted.length === 0) return null;
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[idx];
}

function latencyStats(latencies) {
	if (latencies.length === 0) {
		return { n: 0, mean: null, std: null, min: null, max: null, p50: null, p95: null, p99: null };
	}
	const sorted = [...latencies].sort((a, b) => a - b);
	const n = sorted.length;
	const mean = sorted.reduce((a, b) => a + b, 0) / n;
	const variance = n > 1 ? sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
	return {
		n,
		mean: round(mean, 3),
		std: round(Math.sqrt(variance), 3),
		min: round(sorted[0], 3),
		max: round(sorted[n - 1], 3),
		p50: round(percentile(sorted, 50), 3),
		p95: round(percentile(sorted, 95), 3),
		p99: round(percentile(sorted, 99), 3),
	};
}

function meanStd(values) {
	const n = values.length;
	const mean = values.reduce((a, b) => a + b, 0) / n;
	const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
	return { mean: round(mean, 3), std: round(Math.sqrt(variance), 3) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const config = parseArgs(process.argv);

	const health = await request(config.url, 'GET', '/health');
	if (health.status !== 200) {
		throw new Error(`baseline server not reachable at ${config.url} (is it running? npm start)`);
	}

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const outDir = path.join(config.out, stamp);
	fs.mkdirSync(outDir, { recursive: true });

	console.log(`Seeding dataset: ${config.patients} patients x ${config.recordsPerPatient} records, ${config.doctors} doctors ...`);
	const state = await seed(config);
	const manifest = {
		seededAt: new Date().toISOString(),
		url: config.url,
		patients: state.patients.length,
		doctors: state.doctors.length,
		records: state.records.length,
		preGrantedConsents: state.consents.size,
		config,
	};
	console.log('Dataset manifest:');
	console.log(JSON.stringify(manifest, null, 2));
	fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

	console.log(`\nWorkload "${config.workload}" @ ${config.tps} TPS for ${config.duration}s, ${config.runs} run(s)`);
	console.log(`Note: ${FAILURE_DEFINITION}\n`);

	const runs = [];
	const pooledLatencies = [];
	for (let i = 1; i <= config.runs; i++) {
		const result = await runOnce(config, state);
		pooledLatencies.push(...result._latencies);
		delete result._latencies;
		runs.push(result);
		fs.writeFileSync(path.join(outDir, `run-${i}.json`), JSON.stringify(result, null, 2));
		console.log(
			`run ${i}/${config.runs}: throughput ${result.throughputTps} TPS | ` +
			`ok ${result.success}, denied(403) ${result.deniedExpected403}, failed ${result.failed} | ` +
			`latency mean ${result.latencyMs.mean} ms, p50 ${result.latencyMs.p50}, ` +
			`p95 ${result.latencyMs.p95}, p99 ${result.latencyMs.p99}`
		);
	}

	const aggregate = {
		runs: config.runs,
		workload: config.workload,
		targetTps: config.tps,
		durationSec: config.duration,
		throughputTps: meanStd(runs.map((r) => r.throughputTps)),
		latencyMeanMs: meanStd(runs.map((r) => r.latencyMs.mean)),
		pooledLatencyMs: latencyStats(pooledLatencies),
		totals: {
			issued: runs.reduce((a, r) => a + r.issued, 0),
			success: runs.reduce((a, r) => a + r.success, 0),
			deniedExpected403: runs.reduce((a, r) => a + r.deniedExpected403, 0),
			failed: runs.reduce((a, r) => a + r.failed, 0),
		},
		failureDefinition: FAILURE_DEFINITION,
	};
	fs.writeFileSync(path.join(outDir, 'aggregate.json'), JSON.stringify(aggregate, null, 2));

	console.log('\nAggregate across runs:');
	console.log(JSON.stringify(aggregate, null, 2));
	console.log(`\nResults written to ${outDir}`);
	agent.destroy();
}

main().catch((err) => {
	console.error(`load-test failed: ${err.message}`);
	process.exit(1);
});
