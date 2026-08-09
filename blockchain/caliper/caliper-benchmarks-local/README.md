# ConsentMD Caliper Benchmark Suite

Performance benchmarks for the ConsentMD medical-consent chaincode, built on
[Hyperledger Caliper](https://hyperledger.github.io/caliper/). The suite
measures consent granting, consent-checked record reads (including deliberate
unauthorized attempts), consent revocation, and a mixed clinic-traffic blend.

How numbers are produced — repetitions, tail-latency percentiles, dataset
manifests, the failure definition, resource sampling — is specified in
**[docs/methodology.md](docs/methodology.md)**.

## Layout

```
├── benchmarks/
│   ├── consent-management-suite.yaml      # quick all-in-one sanity suite
│   └── consent-management/                # one YAML per benchmark (+ smoke test)
├── workloads/                             # thin Caliper workload modules
├── src/                                   # shared machinery
│   ├── config.js                          # contract id, MSPs, failure timeout, naming
│   ├── gateway.js                         # typed chaincode facade over the SUT adapter
│   ├── fixtures.js                        # dataset seeding + manifests
│   ├── operations.js                      # grant/read/revoke operation builders
│   ├── base-workload.js                   # lifecycle, retries, denial classification
│   ├── latency-recorder.js                # per-transaction latency JSONL
│   ├── aggregate-results.js               # mean ± std across runs, p50/p95/p99
│   ├── error-handler.js                   # error categories + retry policy
│   └── stats.js                           # percentile/stddev helpers
├── setup/provision-identities.js          # CA-enrolled benchmark identities
├── monitoring/                            # docker-stats sampler + 300-DPI plots
├── networks/fabric/                       # connection profiles, generated network config
└── test/workload.test.js                  # offline test of the whole stack
```

## Prerequisites

- Node.js ≥ 18, npm ≥ 8
- The Fabric network up (`blockchain/artifacts/docker-compose.yaml`: 3 Raft
  orderers, peers with CouchDB, CAs) with `medicalconsent` deployed on
  `mychannel`
- `npm install` in this directory

## Quick start

```bash
# 1. Provision benchmark identities (REQUIRED — see note below)
node setup/provision-identities.js --patients 20 --doctors 10

# 2. Smoke-test the wiring (~1 minute)
./run-single-benchmark.sh minimal-consent-granting

# 3. Full campaign: every benchmark × 10 runs, resource sampling, aggregation
./run-benchmarks.sh
```

Options: `./run-benchmarks.sh --runs 10 --benchmarks "record-access" --monitor-interval 5`

> **Why provisioning is required:** the chaincode derives the caller's role
> from the CA-issued `organization` certificate attribute and fails closed —
> identities without it (e.g. cryptogen's `User1`) are denied every action.
> `setup/provision-identities.js` registers `bench_patient_<i>` /
> `bench_doctor_<i>` with the correct attribute (exactly as the production
> API does) and generates `networks/fabric/bench-network.yaml` for Caliper.

## Results

Each session writes to `results/<timestamp>/`:

| artifact | contents |
|---|---|
| `summary.md` / `summary.csv` / `summary.json` | throughput mean ± std across runs, pooled p50/p95/p99 latency per operation, failure and expected-denial counts, dataset sizes |
| `raw/*.jsonl` | one line per transaction (op, latency, outcome) |
| `manifests/*.json` | exact seeded dataset per worker per round |
| `resource-usage.csv` | docker-stats samples at a fixed interval |
| `figures/` | 300-DPI PNG + vector PDF CPU/memory plots |
| `*-report.html` | Caliper's own per-run reports |

Re-aggregate or re-plot any time:

```bash
node src/aggregate-results.js results/<timestamp>
python3 monitoring/plot-resources.py results/<timestamp>/resource-usage.csv figs/
```

## Testing without a network

`npm test` runs `test/workload.test.js`: the complete workload stack
(seeding, all four workloads, denial classification, latency recording,
manifests, aggregation) against an in-memory chaincode double that mirrors
the real contract's semantics, including duplicate-grant conflicts and
fail-closed reads.

## Related experiments (outside this directory)

- `experiments/read-bottleneck/` — attributes read latency to CouchDB vs
  peer vs gateway, with and without the consent index
- `experiments/security-bypass/` — live proof that a compromised API tier
  cannot read unauthorized records
- `experiments/file-storage/` — off-chain file upload/download benchmark
- `baseline/` — equivalent non-blockchain system (Express + SQLite + audit
  log) for overhead comparison
