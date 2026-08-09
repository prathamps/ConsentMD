# Read-path latency attribution (reviewer item 5)

> "You don't explain why reads are slow... test with vs. without a database
> index, or measure how much time is spent in each part of the system."

This experiment times the **same logical record read at three layers of the
stack** so the cost of a read can be attributed to *database vs. blockchain vs.
gateway* as a measurement rather than a guess, and measures the effect of the
CouchDB index directly by removing and restoring it.

## What each arm isolates

| Arm | Command | Includes | Excludes |
|-----|---------|----------|----------|
| **(a) CouchDB `_find`, indexed** | `couchdb-timing.js --use-index` | CouchDB Mango query with the consent-lookup index | peer, chaincode, SDK |
| **(a) CouchDB `_find`, no index** | `couchdb-timing.js` (index deleted) | same query, full collection scan | peer, chaincode, SDK |
| **(b) peer query** | `peer chaincode query` via `docker exec` | peer endorsement + chaincode execution + state read | Node SDK gateway, service discovery |
| **(c) SDK gateway** | `gateway-timing.js` | everything the API does: fabric-network gateway, discovery, endorsement, chaincode, state read | the HTTP/Express layer only |

Interpreting the numbers (the script prints these differences for you):

- **gateway − peer** = the SDK / gateway / service-discovery overhead.
- **peer − couchdb(indexed)** = peer gRPC + chaincode-container invocation cost.
- **couchdb(no index) − couchdb(indexed)** = the benefit of the index on the
  consent-lookup query the read path depends on.

The query used in arm (a) is byte-for-byte the selector the chaincode issues in
`ConsentRepository.isActiveViaRichQuery` (`{docType:"Consent", doctorId,
recordId, status:"granted"}`, `use_index: [idxConsentLookupDoc,
index-consent-lookup]`). The gateway arm additionally runs
`getRecordByIdRichQuery`, which reaches the identical authorization decision as
`getRecordById` but resolves consent through that Mango query, so the
rich-query cost is visible end-to-end too.

## Prerequisites

- The ConsentMD Fabric network is **running** (`docker compose -f
  blockchain/artifacts/docker-compose.yaml up -d`) with the chaincode committed.
- Node >= 18, `docker`, and `curl` on `PATH`.
- A record id, and a **wallet identity authorized to read it** (the owning
  patient, or a doctor holding active consent). Register/enrol it through the
  API first so it exists in `api/wallets/<org>/`.
- `fabric-network` is installed automatically into this directory on first run.

## Usage

```bash
./run.sh \
  --record-id record_<txid> \
  --gateway-identity doctor@example.com \
  --gateway-org org1 \
  --doctor-id "<doctor X.509 id>" \
  --samples 200
```

Key flags (all have env-var equivalents; see `./run.sh --help`):

- `--record-id` (required) — the record read in every arm.
- `--gateway-identity` (required) — wallet label for the SDK arm; must be
  authorized to read `--record-id`.
- `--doctor-id` — doctor X.509 id used in the CouchDB consent selector; defaults
  to the gateway identity label. For the CouchDB arm to match a real consent
  document, pass the doctor's actual on-ledger id (get it from
  `getMyId`/`whoAmI`).
- `--couchdb-port` — `5984` for couchdb0 (peer0.org1), `6984` for couchdb1
  (peer0.org2).
- `--samples` / `--warmup`, `--skip-noindex`, `--skip-peer`, `--skip-gateway`.

CouchDB credentials are read from `blockchain/artifacts/.env`
(`COUCHDB_USER`/`COUCHDB_PASSWORD`, default `admin`/`adminpassword`); override
with the `COUCHDB_USER` / `COUCHDB_PASSWORD` env vars.

## The index delete/restore is safe

The no-index arm backs up the `_design/idxConsentLookupDoc` document, deletes
it, runs the un-indexed query, and **restores it** — via an `EXIT`/`INT`/`TERM`
trap, so the index is put back even if the script is interrupted or an arm
fails. If a restore ever fails, re-deploy the chaincode (which reinstalls the
`META-INF/statedb/couchdb/indexes/` design docs) to recreate it.

## A note on the peer arm identity

The `docker exec ... peer chaincode query` runs with the peer container's own
signing identity, which carries no `organization` attribute, so
`getRecordById` returns `ACCESS_DENIED`. That still exercises the full
peer + chaincode + record state-read path up to the policy decision, which is
what the timing attributes. To measure an *authorized* peer read instead, run
the `peer` CLI as an enrolled doctor/patient identity (point
`CORE_PEER_MSPCONFIGPATH` at that identity's MSP inside a fabric-tools
container on the `artifacts_test` network), or use `--peer-fn getMyId` for a
no-state-read peer baseline. The script detects the denial and prints this
guidance; it does not silently treat a denial as an error.

## Output

- Printed attribution table (mean / p50 / p95 / p99 / min / max per arm) plus
  the derived differences.
- `results/summary.csv` — one row per component.
- `results/raw_<component>.csv` — the raw per-sample latencies.
