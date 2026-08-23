#!/usr/bin/env bash
#
# ConsentMD — one-shot evaluation orchestrator
# ============================================
#
# From a git clone on a fresh Ubuntu/Azure VM, this configures, provisions, and
# runs the ENTIRE evaluation used for the paper, then collects every artifact
# into a single results directory with an index.
#
#   ./evaluate.sh --install            # first run on a fresh VM (installs deps; needs sudo)
#   ./evaluate.sh                       # full paper run (10 repetitions per benchmark)
#   ./evaluate.sh --quick               # fast end-to-end smoke (~10 min) to validate the pipeline
#   ./evaluate.sh --runs 10             # explicit repetition count
#   ./evaluate.sh --skip-network        # network already up + chaincode deployed
#
# Phases: preflight -> [install] -> network -> deploy -> profiles -> npm ->
#         identities -> smoke -> benchmarks -> experiments -> baseline ->
#         [api+file-storage] -> collect.
# Every phase is timed; a summary and an INDEX.md are written at the end.
# Re-running is safe: an already-up network / committed chaincode is detected
# and skipped.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"
export PATH="$REPO/bin:$PATH"
export COUCHDB_USER="${COUCHDB_USER:-admin}"
export COUCHDB_PASSWORD="${COUCHDB_PASSWORD:-adminpassword}"
# blockchain/scripts/envVar.sh reads these unguarded; default them for `set -u`.
export OVERRIDE_ORG="${OVERRIDE_ORG:-}" VERBOSE="${VERBOSE:-false}"

SUITE="$REPO/blockchain/caliper/caliper-benchmarks-local"
SCRIPTS="$REPO/blockchain/scripts"
ARTIFACTS="$REPO/blockchain/artifacts"

# ---- options --------------------------------------------------------------
DO_INSTALL=false
QUICK=false
PAPER=false
RUNS=10
BENCHMARKS="consent-granting record-access consent-revocation mixed-workload"
SKIP_NETWORK=false
WITH_API=false
CONSTRAIN=""        # e.g. "0-3": pin the Fabric SUT to these CPU cores for a controlled envelope
SWEEP_DURATION=""   # seconds per sweep round; empty = run-sweep.sh default (300)
STAMP="$(date +%Y%m%d_%H%M%S)"
RESULTS_DIR="$REPO/evaluation-results/$STAMP"

while [ $# -gt 0 ]; do
	case "$1" in
		--install) DO_INSTALL=true; shift ;;
		--quick) QUICK=true; RUNS=1; shift ;;
		--paper) PAPER=true; shift ;;
		--constrain) CONSTRAIN="$2"; shift 2 ;;
		--sweep-duration) SWEEP_DURATION="$2"; shift 2 ;;
		--runs) RUNS="$2"; shift 2 ;;
		--benchmarks) BENCHMARKS="$2"; shift 2 ;;
		--skip-network) SKIP_NETWORK=true; shift ;;
		--with-api) WITH_API=true; shift ;;
		--results-dir) RESULTS_DIR="$2"; shift 2 ;;
		-h|--help) sed -n '2,30p' "$0"; exit 0 ;;
		*) echo "Unknown option: $1" >&2; exit 1 ;;
	esac
done

mkdir -p "$RESULTS_DIR"
MASTER_LOG="$RESULTS_DIR/evaluate.log"
exec > >(tee -a "$MASTER_LOG") 2>&1

# ---- resource-constraint envelope (--constrain "0-3") ---------------------
# Pin the Fabric SUT to the given CPU cores and run the load generator on the
# complementary cores, for a controlled, reproducible throughput measurement.
COMPOSE_MAIN=(docker compose)
CONSTRAIN_NOTE="none (host default)"
if [ -n "$CONSTRAIN" ]; then
	COMPOSE_MAIN=(docker compose -f docker-compose.yaml -f docker-compose.limits.yaml)
	export CCAAS_CPUSET="$CONSTRAIN" CCAAS_MEM="${CCAAS_MEM:-1g}"
	# Load generator gets the cores above the SUT's highest pinned core.
	SUT_MAX="${CONSTRAIN##*-}"; NCPU="$(nproc)"
	if [ "$SUT_MAX" -lt "$((NCPU - 1))" ] 2>/dev/null; then
		export CONSENTMD_TASKSET="$((SUT_MAX + 1))-$((NCPU - 1))"
	fi
	CONSTRAIN_NOTE="SUT pinned to cores ${CONSTRAIN}; load gen on cores ${CONSENTMD_TASKSET:-shared}; mem caps per docker-compose.limits.yaml"
