'use strict';

/**
 * Read every results/raw_<component>.csv, compute per-component statistics,
 * print a fixed-width attribution table and write results/summary.csv.
 *
 * The point of the table is the three-way attribution the reviewer asked for:
 * a CouchDB row (database), a peer row (blockchain, incl. database), and a
 * gateway row (full path). The derived rows at the bottom name the differences
 * explicitly so no arithmetic is left to the reader.
 */

const fs = require('fs');
const path = require('path');
const { summarize, r3 } = require('./stats');

const RESULTS_DIR = process.argv[2] || path.join(__dirname, 'results');

// Preferred display order and human labels; anything else falls to the end.
const ORDER = [
	['couchdb_find_indexed', 'CouchDB _find (indexed)        [database]'],
	['couchdb_find_noindex', 'CouchDB _find (no index)       [database]'],
	['peer_query', 'peer chaincode query           [blockchain+db]'],
	['gateway_getRecordById', 'SDK gateway getRecordById      [full path]'],
	['gateway_getRecordByIdRichQuery', 'SDK gateway rich-query read    [full path]'],
];

function loadSamples(file) {
	const text = fs.readFileSync(file, 'utf8').trim();
	const lines = text.split('\n');
	const body = lines[0].trim() === 'latency_ms' ? lines.slice(1) : lines;
	return body.map((l) => parseFloat(l)).filter((x) => Number.isFinite(x));
}

function main() {
	if (!fs.existsSync(RESULTS_DIR)) {
		console.error(`aggregate: results directory not found: ${RESULTS_DIR}`);
		process.exit(1);
	}
	const files = fs
		.readdirSync(RESULTS_DIR)
		.filter((f) => f.startsWith('raw_') && f.endsWith('.csv'))
		.map((f) => ({ component: f.slice(4, -4), file: path.join(RESULTS_DIR, f) }));

	if (!files.length) {
		console.error(`aggregate: no raw_*.csv files in ${RESULTS_DIR}`);
		process.exit(1);
	}

	const byComponent = {};
	for (const { component, file } of files) {
		byComponent[component] = summarize(loadSamples(file));
	}

	const labelFor = (c) => {
		const hit = ORDER.find(([key]) => key === c);
		return hit ? hit[1] : c;
	};
	const ordered = ORDER.map(([k]) => k).filter((k) => byComponent[k]);
	for (const c of Object.keys(byComponent)) if (!ordered.includes(c)) ordered.push(c);

	// ---- printed table ----
	const header = ['component', 'n', 'mean', 'p50', 'p95', 'p99', 'min', 'max'];
	const rows = ordered.map((c) => {
		const s = byComponent[c];
		return [labelFor(c), String(s.n), r3(s.mean), r3(s.p50), r3(s.p95), r3(s.p99), r3(s.min), r3(s.max)].map(String);
	});
	const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
	const fmt = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
	console.log('\nRead-path latency attribution (all values in milliseconds)\n');
	console.log(fmt(header));
	console.log(widths.map((w) => '-'.repeat(w)).join('  '));
	for (const r of rows) console.log(fmt(r));

	// ---- derived attribution (means) ----
	const m = (c) => (byComponent[c] ? byComponent[c].mean : null);
	const derived = [];
	if (m('gateway_getRecordById') !== null && m('peer_query') !== null) {
		derived.push(['gateway/SDK overhead (gateway - peer)', r3(m('gateway_getRecordById') - m('peer_query'))]);
	}
	if (m('peer_query') !== null && m('couchdb_find_indexed') !== null) {
		derived.push(['peer+chaincode overhead (peer - couchdb_indexed)', r3(m('peer_query') - m('couchdb_find_indexed'))]);
	}
	if (m('couchdb_find_noindex') !== null && m('couchdb_find_indexed') !== null) {
		derived.push([
			'index benefit (couchdb_noindex - couchdb_indexed)',
			r3(m('couchdb_find_noindex') - m('couchdb_find_indexed')),
		]);
	}
	if (derived.length) {
		console.log('\nDerived attribution (difference of means, ms):');
		for (const [k, v] of derived) console.log(`  ${k.padEnd(52)} ${v}`);
	}

	// ---- summary.csv ----
	const csvLines = ['component,n,mean_ms,p50_ms,p95_ms,p99_ms,min_ms,max_ms'];
	for (const c of ordered) {
		const s = byComponent[c];
		csvLines.push([c, s.n, r3(s.mean), r3(s.p50), r3(s.p95), r3(s.p99), r3(s.min), r3(s.max)].join(','));
	}
	const outPath = path.join(RESULTS_DIR, 'summary.csv');
	fs.writeFileSync(outPath, csvLines.join('\n') + '\n');
	console.log(`\nWrote ${outPath}\n`);
}

main();
