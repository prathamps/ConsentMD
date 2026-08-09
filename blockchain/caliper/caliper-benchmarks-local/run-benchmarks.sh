#!/bin/bash
# ConsentMD benchmark harness.
#
# Runs each benchmark N times (default 10 — reviewer item 2), samples
# container resources at a fixed interval throughout (item 15), and
# aggregates per-transaction latencies into mean ± std across runs plus
# pooled p50/p95/p99 (items 2, 3). Dataset manifests (item 7) and the
# failure definition (item 12) land in the same summary.
#
# Usage:
#   ./run-benchmarks.sh [--runs N] [--benchmarks "consent-granting record-access"]
#                       [--network FILE] [--monitor-interval SECONDS]
#
# Prerequisite: node setup/provision-identities.js  (CA-enrolled identities
# with the `organization` attribute; plain cryptogen identities are denied by
# the chaincode's fail-closed policy).
set -euo pipefail
cd "$(dirname "$0")"

RUNS=10
NETWORK_CONFIG="networks/fabric/bench-network.yaml"
BENCHMARKS=(consent-granting record-access consent-revocation mixed-workload)
MONITOR_INTERVAL=5

while [ $# -gt 0 ]; do
	case "$1" in
		--runs) RUNS="$2"; shift 2 ;;
		--benchmarks) read -r -a BENCHMARKS <<< "$2"; shift 2 ;;
		--network) NETWORK_CONFIG="$2"; shift 2 ;;
		--monitor-interval) MONITOR_INTERVAL="$2"; shift 2 ;;
		*) echo "Unknown option: $1" >&2; exit 1 ;;
	esac
done

if [ ! -f "$NETWORK_CONFIG" ]; then
	echo "Network config not found: $NETWORK_CONFIG" >&2
	echo "Generate it first: node setup/provision-identities.js" >&2
	exit 1
fi
command -v node >/dev/null || { echo "Node.js is required" >&2; exit 1; }

RESULTS_DIR="results/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"
export CONSENTMD_RESULTS_DIR="$PWD/$RESULTS_DIR"
LOG_FILE="$RESULTS_DIR/execution.log"
exec 1> >(tee -a "$LOG_FILE") 2>&1

echo "=== ConsentMD Benchmark Suite ==="
echo "Runs per benchmark : $RUNS"
echo "Benchmarks         : ${BENCHMARKS[*]}"
echo "Network config     : $NETWORK_CONFIG"
echo "Results            : $RESULTS_DIR"
echo "Resource sampling  : docker stats every ${MONITOR_INTERVAL}s"
echo

monitoring/collect-docker-stats.sh "$MONITOR_INTERVAL" "$RESULTS_DIR/resource-usage.csv" &
MONITOR_PID=$!
trap 'kill "$MONITOR_PID" 2>/dev/null || true' EXIT

FAILED_RUNS=()
for bench in "${BENCHMARKS[@]}"; do
	config="benchmarks/consent-management/${bench}-benchmark.yaml"
	if [ ! -f "$config" ]; then
		echo "!! Missing benchmark config: $config" >&2
		FAILED_RUNS+=("$bench (missing config)")
		continue
	fi
	for run in $(seq 1 "$RUNS"); do
		export CONSENTMD_RUN_LABEL="${bench}.run${run}"
		echo "--- $bench run $run/$RUNS ($(date -u +%H:%M:%SZ)) ---"
		if ! npx caliper launch manager \
			--caliper-workspace ./ \
			--caliper-networkconfig "$NETWORK_CONFIG" \
			--caliper-benchconfig "$config" \
			--caliper-flow-only-test \
			--caliper-report-path "$RESULTS_DIR/${bench}-run${run}-report.html"; then
			echo "!! $bench run $run failed" >&2
			FAILED_RUNS+=("$bench run $run")
		fi
	done
done

kill "$MONITOR_PID" 2>/dev/null || true

echo
echo "=== Aggregating results ==="
node src/aggregate-results.js "$RESULTS_DIR"

if command -v python3 >/dev/null && python3 -c 'import matplotlib' 2>/dev/null; then
	python3 monitoring/plot-resources.py "$RESULTS_DIR/resource-usage.csv" "$RESULTS_DIR/figures" || true
else
	echo "matplotlib not available — render figures later with:"
	echo "  python3 monitoring/plot-resources.py $RESULTS_DIR/resource-usage.csv $RESULTS_DIR/figures"
fi

echo
if [ ${#FAILED_RUNS[@]} -gt 0 ]; then
	printf '!! %d failed run(s):\n' "${#FAILED_RUNS[@]}"
	printf '   - %s\n' "${FAILED_RUNS[@]}"
	exit 1
fi
echo "All runs completed. See $RESULTS_DIR/summary.md"