fi

# ---- helpers --------------------------------------------------------------
BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
declare -a PHASE_NAMES PHASE_SECS PHASE_STATUS
PHASE_START=0
banner() { printf "\n${BLUE}==== [%s] %s ====${NC}\n" "$(date +%H:%M:%S)" "$*"; PHASE_START=$(date +%s); }
end_phase() {
	local name="$1" status="${2:-ok}"
	PHASE_NAMES+=("$name"); PHASE_SECS+=("$(( $(date +%s) - PHASE_START ))"); PHASE_STATUS+=("$status")
}
die() { printf "${RED}FATAL: %s${NC}\n" "$*" >&2; exit 1; }
chaincode_up() {
	( cd "$SCRIPTS" && . envVar.sh >/dev/null 2>&1 && setGlobals 1 >/dev/null 2>&1 \
		&& peer chaincode query -C mychannel -n medicalconsent -c '{"function":"whoAmI","Args":[]}' >/dev/null 2>&1 )
}

echo "ConsentMD evaluation — $STAMP"
echo "profile: $([ "$QUICK" = true ] && echo quick || echo paper) | runs=$RUNS | results=$RESULTS_DIR"
echo "resource envelope: $CONSTRAIN_NOTE"

# ---- 0. preflight ---------------------------------------------------------
banner "Preflight"
command -v docker >/dev/null || die "docker not found. Run with --install on a fresh VM, or install Docker."
docker info >/dev/null 2>&1 || die "docker daemon not reachable (is Docker running / your user in the docker group?)."
if [ "$DO_INSTALL" = false ]; then
	command -v node >/dev/null || die "node not found. Re-run with --install."
	[ -x "$REPO/bin/peer" ] || die "Fabric binaries missing in ./bin. Re-run with --install."
fi
end_phase preflight

# ---- 1. install (optional) ------------------------------------------------
if [ "$DO_INSTALL" = true ]; then
	banner "Installing system dependencies (install.sh)"
	bash "$REPO/install.sh"
	end_phase install
fi

# ---- 2. network + 3. deploy ----------------------------------------------
if [ "$SKIP_NETWORK" = true ] || chaincode_up; then
	banner "Network + chaincode (already up — skipping bring-up)"
	chaincode_up || die "--skip-network given but chaincode is not answering."
	end_phase network skipped
else
	banner "Bringing up the Fabric network"
	( cd "$ARTIFACTS/channel/create-certificate-with-ca" && docker compose up -d )
	sleep 8
	if [ ! -d "$ARTIFACTS/channel/crypto-config" ]; then
		( cd "$ARTIFACTS/channel/create-certificate-with-ca" && ./create-certificate-with-ca.sh )
	fi
	( cd "$ARTIFACTS/channel" && ./create-artifacts.sh )
	( cd "$ARTIFACTS" && "${COMPOSE_MAIN[@]}" up -d )
	sleep 12
	( cd "$SCRIPTS" && ./createChannel.sh )
	end_phase network

	banner "Deploying chaincode (CCaaS)"
	( cd "$SCRIPTS" && ./deploy-chaincode-ccaas.sh )
	end_phase deploy
fi

# ---- 4. connection profiles ----------------------------------------------
banner "Generating connection profiles"
( cd "$REPO/api/connection-profiles" && bash generate-ccp.sh )
end_phase profiles

# ---- 5. npm installs ------------------------------------------------------
banner "Installing Node dependencies (suite, experiments, baseline)"
( cd "$SUITE" && npm install --no-audit --no-fund >/dev/null )
( cd "$REPO/experiments" && npm install --no-audit --no-fund >/dev/null )
for d in read-bottleneck security-bypass; do ( cd "$REPO/experiments/$d" && npm install --no-audit --no-fund >/dev/null ); done
( cd "$REPO/baseline" && npm install --no-audit --no-fund >/dev/null )
end_phase npm

# ---- 6. identities --------------------------------------------------------
banner "Provisioning CA-enrolled benchmark identities"
( cd "$SUITE" && node setup/provision-identities.js --patients 20 --doctors 10 )
end_phase identities

# ---- 7. smoke -------------------------------------------------------------
banner "Smoke test (minimal consent-granting)"
( cd "$SUITE" && ./run-single-benchmark.sh minimal-consent-granting >/dev/null )
end_phase smoke

