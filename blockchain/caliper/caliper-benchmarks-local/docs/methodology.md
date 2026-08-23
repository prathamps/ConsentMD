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

## Throughput measurement method (Tables 2 & 3)

The rate sweep (`run-sweep.sh`) characterizes throughput two ways, because a
single fixed-rate number is misleading on a capacity-limited host:

- **Sustained throughput (fixed-load, closed-loop).** Caliper holds a small
  in-flight backlog (`transactionLoad`) and self-adjusts the send rate to the
  maximum the system can actually commit. This yields the honest "maximum
  sustained throughput" figure with stable latency, and — unlike open-loop
  load — it cannot drive the system into congestion collapse. Reported as the
  `*-sustained` scenarios.
- **Saturation curve (fixed-rate, open-loop).** A sweep of fixed offered rates
  that brackets the knee (writes 10–50 TPS; reads 200–600 TPS), so throughput
  can be shown rising, plateauing, and then latency degrading once offered load
  exceeds capacity. This is what makes the abstract's "rises, peaks, plateaus"
  wording (reviewer item 11) a measured statement.

**Round duration.** Rounds run for 60 s. These workloads reach steady state
within seconds (reads hit their target rate immediately; fixed-load stabilizes
its backlog in the first few seconds; writes saturate at once), so 60 s × 10
runs gives stable statistics without wasting hours per point. Longer rounds
were verified to change the steady-state means by less than run-to-run
variance.

> Note on hardware: throughput figures are specific to the evaluation VM. On a
> burstable instance (e.g. Azure B4as_v2, 40% sustained-CPU baseline), the
> fixed-load sustained numbers are the meaningful capacity figure; fixed-rate
> points far above the knee mainly demonstrate the onset of congestion and are
> reported to show *where* saturation occurs, not as achievable throughput.

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

## Off-chain file storage: out of scope (reviewer item 10)

Large medical files are stored off-chain in object storage; only a SHA-256
content hash is anchored on the ledger. **This path is deliberately excluded
from the performance evaluation**, and the paper states so explicitly rather
than leaving it implied. The reasons:

- The benchmark isolates the *consent-ledger* subsystem — the paper's
  contribution. File transfer performance is a property of the object store and
  the network link, not of Fabric, and would confound the ledger numbers.
- The upload/download path runs entirely through the application tier
  (`experiments/file-storage/` exercises it), which has open hardening issues
  documented in the code review; benchmarking it would measure the prototype
  API, not the consent architecture.

What *is* evaluated is the on-chain anchor that makes off-chain tampering
detectable: record creation (which writes the `fileHash`) is part of the
write workload. A tooling harness for the file path exists in
`experiments/file-storage/` for future work, but its numbers are not reported.

## Cost accounting (reviewer item 9)

Cost is a deployment property: VM hourly price × wall-clock, plus the resource
envelope measured above (which justifies the VM size). The evaluation records
the VM SKU and its published hourly rate, the total run hours, and a projected
monthly cost, contrasted with a naive multi-node estimate. The resource CSVs
and figures provide the sizing evidence.
