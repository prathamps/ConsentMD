#!/bin/bash
#
# Deploy the medicalconsent chaincode as a SERVICE (CCaaS).
#
# Why not deployChaincode.sh?  That script asks the peer to BUILD a node
# chaincode image through its internal docker builder. On modern Docker
# Engines (API >= 1.40, i.e. Docker 25+) the peer 2.5 image's docker client
# (API 1.38) cannot talk to the daemon and the build dies with a broken pipe;
# on some hosts the node external builder also refuses `type: node`. Running
# the chaincode as an external service sidesteps the peer's builder entirely,
# so this path is Docker-version-independent and reproducible.
#
# Steps (all idempotent — safe to re-run):
#   1. package a tiny CCaaS package (connection.json -> code.tar.gz -> pkg)
#   2. install on both peers, capture the package id
#   3. approve for both orgs, commit the definition
#   4. build + run the chaincode server container on the fabric network
#   5. register the CouchDB state-DB indexes from META-INF (the CCaaS path
#      does not auto-install them, and without them consent reads are ~100x
#      slower — see experiments/read-bottleneck)
#   6. smoke-check with whoAmI
#
# Env overrides: CC_NAME, CC_VERSION, CC_SEQUENCE, CHANNEL_NAME,
#   COUCHDB_USER, COUCHDB_PASSWORD, FABRIC_NETWORK (docker network name).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
# envVar.sh's setGlobals reads OVERRIDE_ORG/VERBOSE unguarded; give them defaults
# so it is safe under `set -u`.
export OVERRIDE_ORG="${OVERRIDE_ORG:-}" VERBOSE="${VERBOSE:-false}"
. envVar.sh >/dev/null 2>&1 || { echo "envVar.sh not sourced (run from blockchain/scripts)"; exit 1; }

CC_NAME="${CC_NAME:-medicalconsent}"
CC_VERSION="${CC_VERSION:-1}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"
CHANNEL_NAME="${CHANNEL_NAME:-mychannel}"
CC_LABEL="${CC_NAME}_${CC_VERSION}"
CC_POLICY="OR('Org1MSP.peer','Org2MSP.peer')"
CC_SRC="$HERE/../artifacts/chaincode/javascript"
CC_IMAGE="${CC_NAME}-ccaas:${CC_VERSION}"
CC_CONTAINER="${CC_NAME}-ccaas"
CC_ADDRESS="${CC_CONTAINER}:9999"
FABRIC_NETWORK="${FABRIC_NETWORK:-artifacts_test}"
COUCHDB_USER="${COUCHDB_USER:-admin}"
COUCHDB_PASSWORD="${COUCHDB_PASSWORD:-adminpassword}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { printf '\033[0;34m>>> %s\033[0m\n' "$*"; }

# --------------------------------------------------------------------------
# 1. Package
# --------------------------------------------------------------------------
log "Packaging CCaaS definition ($CC_LABEL)"
cat > "$WORK/connection.json" <<EOF
{ "address": "${CC_ADDRESS}", "dial_timeout": "10s", "tls_required": false }
EOF
printf '{"type":"ccaas","label":"%s"}\n' "$CC_LABEL" > "$WORK/metadata.json"
( cd "$WORK" && tar czf code.tar.gz connection.json && tar czf "${CC_NAME}.tar.gz" metadata.json code.tar.gz )
PKG="$WORK/${CC_NAME}.tar.gz"

# --------------------------------------------------------------------------
# 2. Install on both peers (skip if this exact label is already installed)
# --------------------------------------------------------------------------
install_one() {
	local org="$1"
	setGlobals "$org" >/dev/null
	if peer lifecycle chaincode queryinstalled 2>/dev/null | grep -q "Label: ${CC_LABEL}"; then
		log "org$org: ${CC_LABEL} already installed"
	else
		log "org$org: installing ${CC_LABEL}"
		peer lifecycle chaincode install "$PKG"
	fi
}
install_one 1
install_one 2

setGlobals 1 >/dev/null
PKG_ID="$(peer lifecycle chaincode queryinstalled 2>/dev/null | sed -n "s/^Package ID: \(${CC_LABEL}:[a-f0-9]*\).*/\1/p" | head -1)"
[ -n "$PKG_ID" ] || { echo "could not determine package id for ${CC_LABEL}"; exit 1; }
log "Package ID: $PKG_ID"