# ---- 8. benchmark campaign ------------------------------------------------
if [ "$QUICK" = true ]; then
	banner "Benchmark campaign (quick: one short suite launch)"
	QRES="$SUITE/results/quick_$STAMP"; mkdir -p "$QRES"
	( cd "$SUITE" && CONSENTMD_RESULTS_DIR="$QRES" CONSENTMD_RUN_LABEL="suite.run1" \
		npx caliper launch manager --caliper-workspace ./ \
		--caliper-networkconfig networks/fabric/bench-network.yaml \
		--caliper-benchconfig benchmarks/consent-management-suite.yaml \
		--caliper-flow-only-test --caliper-report-path "$QRES/suite-report.html" \
		&& node src/aggregate-results.js "$QRES" >/dev/null )
	CAMPAIGN_DIR="$QRES"
elif [ "$PAPER" = true ]; then
	banner "Benchmark campaign (paper rate sweep: Tables 2 & 3, $RUNS runs/rate)"
	SWEEP_ARGS=(--runs "$RUNS")
	[ -n "$SWEEP_DURATION" ] && SWEEP_ARGS+=(--duration "$SWEEP_DURATION")
	( cd "$SUITE" && ./run-sweep.sh "${SWEEP_ARGS[@]}" ) || end_phase benchmarks partial
	CAMPAIGN_DIR="$(ls -td "$SUITE"/results/sweep_* 2>/dev/null | head -1)"
else
	banner "Benchmark campaign ($RUNS runs x [$BENCHMARKS])"
	( cd "$SUITE" && ./run-benchmarks.sh --runs "$RUNS" --benchmarks "$BENCHMARKS" ) || end_phase benchmarks partial
	CAMPAIGN_DIR="$(ls -td "$SUITE"/results/2* 2>/dev/null | head -1)"
fi
[ -n "${CAMPAIGN_DIR:-}" ] && end_phase benchmarks || end_phase benchmarks partial

# ---- 9. experiments -------------------------------------------------------
banner "Provisioning experiment fixtures"
( cd "$REPO/experiments" && node setup-fixtures.js --out "$RESULTS_DIR/fixtures.json" )
# The ids are X.509 DNs (contain spaces and slashes), so read the JSON with a
# JSON parser rather than sourcing shell KEY=VALUE lines.
read_fixture() { node -e "process.stdout.write(String(require('$RESULTS_DIR/fixtures.json')['$1']||''))"; }
RECORD_ID="$(read_fixture RECORD_ID)"
DOCTOR_ID="$(read_fixture DOCTOR_ID)"
GATEWAY_IDENTITY="$(read_fixture GATEWAY_IDENTITY)"
GATEWAY_ORG="$(read_fixture GATEWAY_ORG)"
WALLET_DIR="$(read_fixture WALLET_DIR)"
[ -n "$RECORD_ID" ] && [ -n "$DOCTOR_ID" ] || die "fixture provisioning did not yield a record/doctor id"
echo "fixture record: $RECORD_ID"
end_phase fixtures

RB_SAMPLES=$([ "$QUICK" = true ] && echo 50 || echo 200)
banner "Experiment: read-path attribution ($RB_SAMPLES samples/arm)"
( cd "$REPO/experiments/read-bottleneck" && bash run.sh \
	--record-id "$RECORD_ID" --gateway-identity "$GATEWAY_IDENTITY" --gateway-org "$GATEWAY_ORG" \
	--doctor-id "$DOCTOR_ID" --samples "$RB_SAMPLES" --warmup 10 --skip-peer --as-localhost ) \
	|| end_phase read-bottleneck partial
end_phase read-bottleneck

banner "Experiment: security bypass (compromised gateway)"
( cd "$REPO/experiments/security-bypass" && \
	DOCTOR_ORG=org2 DOCTOR_IDENTITY=bench_doctor_0 \
	OWNER_ORG=org1 OWNER_IDENTITY=bench_patient_0 \
	OTHER_PATIENT_ORG=org1 OTHER_PATIENT_IDENTITY=bench_patient_1 \
	RECORD_ID="$RECORD_ID" WALLET_DIR="$WALLET_DIR" DISCOVERY_AS_LOCALHOST=true \
	node bypass-test.js | tee "$RESULTS_DIR/security-bypass.txt" ) || end_phase security-bypass FAIL
end_phase security-bypass

