"use strict"

const fs = require("fs")
const path = require("path")
const { RESULTS_DIR_ENV, RUN_LABEL_ENV } = require("./config")

/**
 * Per-transaction latency sampling (reviewer item 3).
 *
 * Caliper's own report only exposes min/avg/max latency, which hides tail
 * behaviour. This recorder writes one JSON line per transaction so the
 * aggregator (src/aggregate-results.js) can compute p50/p95/p99 offline.
 *
 * Samples are buffered and flushed in batches to keep the transaction hot
 * path down to an array push.
 */
const FLUSH_EVERY = 500

class LatencyRecorder {
	/**
	 * Creates a recorder writing under $CONSENTMD_RESULTS_DIR, or a no-op
	 * recorder when the variable is unset (e.g. ad-hoc `npx caliper` runs).
	 */
	static fromEnvironment(workerIndex, roundIndex) {
		const resultsDir = process.env[RESULTS_DIR_ENV]
		if (!resultsDir) return new NullLatencyRecorder()
		const runLabel = process.env[RUN_LABEL_ENV] || "run"
		const dir = path.join(resultsDir, "raw")
		const file = path.join(
			dir,
			`${runLabel}.round${roundIndex}.worker${workerIndex}.jsonl`
		)
		return new LatencyRecorder(file)
	}

	constructor(filePath) {
		this.filePath = filePath
		this.buffer = []
		fs.mkdirSync(path.dirname(filePath), { recursive: true })
	}

	/**
	 * @param {object} sample
	 * @param {string} sample.op operation name, e.g. "grantConsent".
	 * @param {number} sample.ms observed latency in milliseconds.
	 * @param {"committed"|"denied"|"failed"} sample.outcome "denied" means an
	 *        authorization rejection the scenario expected (a correct result).
	 */
	record(sample) {
		this.buffer.push(JSON.stringify({ t: Date.now(), ...sample }))
		if (this.buffer.length >= FLUSH_EVERY) this.flush()
	}

	flush() {
		if (this.buffer.length === 0) return
		fs.appendFileSync(this.filePath, this.buffer.join("\n") + "\n")
		this.buffer = []
	}
}

class NullLatencyRecorder {
	record() {}
	flush() {}
}

module.exports = { LatencyRecorder }
