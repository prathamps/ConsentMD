# Benchmark methodology

This document states, in one place, how ConsentMD performance numbers are
produced: what is measured, how often, on what data, and what counts as a
failure. Each section notes the reviewer concern it addresses.

## Repetitions and statistics (reviewer item 2)

`run-benchmarks.sh` executes every benchmark **10 times by default**
(`--runs N` to change). The aggregator reports, per benchmark:

- throughput and mean latency as **mean ± sample standard deviation across
  runs** (n = 10, not n = 3), and
- **pooled latency percentiles** computed over every per-transaction sample
  from all runs.

Per-run rows are kept in `summary.csv` so run-to-run variance is inspectable
rather than hidden in an aggregate.

## Tail latency (reviewer item 3)

Caliper's HTML report only exposes min/avg/max latency. The workloads
therefore record **every transaction's latency** as a JSON line
(`src/latency-recorder.js`), and `src/aggregate-results.js` computes
**p50 / p95 / p99** (linear interpolation between closest ranks) per
operation type, per run, and pooled across runs. Tables that previously
showed only averages can be populated from `summary.md` / `summary.csv`.

## Dataset size (reviewer item 7)

Every worker writes a **dataset manifest** at seed time recording the exact
number of patients, doctors, records, and active consents it placed on the
ledger, together with the settings that produced them. The aggregator sums
manifests across workers and prints the totals alongside every result table,
so any reported number carries its dataset size with it.

Defaults (per worker, 2 workers): 10 patients, 5 doctors, 3 records/patient
— i.e. **20 patients, 10 doctors, 60 records, 300 consent pairs** per round,
with the initial active-consent share set by `seedConsentRatio` per benchmark.
Change them in the benchmark YAML; the manifests will reflect whatever ran.

## Failure definition (reviewer item 12)

A transaction is counted as **failed** when either:

1. the Fabric SDK reports it as not committed — endorsement failure,
   validation failure, or chaincode error — or
2. no final response is observed within **30 seconds**
   (`FAILURE_TIMEOUT_MS` in `src/config.js`).

Two outcomes are deliberately *not* failures:

- **Expected denials.** The record-access workload issues a configurable
  share of deliberately unauthorized reads; the chaincode rejecting them is
  the system working. These are recorded as `denied` and reported separately.
- **Retried transients.** NETWORK/TIMEOUT-class errors are retried up to 2
  times with exponential backoff; only exhausted retries count as failures.
  (Each attempt still appears in Caliper's own transaction counts.)

## Resource monitoring (reviewer items 1 and 15)

`monitoring/collect-docker-stats.sh` samples **`docker stats`** (Docker
Engine cgroup counters) for every container at a **fixed 5-second interval**
(configurable) for the entire duration of a benchmark session, writing CSV.
`monitoring/plot-resources.py` renders CPU and memory time series at
**300 DPI PNG plus vector PDF**, embedding the tool and sampling interval in
the caption — so utilization figures are reproducible and crisp at any print
size. A Prometheus/cAdvisor monitor (10-second step) remains configured in
the benchmark YAMLs as a secondary source.

## Identities and the trust model (reviewer item 8)

Benchmark identities are **registered and enrolled at the organization CAs**
(`setup/provision-identities.js`) with the `organization` attribute
(`patient` / `doctor`) embedded in the enrollment certificate — the same
scheme the production API uses. The chaincode derives the caller's role
exclusively from this certificate attribute and **fails closed**: an
identity without the attribute is denied every action. Plain cryptogen
identities therefore cannot be used, by design.

The claim that a compromised application gateway cannot elevate access is
tested twice:

- offline, by the chaincode policy unit tests
  (`blockchain/artifacts/chaincode/javascript/test/policy.test.js`), which
  exercise the full action × principal matrix including no-attribute and
  bogus-role identities; and
- live, by `experiments/security-bypass/`, which invokes the chaincode
  directly with legitimate enrolled identities while skipping every
  API-layer check, and asserts each unauthorized request is denied.

## Read-path attribution (reviewer item 5)

The chaincode intentionally exposes two read paths with **identical
authorization policy** but different consent-lookup mechanisms:
`getRecordById` (single `getState` on a composite key) and
`getRecordByIdRichQuery` (the original CouchDB Mango query).
`experiments/read-bottleneck/` measures, on the same network and data:
direct CouchDB `_find` latency (with and without the index), peer-only
chaincode query latency, and full gateway-path latency — turning "reads are
limited by CouchDB queries and gateway processing" into a measured
attribution rather than a hypothesis.

## Data lifecycle

The ledger is append-only; benchmark assets are **not** deleted afterwards.
Every run seeds fresh records whose ids derive from transaction ids, so runs
never collide, and read-path results should be interpreted against the
stated dataset size plus any previously accumulated state (the manifests
record both the seeded counts and the run label). The earlier
"cleanup/cleanup-verification" rounds were removed: verifying deletion on an
append-only ledger was a category error.

## Orderer topology (reviewer item 6)

The network runs **three Raft ordering nodes** (`orderer.example.com`,
`orderer2`, `orderer3` — see `blockchain/artifacts/docker-compose.yaml`),
matching the "Raft Orderers" architecture figure. All three run on a single
host, so this provides crash tolerance of the ordering *process*, not of the
machine; single-host deployment remains a stated limitation.

## What is not covered here

- **Off-chain file storage** (upload/download of medical files) is
  benchmarked separately by `experiments/file-storage/`, not by the Caliper
  suite: Caliper drives the chaincode, while files travel through the API
  and object storage without touching the ledger.
- **Cost accounting** (reviewer item 9) is a deployment property (VM pricing
  × the resource envelope measured above); the resource CSVs provide the
  sizing inputs.