# ---- 10. baseline ---------------------------------------------------------
banner "Baseline (non-blockchain) comparison"
BASE_TPS=$([ "$QUICK" = true ] && echo 50 || echo 100)
BASE_DUR=$([ "$QUICK" = true ] && echo 10 || echo 30)
BASE_RUNS=$([ "$QUICK" = true ] && echo 2 || echo 10)
( cd "$REPO/baseline" && ./run-comparison.sh --patients 20 --doctors 10 --records-per-patient 15 \
	--tps "$BASE_TPS" --duration "$BASE_DUR" --runs "$BASE_RUNS" --workload mixed ) \
	|| end_phase baseline partial
end_phase baseline

# ---- 11. api + file-storage (optional) ------------------------------------
if [ "$WITH_API" = true ]; then
	banner "API + file-storage benchmark (experimental)"
	echo "${YELLOW}NOTE: the API tier has known open issues (see EVALUATION.md); enable only for the file-storage arm.${NC}"
	end_phase api skipped
fi

# ---- 12. collect ----------------------------------------------------------
banner "Collecting artifacts into $RESULTS_DIR"
mkdir -p "$RESULTS_DIR/benchmarks" "$RESULTS_DIR/read-bottleneck" "$RESULTS_DIR/baseline"
[ -n "${CAMPAIGN_DIR:-}" ] && [ -d "$CAMPAIGN_DIR" ] && cp -r "$CAMPAIGN_DIR"/. "$RESULTS_DIR/benchmarks/" 2>/dev/null || true
cp -r "$REPO/experiments/read-bottleneck/results/." "$RESULTS_DIR/read-bottleneck/" 2>/dev/null || true
LATEST_BASELINE="$(ls -td "$REPO"/baseline/results/* 2>/dev/null | head -1)"
[ -n "$LATEST_BASELINE" ] && cp -r "$LATEST_BASELINE/." "$RESULTS_DIR/baseline/" 2>/dev/null || true

# Regenerate figures into the collected tree if matplotlib is present.
if [ -f "$RESULTS_DIR/benchmarks/resource-usage.csv" ] && python3 -c 'import matplotlib' 2>/dev/null; then
	python3 "$SUITE/monitoring/plot-resources.py" "$RESULTS_DIR/benchmarks/resource-usage.csv" "$RESULTS_DIR/benchmarks/figures" || true
fi

# ---- index + summary ------------------------------------------------------
{
	echo "# ConsentMD evaluation results — $STAMP"
	echo
	echo "Profile: $([ "$QUICK" = true ] && echo quick || echo paper) · benchmark runs: $RUNS"
	echo
	echo "Resource envelope: $CONSTRAIN_NOTE"
	echo
	echo "## Where each artifact lives"
	echo "- \`benchmarks/summary.md\` — throughput mean±std, p50/p95/p99, dataset sizes, failure counts"
	echo "- \`benchmarks/summary.csv\` — per-run rows for plotting"
	echo "- \`benchmarks/figures/\` — 300-DPI CPU + memory figures"
	echo "- \`benchmarks/*-report.html\` — Caliper's own per-run reports"
	echo "- \`read-bottleneck/summary.csv\` — CouchDB (indexed/no-index) vs gateway read latency"
	echo "- \`security-bypass.txt\` — compromised-gateway assertion matrix"
	echo "- \`baseline/aggregate.json\` — non-blockchain reference numbers"
	echo "- \`fixtures.json\` — the record/doctor ids used by the experiments"
	echo "- \`evaluate.log\` — full run log"
	echo
	echo "## Phase timings"
	echo "| phase | seconds | status |"
	echo "|---|---:|---|"
	for i in "${!PHASE_NAMES[@]}"; do
		printf "| %s | %s | %s |\n" "${PHASE_NAMES[$i]}" "${PHASE_SECS[$i]}" "${PHASE_STATUS[$i]}"
	done
} > "$RESULTS_DIR/INDEX.md"

TOTAL=0; for s in "${PHASE_SECS[@]}"; do TOTAL=$((TOTAL + s)); done
printf "\n${GREEN}Done in %dm %ds.${NC} Results: %s\n" $((TOTAL/60)) $((TOTAL%60)) "$RESULTS_DIR"
echo "Read $RESULTS_DIR/INDEX.md first."
FAILED=false
for st in "${PHASE_STATUS[@]}"; do [ "$st" = "FAIL" ] && FAILED=true; done
$FAILED && { printf "${RED}One or more phases FAILED — see the summary above.${NC}\n"; exit 1; } || true
