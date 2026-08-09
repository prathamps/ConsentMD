"use strict"

/**
 * Descriptive statistics shared by the results aggregator.
 *
 * Percentiles use linear interpolation between closest ranks (the same method
 * as numpy's default), so p95/p99 are well-defined even for small samples.
 */

function mean(values) {
	if (values.length === 0) return NaN
	let sum = 0
	for (const v of values) sum += v
	return sum / values.length
}

/** Sample standard deviation (n - 1 denominator). */
function stddev(values) {
	if (values.length < 2) return 0
	const m = mean(values)
	let sumSq = 0
	for (const v of values) sumSq += (v - m) * (v - m)
	return Math.sqrt(sumSq / (values.length - 1))
}

/** @param {number[]} sorted ascending-sorted values. @param {number} p percentile in [0, 100]. */
function percentileOfSorted(sorted, p) {
	if (sorted.length === 0) return NaN
	if (sorted.length === 1) return sorted[0]
	const rank = (p / 100) * (sorted.length - 1)
	const lower = Math.floor(rank)
	const upper = Math.ceil(rank)
	if (lower === upper) return sorted[lower]
	return sorted[lower] + (rank - lower) * (sorted[upper] - sorted[lower])
}

/** Full summary of a set of latency samples (milliseconds). */
function summarize(values) {
	const sorted = [...values].sort((a, b) => a - b)
	return {
		count: sorted.length,
		mean: round2(mean(sorted)),
		std: round2(stddev(sorted)),
		min: sorted.length ? sorted[0] : NaN,
		max: sorted.length ? sorted[sorted.length - 1] : NaN,
		p50: round2(percentileOfSorted(sorted, 50)),
		p95: round2(percentileOfSorted(sorted, 95)),
		p99: round2(percentileOfSorted(sorted, 99)),
	}
}

function round2(n) {
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : n
}

module.exports = { mean, stddev, percentileOfSorted, summarize, round2 }
