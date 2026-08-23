#!/bin/bash
# Rate-sweep harness that characterizes throughput correctly on a
# capacity-limited host (reproduces the paper's Tables 2 & 3, done rigorously).
#
# Two complementary measurements, per the systems-benchmarking method:
#
#   1. Sustained throughput (fixed-load, closed-loop): Caliper holds a small
#      in-flight backlog and finds the maximum rate the system can actually
#      commit, with stable latency. This is the honest "max throughput" number
#      and does NOT suffer open-loop congestion collapse.
#
#   2. Saturation curve (fixed-rate, open-loop): a sweep of offered rates that
#      brackets the knee, so the paper can show throughput rising, plateauing,
#      then latency degrading past capacity — with p50/p95/p99 at each point.
#
# Writes use record-creation (an unbounded, always-valid single ledger write).
# Reads run in two modes: authorized-only and authorization-enabled (a share of
# reads are correctly denied). Each (scenario) is run N times; the aggregator
# reports mean +/- std across runs plus pooled p50/p95/p99, one row per scenario.
#
# Usage:
#   ./run-sweep.sh [--runs N] [--duration S]
#                  [--write-rates "10 20 30 40 50"] [--read-rates "200 400 600"]
#                  [--modes "authorized enabled"] [--fixed-load L]
#                  [--network FILE] [--monitor-interval S] [--workers N]
#
# Prerequisite: node setup/provision-identities.js (CA-enrolled identities).
set -euo pipefail
cd "$(dirname "$0")"
export OVERRIDE_ORG="${OVERRIDE_ORG:-}" VERBOSE="${VERBOSE:-false}"

RUNS=10
DURATION=60          # steady state is reached within seconds for these workloads
WRITE_RATES="10 20 30 40 50"
READ_RATES="200 400 600"
MODES="authorized enabled"
FIXED_LOAD=20        # target in-flight backlog for the sustained (closed-loop) runs; 0 disables
NETWORK_CONFIG="networks/fabric/bench-network.yaml"
MONITOR_INTERVAL=5
WORKERS=2
UNAUTH_RATIO=0.2

while [ $# -gt 0 ]; do
	case "$1" in
		--runs) RUNS="$2"; shift 2 ;;
		--duration) DURATION="$2"; shift 2 ;;
		--write-rates) WRITE_RATES="$2"; shift 2 ;;
		--read-rates) READ_RATES="$2"; shift 2 ;;
		--modes) MODES="$2"; shift 2 ;;
		--fixed-load) FIXED_LOAD="$2"; shift 2 ;;
		--network) NETWORK_CONFIG="$2"; shift 2 ;;
		--monitor-interval) MONITOR_INTERVAL="$2"; shift 2 ;;
		--workers) WORKERS="$2"; shift 2 ;;
		*) echo "Unknown option: $1" >&2; exit 1 ;;
	esac
done

[ -f "$NETWORK_CONFIG" ] || { echo "Network config not found: $NETWORK_CONFIG (run provision-identities.js)"; exit 1; }
command -v node >/dev/null || { echo "Node.js required"; exit 1; }

RESULTS_DIR="results/sweep_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"
export CONSENTMD_RESULTS_DIR="$PWD/$RESULTS_DIR"
exec > >(tee -a "$RESULTS_DIR/execution.log") 2>&1

echo "=== ConsentMD rate sweep ==="
echo "runs=$RUNS duration=${DURATION}s workers=$WORKERS fixed-load=$FIXED_LOAD"
echo "write rates: $WRITE_RATES"
echo "read rates : $READ_RATES  modes: $MODES"
echo "results: $RESULTS_DIR"
echo

monitoring/collect-docker-stats.sh "$MONITOR_INTERVAL" "$RESULTS_DIR/resource-usage.csv" &
MONITOR_PID=$!
trap 'kill "$MONITOR_PID" 2>/dev/null || true' EXIT

TMP_CFG="$RESULTS_DIR/.round.yaml"

