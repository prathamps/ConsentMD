#!/usr/bin/env bash
#
# Read-path latency attribution for ConsentMD (reviewer item 5).
#
# Answers "why are reads slow, and where does the time go?" by timing the SAME
# logical read at three layers of the stack, N samples each:
#
#   (a) database   : direct CouchDB _find against the peer's state DB,
#                    once WITH the consent-lookup index and once WITHOUT it
#                    (the index design doc is deleted and restored here).
#   (b) blockchain : `peer chaincode query` via docker exec — peer endorsement
#                    + chaincode execution + state read, no Node gateway.
#   (c) full path  : the fabric-network SDK gateway, exactly as the API uses it.
#
# Output: a printed attribution table + results/summary.csv (+ raw_*.csv).
#
# The network must already be UP. This script only measures; it never starts,
# stops, or seeds the network, and it always restores the index it removes.

set -euo pipefail

# --------------------------------------------------------------------------
# Defaults (all overridable by flag or environment)
# --------------------------------------------------------------------------
SAMPLES="${SAMPLES:-200}"
WARMUP="${WARMUP:-5}"
RECORD_ID="${RECORD_ID:-}"
DOCTOR_ID="${DOCTOR_ID:-}"
GATEWAY_ORG="${GATEWAY_ORG:-org1}"
GATEWAY_IDENTITY="${GATEWAY_IDENTITY:-}"
CHANNEL="${CHANNEL:-mychannel}"
CC_NAME="${CC_NAME:-medicalconsent}"

# CouchDB creds default to blockchain/artifacts/.env, else admin/adminpassword.
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)/blockchain/artifacts/.env}"
COUCHDB_USER="${COUCHDB_USER:-}"
COUCHDB_PASSWORD="${COUCHDB_PASSWORD:-}"
COUCHDB_HOST="${COUCHDB_HOST:-localhost}"
COUCHDB_PORT="${COUCHDB_PORT:-5984}"      # 5984 = couchdb0 (peer0.org1); 6984 = couchdb1 (peer0.org2)
STATE_DB="${STATE_DB:-mychannel_medicalconsent}"
INDEX_DDOC="${INDEX_DDOC:-idxConsentLookupDoc}"
INDEX_NAME="${INDEX_NAME:-index-consent-lookup}"

# Peer arm.
PEER_CONTAINER="${PEER_CONTAINER:-peer0.org1.example.com}"
PEER_QUERY_FN="${PEER_QUERY_FN:-getRecordById}"

# Gateway arm: remap discovered internal hostnames (peer0.org1.example.com, …)
# to localhost. Required when running on the docker HOST rather than inside the
# fabric network; leave false when the discovered endpoints resolve directly.
AS_LOCALHOST="${AS_LOCALHOST:-false}"

SKIP_NOINDEX="${SKIP_NOINDEX:-false}"
SKIP_PEER="${SKIP_PEER:-false}"
SKIP_GATEWAY="${SKIP_GATEWAY:-false}"

usage() {
	cat <<EOF
Usage: $0 --record-id <id> --gateway-identity <walletLabel> [options]

Required:
  --record-id <id>            Record to read in every arm. The gateway identity
                              MUST be authorized to read it (owner patient, or a
                              doctor with active consent).
  --gateway-identity <label>  Wallet identity label for the SDK gateway arm.

Common options (env var in parentheses):
  -n, --samples <N>           Samples per arm            (SAMPLES, default 200)
      --warmup <N>            Discarded warmup calls      (WARMUP, default 5)
      --doctor-id <id>        Doctor X.509 id for the CouchDB consent selector
                              (DOCTOR_ID; defaults to the gateway identity's id)
      --gateway-org <org>     org1|org2                  (GATEWAY_ORG, org1)
      --couchdb-port <p>      5984 org1 | 6984 org2      (COUCHDB_PORT, 5984)
      --state-db <name>       CouchDB state DB           ($STATE_DB)
      --peer-container <c>    docker container for peer  ($PEER_CONTAINER)
      --peer-fn <fn>          chaincode fn for peer arm  ($PEER_QUERY_FN)
      --as-localhost          Remap discovered hostnames to localhost for the
                              gateway arm (AS_LOCALHOST; needed on the host)
      --skip-noindex          Skip the un-indexed CouchDB arm
      --skip-peer             Skip the peer arm
      --skip-gateway          Skip the gateway arm
  -h, --help
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		-n|--samples) SAMPLES="$2"; shift 2 ;;
		--warmup) WARMUP="$2"; shift 2 ;;
		--record-id) RECORD_ID="$2"; shift 2 ;;
		--doctor-id) DOCTOR_ID="$2"; shift 2 ;;
		--gateway-identity) GATEWAY_IDENTITY="$2"; shift 2 ;;
		--gateway-org) GATEWAY_ORG="$2"; shift 2 ;;
		--couchdb-port) COUCHDB_PORT="$2"; shift 2 ;;
		--state-db) STATE_DB="$2"; shift 2 ;;
		--peer-container) PEER_CONTAINER="$2"; shift 2 ;;
		--peer-fn) PEER_QUERY_FN="$2"; shift 2 ;;
		--as-localhost) AS_LOCALHOST=true; shift ;;
		--skip-noindex) SKIP_NOINDEX=true; shift ;;
		--skip-peer) SKIP_PEER=true; shift ;;
		--skip-gateway) SKIP_GATEWAY=true; shift ;;
		-h|--help) usage; exit 0 ;;
		*) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
	esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS="$HERE/results"
