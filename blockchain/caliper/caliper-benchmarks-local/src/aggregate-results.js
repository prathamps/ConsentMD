#!/usr/bin/env node
"use strict"

/**
 * Aggregate per-transaction latency samples across repeated benchmark runs.
 *
 * Usage: node src/aggregate-results.js <results-dir>
 *
 * Reads every raw/<run>.round<r>.worker<w>.jsonl written by the
 * LatencyRecorder plus the dataset manifests, and produces:
 *   summary.json — machine-readable statistics
 *   summary.md   — per-benchmark tables with mean ± std ACROSS runs and
 *                  pooled p50/p95/p99 latency (reviewer items 2 and 3),
 *                  dataset sizes (item 7) and the failure definition (item 12)
 *   summary.csv  — one row per (benchmark, run) for external plotting
 */

const fs = require("fs")
const path = require("path")
const { summarize, mean, stddev, round2 } = require("./stats")
const { FAILURE_TIMEOUT_MS } = require("./config")

const FAILURE_DEFINITION =
	`A transaction is counted as FAILED when the Fabric SDK reports it as not ` +
	`committed (endorsement, validation, or chaincode error) or when no ` +
	`response is observed within ${FAILURE_TIMEOUT_MS / 1000} s. Expected ` +
	`authorization denials (deliberate unauthorized attempts) are counted ` +
	`separately as "denied" and are correct outcomes, not failures.`

function main() {
	const resultsDir = process.argv[2]
	if (!resultsDir || !fs.existsSync(resultsDir)) {
		console.error("Usage: node src/aggregate-results.js <results-dir>")
		process.exit(1)
	}

	const samplesByRun = loadSamples(path.join(resultsDir, "raw"))
	if (samplesByRun.size === 0) {
		console.error(`No latency samples found under ${path.join(resultsDir, "raw")}`)
		process.exit(1)
	}
	const manifests = loadManifests(path.join(resultsDir, "manifests"))

	const summary = buildSummary(samplesByRun, manifests)
	fs.writeFileSync(
		path.join(resultsDir, "summary.json"),
		JSON.stringify(summary, null, "\t")
	)
	fs.writeFileSync(path.join(resultsDir, "summary.md"), renderMarkdown(summary))
	fs.writeFileSync(path.join(resultsDir, "summary.csv"), renderCsv(summary))

	console.log(renderMarkdown(summary))
	console.log(`Written: summary.json, summary.md, summary.csv in ${resultsDir}`)
}

/**
 * @returns {Map<string, object[]>} samples keyed by "<benchmark>#<run>",
 * where file names follow "<benchmark>.run<N>.round<R>.worker<W>.jsonl"
 * (run label is set by run-benchmarks.sh as "<benchmark>.run<N>").
 */
function loadSamples(rawDir) {
	const byRun = new Map()
	if (!fs.existsSync(rawDir)) return byRun
	for (const file of fs.readdirSync(rawDir).filter((f) => f.endsWith(".jsonl"))) {
		const match = file.match(/^(.+)\.run(\d+)\.round\d+\.worker\d+\.jsonl$/)
		if (!match) continue
		const key = `${match[1]}#${match[2]}`
		const lines = fs
			.readFileSync(path.join(rawDir, file), "utf8")
			.split("\n")
			.filter(Boolean)
		const bucket = byRun.get(key) || []
		for (const line of lines) bucket.push(JSON.parse(line))
		byRun.set(key, bucket)
	}
	return byRun
}

/** Dataset totals per "<benchmark>#<run>", summed across workers and rounds. */
function loadManifests(manifestDir) {
	const totals = new Map()
	if (!fs.existsSync(manifestDir)) return totals
	for (const file of fs.readdirSync(manifestDir).filter((f) => f.endsWith(".json"))) {
		const match = file.match(/^(.+)\.run(\d+)\.round\d+\.worker\d+\.json$/)
		if (!match) continue
		const key = `${match[1]}#${match[2]}`
		const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, file), "utf8"))
		const sum = totals.get(key) || {
			patients: 0,
			doctors: 0,
			records: 0,
			activeConsents: 0,
		}
		for (const k of Object.keys(sum)) sum[k] += manifest.counts[k] || 0
		totals.set(key, sum)
	}
	return totals
}

function buildSummary(samplesByRun, manifests) {
	const benchmarks = {}
	for (const [key, samples] of samplesByRun) {
		const [benchmark, run] = key.split("#")
		benchmarks[benchmark] = benchmarks[benchmark] || { runs: [] }
		benchmarks[benchmark].runs.push(analyzeRun(Number(run), samples, manifests.get(key)))
	}

	for (const bench of Object.values(benchmarks)) {
		bench.runs.sort((a, b) => a.run - b.run)
		bench.acrossRuns = acrossRuns(bench.runs)
		bench.pooled = pooledStats(bench.runs)
	}

	return {
		generatedAt: new Date().toISOString(),
		failureDefinition: FAILURE_DEFINITION,
		benchmarks,
	}
}

