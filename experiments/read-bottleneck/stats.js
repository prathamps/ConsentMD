'use strict';

/**
 * Tiny, dependency-free descriptive statistics for latency samples.
 *
 * Duplicated verbatim in each experiment directory on purpose: every
 * experiment here is meant to be copied out and run on its own, so none of
 * them may reach across directories for a shared module.
 *
 * All inputs are arrays of numbers (milliseconds, throughout this repo).
 */

/** Arithmetic mean. Returns 0 for an empty sample so callers never see NaN. */
function mean(xs) {
	if (!xs.length) return 0;
	let sum = 0;
	for (const x of xs) sum += x;
	return sum / xs.length;
}

/**
 * The p-th percentile (0..100) using linear interpolation between the two
 * nearest ranks. `xs` need NOT be pre-sorted; a copy is sorted internally.
 */
function percentile(xs, p) {
	if (!xs.length) return 0;
	const sorted = xs.slice().sort((a, b) => a - b);
	if (sorted.length === 1) return sorted[0];
	const rank = (p / 100) * (sorted.length - 1);
	const lo = Math.floor(rank);
	const hi = Math.ceil(rank);
	if (lo === hi) return sorted[lo];
	const frac = rank - lo;
	return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/** Full summary of one sample: count + central tendency + tail percentiles. */
function summarize(xs) {
	const sorted = xs.slice().sort((a, b) => a - b);
	return {
		n: xs.length,
		mean: mean(xs),
		p50: percentile(sorted, 50),
		p95: percentile(sorted, 95),
		p99: percentile(sorted, 99),
		min: sorted.length ? sorted[0] : 0,
		max: sorted.length ? sorted[sorted.length - 1] : 0,
	};
}

/** Round to 3 decimal places for stable, human-readable CSV/table output. */
function r3(x) {
	return Math.round(x * 1000) / 1000;
}

module.exports = { mean, percentile, summarize, r3 };
