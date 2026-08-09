# ConsentMD Non-Blockchain Baseline

A deliberately minimal "normal system" against which the blockchain
deployment can be compared, added in response to the reviewer request for a
basic non-blockchain comparison system so that blockchain overhead can be
quantified. It is intentionally the simplest credible equivalent: a single
Express process over a single SQLite file (WAL mode, prepared statements,
indexed lookups), with an append-only `audit_log` table standing in for the
ledger — the "regular database with a log for tracking access" a hospital IT
department would build absent blockchain.

## What it implements

The same domain operations and the same authorization policy as the chaincode
(`blockchain/artifacts/chaincode/javascript/lib/MedicalConsentContract.js`,
policy in `lib/access/policy.js`):

| Endpoint | Chaincode equivalent | Authorization |
| --- | --- | --- |
| `POST /records` | `createPatientRecord` | creating patient owns the record |
| `POST /consents` | `grantConsent` | only the record's owner may grant |
| `DELETE /consents` | `revokeConsent` | only the granting patient may revoke |
| `GET /records/:id?actorId=...` | `getRecordById` | owner always; a doctor only with an ACTIVE consent for that record; **403 otherwise** |
| `GET /health` | — | liveness + current audit row count |

Every state-changing operation AND every read attempt (allowed or denied)
appends one row to `audit_log` (timestamp, actor, action, resource, outcome).
The table is append-only — SQL triggers abort any `UPDATE` or `DELETE` — and
each mutation commits atomically with its audit row, mirroring the atomicity
a Fabric transaction provides between state and history.

Consents are keyed by `(recordId, doctorId)` with a covering primary key;
records are indexed by `patientId` — the same access paths the chaincode's
CouchDB indexes serve.

## Running

```bash
cd baseline
npm install

# one-shot: fresh DB, start server, wait for health, load test, stop server
./run-comparison.sh                       # defaults below
./run-comparison.sh --workload read --tps 100 --duration 30

# or manually:
npm start                                 # server on :3100 (BASELINE_PORT/BASELINE_DB to override)
npm run load-test -- --tps 50 --duration 30 --runs 10 --workload mixed
```

### Load-test options (flag / env / default)

| Flag | Env | Default | Meaning |
| --- | --- | --- | --- |
| `--patients` | `PATIENTS` | 20 | seeded patients (matches Caliper suite) |
| `--doctors` | `DOCTORS` | 10 | seeded doctors |
| `--records-per-patient` | `RECORDS_PER_PATIENT` | 15 | seeded records per patient |
| `--tps` | `TPS` | 50 | target request rate (open-loop) |
| `--duration` | `DURATION` | 30 | seconds per run |
| `--workload` | `WORKLOAD` | mixed | `create` \| `read` \| `grant` \| `revoke` \| `mixed` |
| `--runs` | `RUNS` | 10 | repetitions, aggregated at the end |
| `--url` | `BASELINE_URL` | `http://127.0.0.1:3100` | server under test |
| `--out` | `BASELINE_RESULTS` | `baseline/results` | output directory |

The `mixed` workload issues 25% creates, 36% authorized reads, 4% deliberately
unauthorized reads, 20% grants, 15% revokes. The `read` workload is 90%
authorized / 10% deliberately unauthorized. A `revoke` with no active consent
left in the pool falls back to a grant (reported under `grant` in the
per-operation breakdown).

### Failure definition

A request counts as a **failure** if it hits a network error, exceeds the
30 s timeout, or returns HTTP >= 400 — **except** an expected 403 on a
deliberately unauthorized read, which is the policy answering correctly and
is counted separately as `deniedExpected403`. Latency statistics cover all
requests that received an HTTP response (successes + expected denials).

### Output

Each invocation writes `baseline/results/<timestamp>/`:

- `manifest.json` — the seeded dataset (also printed to stdout)
- `run-N.json` — per-run throughput (TPS), success/denied/failed counts, and
  latency mean/std/min/max/p50/p95/p99 in milliseconds
- `aggregate.json` — mean ± std across runs (throughput, mean latency) plus
  percentiles pooled over every request from all runs

## What this baseline deliberately omits

- **Identity/authentication.** Fabric derives the principal from a signed
  X.509 certificate; here the caller states its id (`patientId` in bodies,
  `?actorId=` on reads). Authenticating callers is orthogonal to the storage
  and consensus overhead this baseline exists to isolate.
- **Doctor profile registration.** The chaincode requires a registered doctor
  profile before consent can be granted; here `doctorId` is an opaque string.
- **Tamper-evidence.** The audit log is append-only by trigger, but a DBA
  with file access could rewrite it. That gap — trusting the operator — is
  precisely the property the blockchain buys, and quantifying its price is
  the point of the comparison.
- **Replication/consensus.** One process, one file. This is the floor a
  centralized deployment could achieve, which is what makes the overhead
  measurement conservative.