mkdir -p "$RESULTS"

die() { printf 'ERROR: %b\n' "$*" >&2; exit 1; }
note() { printf '>>> %s\n' "$*" >&2; }

# --------------------------------------------------------------------------
# Load CouchDB creds from the compose .env if not already provided.
# --------------------------------------------------------------------------
if [[ -z "$COUCHDB_USER" || -z "$COUCHDB_PASSWORD" ]] && [[ -f "$ENV_FILE" ]]; then
	# shellcheck disable=SC1090
	COUCHDB_USER="${COUCHDB_USER:-$(grep -E '^COUCHDB_USER=' "$ENV_FILE" | cut -d= -f2- || true)}"
	COUCHDB_PASSWORD="${COUCHDB_PASSWORD:-$(grep -E '^COUCHDB_PASSWORD=' "$ENV_FILE" | cut -d= -f2- || true)}"
fi
COUCHDB_USER="${COUCHDB_USER:-admin}"
COUCHDB_PASSWORD="${COUCHDB_PASSWORD:-adminpassword}"
COUCHDB_BASE="http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@${COUCHDB_HOST}:${COUCHDB_PORT}"
COUCHDB_REDACTED="http://***@${COUCHDB_HOST}:${COUCHDB_PORT}"

# --------------------------------------------------------------------------
# Preflight (fail fast, with actionable messages)
# --------------------------------------------------------------------------
note "Preflight checks..."
command -v node >/dev/null 2>&1 || die "node not found on PATH (Node >= 18 required)."
command -v docker >/dev/null 2>&1 || die "docker not found on PATH."
command -v curl >/dev/null 2>&1 || die "curl not found on PATH."

[[ -n "$RECORD_ID" ]] || { usage; die "--record-id is required."; }
[[ -n "$GATEWAY_IDENTITY" ]] || { usage; die "--gateway-identity is required."; }

# CouchDB reachable + DB exists.
db_status="$(curl -s -o /dev/null -w '%{http_code}' "${COUCHDB_BASE}/${STATE_DB}" || true)"
[[ "$db_status" == "200" ]] || die "CouchDB DB '${STATE_DB}' not reachable at ${COUCHDB_REDACTED} (HTTP ${db_status}). Is the network up? Try --couchdb-port 6984 for org2."

# Peer container running.
if [[ "$SKIP_PEER" != "true" ]]; then
	running="$(docker inspect -f '{{.State.Running}}' "$PEER_CONTAINER" 2>/dev/null || echo missing)"
	[[ "$running" == "true" ]] || die "peer container '$PEER_CONTAINER' is not running (docker inspect said: $running). Start the network or pass --peer-container / --skip-peer."
fi

# Gateway deps installed.
if [[ "$SKIP_GATEWAY" != "true" ]]; then
	if [[ ! -d "$HERE/node_modules/fabric-network" ]]; then
		note "Installing gateway dependencies (fabric-network)..."
		( cd "$HERE" && npm install --no-audit --no-fund ) || die "npm install failed in $HERE."
	fi
fi

DOCTOR_ID="${DOCTOR_ID:-$GATEWAY_IDENTITY}"

# Clean any stale raw files so aggregate.js only sees this run.
rm -f "$RESULTS"/raw_*.csv "$RESULTS"/summary.csv

# --------------------------------------------------------------------------
# Index backup + restore-on-exit trap (restores even on failure / Ctrl-C).
# --------------------------------------------------------------------------
IDX_BACKUP="$RESULTS/.index-backup.json"
INDEX_DELETED=false
restore_index() {
	if [[ "$INDEX_DELETED" == "true" ]]; then
		note "Restoring CouchDB index _design/${INDEX_DDOC}..."
		node "$HERE/couchdb-index.js" restore --url "$COUCHDB_BASE" --db "$STATE_DB" --ddoc "$INDEX_DDOC" --file "$IDX_BACKUP" \
			|| echo "WARNING: index restore failed; recreate it with deployChaincode or by re-installing the chaincode." >&2
		INDEX_DELETED=false
	fi
}
trap restore_index EXIT INT TERM

# ==========================================================================
# (a) CouchDB direct _find
# ==========================================================================
note "[a] CouchDB _find WITH index (${SAMPLES} samples)..."
node "$HERE/couchdb-timing.js" \
	--url "$COUCHDB_BASE" --db "$STATE_DB" --n "$SAMPLES" --warmup "$WARMUP" --use-index \
	--index-ddoc "$INDEX_DDOC" --index-name "$INDEX_NAME" \
	--record-id "$RECORD_ID" --doctor-id "$DOCTOR_ID" \
	--out "$RESULTS/raw_couchdb_find_indexed.csv"