# rate_block "fixed-rate" 50   OR   rate_block "fixed-load" 20
rate_block() {
	if [ "$1" = "fixed-load" ]; then
		printf '        type: fixed-load\n        opts:\n          transactionLoad: %s' "$2"
	else
		printf '        type: fixed-rate\n        opts:\n          tps: %s' "$2"
	fi
}

# write_config label module "<rate_block>" "<args_block>"
write_config() {
	cat > "$TMP_CFG" <<EOF
test:
  name: $1
  workers:
    number: $WORKERS
  rounds:
    - label: $1
      txDuration: $DURATION
      rateControl:
$3
      workload:
        module: $2
        arguments:
$4
EOF
}

# When the SUT is pinned to a CPU subset (evaluate.sh --constrain), the load
# generator is pinned to the COMPLEMENTARY cores via $CONSENTMD_TASKSET so it
# never competes with the system under test for CPU.
TASKSET_PREFIX=()
if [ -n "${CONSENTMD_TASKSET:-}" ] && command -v taskset >/dev/null 2>&1; then
	TASKSET_PREFIX=(taskset -c "$CONSENTMD_TASKSET")
	echo "load generator pinned to cores: $CONSENTMD_TASKSET"
fi

run_scenario() {
	local scenario="$1" module="$2" rblock="$3" args="$4"
	for run in $(seq 1 "$RUNS"); do
		export CONSENTMD_RUN_LABEL="${scenario}.run${run}"
		echo "--- $scenario  run $run/$RUNS  ($(date -u +%H:%M:%SZ)) ---"
		write_config "$scenario" "$module" "$rblock" "$args"
		"${TASKSET_PREFIX[@]}" npx caliper launch manager \
			--caliper-workspace ./ \
			--caliper-networkconfig "$NETWORK_CONFIG" \
			--caliper-benchconfig "$TMP_CFG" \
			--caliper-flow-only-test \
			--caliper-report-path "$RESULTS_DIR/${scenario}-run${run}-report.html" \
			|| echo "!! $scenario run $run failed"
	done
}

WRITE_ARGS=$'          patientCount: 10\n          doctorCount: 1\n          recordsPerPatient: 1\n          seedConsentRatio: 0'
read_args() { printf '          patientCount: 10\n          doctorCount: 5\n          recordsPerPatient: 3\n          seedConsentRatio: 0.9\n          unauthorizedReadRatio: %s' "$1"; }

# ---- write: saturation curve (fixed-rate) + sustained (fixed-load) --------
for r in $WRITE_RATES; do
	run_scenario "write-saturation-${r}" "workloads/write-saturation.js" "$(rate_block fixed-rate "$r")" "$WRITE_ARGS"
done
if [ "$FIXED_LOAD" -gt 0 ] 2>/dev/null; then
	run_scenario "write-sustained" "workloads/write-saturation.js" "$(rate_block fixed-load "$FIXED_LOAD")" "$WRITE_ARGS"
fi

# ---- read: saturation curve (fixed-rate) + sustained (fixed-load) ---------
for mode in $MODES; do
	case "$mode" in
		authorized) ratio=0 ;;
		enabled) ratio="$UNAUTH_RATIO" ;;
		*) echo "Unknown mode: $mode"; continue ;;
	esac
	ARGS="$(read_args "$ratio")"
	for r in $READ_RATES; do
		run_scenario "read-${mode}-${r}" "workloads/record-access.js" "$(rate_block fixed-rate "$r")" "$ARGS"
	done
	if [ "$FIXED_LOAD" -gt 0 ] 2>/dev/null; then
		run_scenario "read-${mode}-sustained" "workloads/record-access.js" "$(rate_block fixed-load "$FIXED_LOAD")" "$ARGS"
	fi
done

kill "$MONITOR_PID" 2>/dev/null || true
rm -f "$TMP_CFG"

echo
echo "=== Aggregating sweep ==="
node src/aggregate-results.js "$RESULTS_DIR"
if command -v python3 >/dev/null && python3 -c 'import matplotlib' 2>/dev/null; then
	python3 monitoring/plot-resources.py "$RESULTS_DIR/resource-usage.csv" "$RESULTS_DIR/figures" || true
fi
echo "Sweep complete. Tables in $RESULTS_DIR/summary.md"