# --------------------------------------------------------------------------
# 3. Approve + commit (skip commit if already committed at this sequence)
# --------------------------------------------------------------------------
if setGlobals 1 >/dev/null && peer lifecycle chaincode querycommitted \
	--channelID "$CHANNEL_NAME" --name "$CC_NAME" 2>/dev/null | grep -q "Sequence: ${CC_SEQUENCE},"; then
	log "Definition already committed at sequence ${CC_SEQUENCE}; skipping approve/commit"
else
	for org in 1 2; do
		setGlobals "$org" >/dev/null
		log "org$org: approving"
		peer lifecycle chaincode approveformyorg -o localhost:7050 \
			--ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
			--channelID "$CHANNEL_NAME" --name "$CC_NAME" --version "$CC_VERSION" \
			--package-id "$PKG_ID" --sequence "$CC_SEQUENCE" --signature-policy "$CC_POLICY"
	done
	setGlobals 1 >/dev/null
	log "Committing definition"
	peer lifecycle chaincode commit -o localhost:7050 \
		--ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
		--channelID "$CHANNEL_NAME" --name "$CC_NAME" --version "$CC_VERSION" \
		--sequence "$CC_SEQUENCE" --signature-policy "$CC_POLICY" \
		--peerAddresses localhost:7051 --tlsRootCertFiles "$PEER0_ORG1_CA" \
		--peerAddresses localhost:9051 --tlsRootCertFiles "$PEER0_ORG2_CA"
fi

# --------------------------------------------------------------------------
# 4. Build + run the chaincode server container
# --------------------------------------------------------------------------
log "Building chaincode server image ($CC_IMAGE)"
BUILD="$WORK/image"
mkdir -p "$BUILD"
cp "$CC_SRC/package.json" "$CC_SRC/index.js" "$BUILD/"
cp -r "$CC_SRC/lib" "$BUILD/lib"
cat > "$BUILD/Dockerfile" <<'DOCKER'
FROM hyperledger/fabric-nodeenv:2.5
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./
COPY lib ./lib
CMD ["sh","-c","npx fabric-chaincode-node server --chaincode-address=0.0.0.0:9999 --chaincode-id=$CHAINCODE_ID"]
DOCKER
docker build -t "$CC_IMAGE" "$BUILD" >/dev/null
log "Chaincode image built"

docker rm -f "$CC_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CC_CONTAINER" --network "$FABRIC_NETWORK" \
	-e CHAINCODE_ID="$PKG_ID" "$CC_IMAGE" >/dev/null
log "Chaincode server running as $CC_CONTAINER on $FABRIC_NETWORK"

# --------------------------------------------------------------------------
# 5. Register CouchDB state-DB indexes (both peers' state DBs)
# --------------------------------------------------------------------------
STATE_DB="${CHANNEL_NAME}_${CC_NAME}"
IDX_DIR="$CC_SRC/META-INF/statedb/couchdb/indexes"
register_indexes() {
	local port="$1"
	local base="http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@localhost:${port}/${STATE_DB}"
	# Wait for the state DB to exist (created lazily on first write / channel join).
	for _ in $(seq 1 15); do
		[ "$(curl -s -o /dev/null -w '%{http_code}' "$base")" = "200" ] && break
		curl -s -X PUT "$base" >/dev/null 2>&1 || true
		sleep 1
	done
	for f in "$IDX_DIR"/*.json; do
		[ -f "$f" ] || continue
		curl -s -X POST "$base/_index" -H 'Content-Type: application/json' --data-binary "@$f" >/dev/null
	done
	log "Indexes registered on CouchDB :$port ($STATE_DB)"
}
register_indexes 5984
register_indexes 6984

# --------------------------------------------------------------------------
# 6. Smoke check
# --------------------------------------------------------------------------
log "Waiting for chaincode to answer..."
ok=false
for _ in $(seq 1 20); do
	setGlobals 1 >/dev/null
	if peer chaincode query -C "$CHANNEL_NAME" -n "$CC_NAME" -c '{"function":"whoAmI","Args":[]}' >/dev/null 2>&1; then
		ok=true; break
	fi
	sleep 2
done
$ok || { echo "chaincode did not answer whoAmI; check: docker logs $CC_CONTAINER"; exit 1; }
log "Chaincode deployed and answering. whoAmI ->"
peer chaincode query -C "$CHANNEL_NAME" -n "$CC_NAME" -c '{"function":"whoAmI","Args":[]}'
echo