function analyzeRun(run, samples, dataset) {
	const committed = samples.filter((s) => s.outcome === "committed")
	const denied = samples.filter((s) => s.outcome === "denied")
	const failed = samples.filter((s) => s.outcome === "failed")
	const timestamps = samples.map((s) => s.t)
	const durationS = (Math.max(...timestamps) - Math.min(...timestamps)) / 1000

	const perOp = {}
	for (const op of new Set(samples.map((s) => s.op))) {
		perOp[op] = summarize(
			samples.filter((s) => s.op === op && s.outcome !== "failed").map((s) => s.ms)
		)
	}

	return {
		run,
		dataset: dataset || null,
		committed: committed.length,
		denied: denied.length,
		failed: failed.length,
		durationS: round2(durationS),
		// Observed rate of correct outcomes; Caliper's HTML report remains the
		// authoritative throughput figure (it uses precise round boundaries).
		observedTps: durationS > 0 ? round2((committed.length + denied.length) / durationS) : null,
		latency: summarize(committed.map((s) => s.ms)),
		perOperation: perOp,
		samples: committed.map((s) => s.ms), // kept for pooling, stripped from JSON below
	}
}

function acrossRuns(runs) {
	const tps = runs.map((r) => r.observedTps).filter((v) => v != null)
	const means = runs.map((r) => r.latency.mean).filter(Number.isFinite)
	return {
		runs: runs.length,
		tpsMean: round2(mean(tps)),
		tpsStd: round2(stddev(tps)),
		latencyMeanMs: round2(mean(means)),
		latencyMeanStdMs: round2(stddev(means)),
		totalFailed: runs.reduce((n, r) => n + r.failed, 0),
		totalDenied: runs.reduce((n, r) => n + r.denied, 0),
	}
}

function pooledStats(runs) {
	const all = []
	for (const r of runs) {
		all.push(...r.samples)
		delete r.samples
	}
	return summarize(all)
}

function renderMarkdown(summary) {
	const lines = [
		"# ConsentMD benchmark summary",
		"",
		`Generated: ${summary.generatedAt}`,
		"",
		`**Failure definition:** ${summary.failureDefinition}`,
		"",
	]
	for (const [name, bench] of Object.entries(summary.benchmarks)) {
		const a = bench.acrossRuns
		const p = bench.pooled
		const dataset = bench.runs[0].dataset
		lines.push(`## ${name}`)
		lines.push("")
		if (dataset) {
			lines.push(
				`Dataset per run: ${dataset.patients} patients, ${dataset.doctors} doctors, ` +
					`${dataset.records} records, ${dataset.activeConsents} active consents at seed time.`
			)
			lines.push("")
		}
		lines.push(
			`Across ${a.runs} runs: throughput ${a.tpsMean} ± ${a.tpsStd} TPS, ` +
				`mean latency ${a.latencyMeanMs} ± ${a.latencyMeanStdMs} ms, ` +
				`failed ${a.totalFailed}, expected denials ${a.totalDenied}.`
		)
		lines.push("")
		lines.push("| metric | value (ms) |")
		lines.push("|---|---|")
		for (const k of ["min", "p50", "mean", "p95", "p99", "max"]) {
			lines.push(`| pooled ${k} | ${p[k]} |`)
		}
		lines.push("")
		lines.push("| run | committed | denied | failed | TPS | mean | p50 | p95 | p99 |")
		lines.push("|---|---|---|---|---|---|---|---|---|")
		for (const r of bench.runs) {
			const l = r.latency
			lines.push(
				`| ${r.run} | ${r.committed} | ${r.denied} | ${r.failed} | ${r.observedTps} ` +
					`| ${l.mean} | ${l.p50} | ${l.p95} | ${l.p99} |`
			)
		}
		lines.push("")
	}
	return lines.join("\n")
}

function renderCsv(summary) {
	const rows = [
		"benchmark,run,committed,denied,failed,duration_s,tps,lat_mean_ms,lat_std_ms,lat_p50_ms,lat_p95_ms,lat_p99_ms,lat_max_ms",
	]
	for (const [name, bench] of Object.entries(summary.benchmarks)) {
		for (const r of bench.runs) {
			const l = r.latency
			rows.push(
				[name, r.run, r.committed, r.denied, r.failed, r.durationS, r.observedTps,
					l.mean, l.std, l.p50, l.p95, l.p99, l.max].join(",")
			)
		}
	}
	return rows.join("\n") + "\n"
}

main()
