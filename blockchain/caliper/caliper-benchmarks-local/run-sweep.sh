#!/bin/bash
# Rate-sweep harness that reproduces the paper's Tables 2 and 3.
#
# Write saturation : record-creation transactions at 50/100/150/200/250 TPS.
# Read scalability : consent-checked reads at 300/600/1000 TPS, in two modes —
#                    authorized-only (no unauthorized reads) and
#                    authorization-enabled (a share of reads are correctly
#                    denied). Each (scenario, rate) is run N times; the
#                    aggregator reports mean +/- std across runs plus pooled
#                    p50/p95/p99, one row per rate — the shape of Tables 2/3.
#
# Usage:
#   ./run-sweep.sh [--runs N] [--duration S] [--write-rates "50 100 ..."]
#                  [--read-rates "300 600 1000"] [--modes "authorized enabled"]
#                  [--network FILE] [--monitor-interval S]
#
# Prerequisite: node setup/provision-identities.js (CA-enrolled identities).
set -euo pipefail
cd "$(dirname "$0")"

RUNS=10
DURATION=300
WRITE_RATES="50 100 150 200 250"
READ_RATES="300 600 1000"
MODES="authorized enabled"
NETWORK_CONFIG="networks/fabric/bench-network.yaml"
MONITOR_INTERVAL=5
WORKERS=2
UNAUTH_RATIO=0.2   # authorization-enabled mix

while [ $# -gt 0 ]; do
	case "$1" in
		--runs) RUNS="$2"; shift 2 ;;
		--duration) DURATION="$2"; shift 2 ;;
		--write-rates) WRITE_RATES="$2"; shift 2 ;;
		--read-rates) READ_RATES="$2"; shift 2 ;;
		--modes) MODES="$2"; shift 2 ;;
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
echo "runs=$RUNS duration=${DURATION}s workers=$WORKERS"
echo "write rates: $WRITE_RATES"
echo "read rates : $READ_RATES  modes: $MODES"
echo "results: $RESULTS_DIR"
echo

monitoring/collect-docker-stats.sh "$MONITOR_INTERVAL" "$RESULTS_DIR/resource-usage.csv" &
MONITOR_PID=$!
trap 'kill "$MONITOR_PID" 2>/dev/null || true' EXIT

TMP_CFG="$RESULTS_DIR/.round.yaml"

# Emit a one-round Caliper config for a given workload/rate/args.
write_config() {
	local label="$1" module="$2" tps="$3" args="$4"
	cat > "$TMP_CFG" <<EOF
test:
  name: $label
  workers:
    number: $WORKERS
  rounds:
    - label: $label
      txDuration: $DURATION
      rateControl:
        type: fixed-rate
        opts:
          tps: $tps
      workload:
        module: $module
        arguments:
$args
EOF
}

run_scenario() {
	local scenario="$1" module="$2" tps="$3" args="$4"
	for run in $(seq 1 "$RUNS"); do
		export CONSENTMD_RUN_LABEL="${scenario}.run${run}"
		echo "--- $scenario  run $run/$RUNS  (tps=$tps, $(date -u +%H:%M:%SZ)) ---"
		write_config "$scenario" "$module" "$tps" "$args"
		npx caliper launch manager \
			--caliper-workspace ./ \
			--caliper-networkconfig "$NETWORK_CONFIG" \
			--caliper-benchconfig "$TMP_CFG" \
			--caliper-flow-only-test \
			--caliper-report-path "$RESULTS_DIR/${scenario}-run${run}-report.html" \
			|| echo "!! $scenario run $run failed"
	done
}

# ---- write saturation -----------------------------------------------------
WRITE_ARGS=$'          patientCount: 10\n          doctorCount: 1\n          recordsPerPatient: 1\n          seedConsentRatio: 0'
for r in $WRITE_RATES; do
	run_scenario "write-saturation-${r}" "workloads/write-saturation.js" "$r" "$WRITE_ARGS"
done

# ---- read scalability -----------------------------------------------------
for mode in $MODES; do
	case "$mode" in
		authorized) ratio=0 ;;
		enabled) ratio="$UNAUTH_RATIO" ;;
		*) echo "Unknown mode: $mode"; continue ;;
	esac
	READ_ARGS=$(printf '          patientCount: 10\n          doctorCount: 5\n          recordsPerPatient: 3\n          seedConsentRatio: 0.9\n          unauthorizedReadRatio: %s' "$ratio")
	for r in $READ_RATES; do
		run_scenario "read-${mode}-${r}" "workloads/record-access.js" "$r" "$READ_ARGS"
	done
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