if [[ "$SKIP_NOINDEX" != "true" ]]; then
	note "[a] Backing up + deleting index, then CouchDB _find WITHOUT index..."
	node "$HERE/couchdb-index.js" backup --url "$COUCHDB_BASE" --db "$STATE_DB" --ddoc "$INDEX_DDOC" --file "$IDX_BACKUP"
	if [[ -f "$IDX_BACKUP" ]]; then
		node "$HERE/couchdb-index.js" delete --url "$COUCHDB_BASE" --db "$STATE_DB" --ddoc "$INDEX_DDOC"
		INDEX_DELETED=true
		node "$HERE/couchdb-timing.js" \
			--url "$COUCHDB_BASE" --db "$STATE_DB" --n "$SAMPLES" --warmup "$WARMUP" \
			--record-id "$RECORD_ID" --doctor-id "$DOCTOR_ID" \
			--out "$RESULTS/raw_couchdb_find_noindex.csv"
		restore_index
	else
		echo "WARNING: no index backup produced (index may not exist); skipping the no-index arm." >&2
	fi
fi

# ==========================================================================
# (b) peer chaincode query via docker exec
# ==========================================================================
if [[ "$SKIP_PEER" != "true" ]]; then
	note "[b] peer chaincode query in '$PEER_CONTAINER' (fn=${PEER_QUERY_FN})..."
	CTOR="$(printf '{"function":"%s","Args":["%s"]}' "$PEER_QUERY_FN" "$RECORD_ID")"
	peer_query() { docker exec "$PEER_CONTAINER" peer chaincode query -C "$CHANNEL" -n "$CC_NAME" -c "$CTOR" 2>&1; }

	pf_out="$(peer_query || true)"
	if echo "$pf_out" | grep -q 'ACCESS_DENIED'; then
		note "peer arm: query returns ACCESS_DENIED (the container's identity carries no 'organization' attribute)."
		note "         This still measures the full peer+chaincode+state-read path up to the policy decision."
		note "         For an authorized read, run peer as an enrolled identity (see README) or use --peer-fn getMyId."
	elif ! echo "$pf_out" | grep -qiE 'NOT_FOUND|does not exist' && [[ -z "$pf_out" || "$pf_out" == *"Error"* || "$pf_out" == *"error"* ]]; then
		die "peer preflight query failed:\n$pf_out\nCheck --peer-container, that the chaincode '$CC_NAME' is committed on '$CHANNEL', and that the CLI can sign (FABRIC_CFG_PATH/core.yaml)."
	fi

	RAW_PEER="$RESULTS/raw_peer_query.csv"
	echo "latency_ms" > "$RAW_PEER"
	total=$(( SAMPLES + WARMUP ))
	for (( i=0; i<total; i++ )); do
		start_ns="$(date +%s%N)"
		peer_query >/dev/null 2>&1 || true
		end_ns="$(date +%s%N)"
		if (( i >= WARMUP )); then
			awk -v s="$start_ns" -v e="$end_ns" 'BEGIN { printf "%.4f\n", (e - s) / 1000000 }' >> "$RAW_PEER"
		fi
	done
	note "[b] wrote $((total - WARMUP)) samples to $RAW_PEER"
fi

# ==========================================================================
# (c) SDK gateway
# ==========================================================================
if [[ "$SKIP_GATEWAY" != "true" ]]; then
	note "[c] SDK gateway getRecordById (${SAMPLES} samples)..."
	node "$HERE/gateway-timing.js" \
		--org "$GATEWAY_ORG" --identity "$GATEWAY_IDENTITY" --record-id "$RECORD_ID" \
		--fn getRecordById --channel "$CHANNEL" --cc-name "$CC_NAME" \
		--as-localhost "$AS_LOCALHOST" \
		--n "$SAMPLES" --warmup "$WARMUP" \
		--out "$RESULTS/raw_gateway_getRecordById.csv"

	# Bonus arm: the CouchDB rich-query read path end-to-end (safe: identical
	# policy, only the consent-lookup mechanism differs). Non-fatal if absent.
	note "[c] SDK gateway getRecordByIdRichQuery (rich-query consent lookup)..."
	node "$HERE/gateway-timing.js" \
		--org "$GATEWAY_ORG" --identity "$GATEWAY_IDENTITY" --record-id "$RECORD_ID" \
		--fn getRecordByIdRichQuery --channel "$CHANNEL" --cc-name "$CC_NAME" \
		--as-localhost "$AS_LOCALHOST" \
		--n "$SAMPLES" --warmup "$WARMUP" \
		--out "$RESULTS/raw_gateway_getRecordByIdRichQuery.csv" \
		|| echo "WARNING: rich-query gateway arm failed (function may not be deployed); continuing." >&2
fi

# ==========================================================================
# Aggregate
# ==========================================================================
note "Aggregating..."
node "$HERE/aggregate.js" "$RESULTS"
note "Done."
