# ConsentMD — Evaluation Guide

One command, run on a fresh VM, configures the whole stack and produces every
number and figure the paper needs. This document covers: what to provision on
Azure, how to run it, how long each phase takes, and exactly which output files
to open when revising each part of the paper.

---

## 1. What you need (Azure or any Ubuntu host)

The paper's story is "practical on a low-cost VM", so size for that:

| Purpose | Azure VM | vCPU / RAM | Notes |
|---|---|---|---|
| Reproduce the paper's "low-cost" claim | **Standard_B2s** | 2 / 4 GB | Matches the paper's framing; benchmarks run but CPU-bound |
| Comfortable / faster runs | **Standard_B4ms** or **D4s_v5** | 4 / 16 GB | Recommended for iterating |
| Bare minimum | B1ms | 1 / 2 GB | Works but slow; CouchDB will saturate the single vCPU |

- OS: **Ubuntu 22.04 LTS** (the installer supports Ubuntu/Debian incl. WSL2).
- Disk: 30 GB+ (Docker images for Fabric + CouchDB are ~2 GB; results are small).
- Open ports: only SSH (22) is needed — everything runs locally on the VM.
- You need `sudo` on first setup (Docker + Fabric binaries install).

> **Cost note (for reviewer item 9):** capture the VM's hourly price from the
> Azure portal for the SKU you pick. A B2s is roughly a low-single-digit
> USD/day. The resource figures in `benchmarks/figures/` give the utilization
> envelope that justifies the SKU choice.

---

## 2. Run it — one command

```bash
git clone <your-fork> ConsentMD && cd ConsentMD

# First time on a fresh VM (installs Docker, Node 18, Fabric binaries; uses sudo):
./evaluate.sh --install

# Thereafter, the full paper run (10 repetitions per benchmark):
./evaluate.sh

# Fast end-to-end validation that everything is wired (~10 min, 1 short run):
./evaluate.sh --quick
```

Useful flags:

| Flag | Effect |
|---|---|
| `--install` | Run `install.sh` first (system deps). Needed once per VM. |
| `--quick` | One short suite launch + small experiment samples. Validates the pipeline fast; **not** for publishable numbers. |
| `--runs N` | Benchmark repetitions (default **10** — reviewer item 2). |
| `--benchmarks "consent-granting record-access …"` | Subset of the four workloads. |
| `--skip-network` | Network already up + chaincode deployed; jump to running. |
| `--results-dir DIR` | Where to collect artifacts (default `evaluation-results/<timestamp>/`). |

The script is **idempotent**: a re-run detects an already-up network and
deployed chaincode and skips straight to the benchmarks.

### What it does, in order

preflight → (install) → network up (CAs, crypto, channel) → **deploy chaincode
as a service** → connection profiles → npm installs → provision CA identities →
smoke test → benchmark campaign → experiment fixtures → read-path attribution →
security-bypass → baseline → collect everything into one folder + `INDEX.md`.

> The chaincode is deployed via `blockchain/scripts/deploy-chaincode-ccaas.sh`
> (chaincode-as-a-service), not the legacy `deployChaincode.sh`. On modern
> Docker Engines the peer's built-in node builder fails (API-version mismatch),
> so the service model is used for reproducibility. This is automatic — you do
> not run it yourself.

---

## 3. How long it takes

Wall-clock on a 4-vCPU VM. Scale roughly ×2 on a B2s (2 vCPU).

| Phase | `--quick` | Full paper run (`--runs 10`) |
|---|---|---|
| Install deps (`--install`, once) | 5–10 min | 5–10 min |
| Network bring-up + chaincode deploy | 3–5 min | 3–5 min |
| npm installs (suite/experiments/baseline) | 2–4 min | 2–4 min |
| Identity provisioning (30 identities) | ~1 min | ~1 min |
| Smoke test | ~1 min | ~1 min |
| **Benchmark campaign** | ~3 min (1 short suite) | **~6 min per benchmark per run** |
| Read-path attribution | ~2 min | ~4 min |
| Security-bypass | <1 min | <1 min |
| Baseline | ~1 min | ~3 min |
| **Total** | **~15 min** | **see below** |

The benchmark campaign dominates the full run. Each benchmark's main round is
300 s; with warmup + setup that's ~6 min per run. So:

- full run, all 4 benchmarks × 10 = **~4 hours** for the campaign alone.
- a lighter-but-credible run: `--runs 5` on 4 benchmarks ≈ **~2 hours**.
- `--runs 10` on 2 benchmarks (grant + read) ≈ **~1.2 hours**.

Run it under `tmux`/`screen` (or `nohup`) so an SSH drop doesn't kill it.

---

## 4. Where the results land

Everything is collected under `evaluation-results/<timestamp>/`. **Read
`INDEX.md` there first** — it lists every artifact and the phase timings.

```
evaluation-results/<timestamp>/
├── INDEX.md                     # start here: artifact map + phase timings
├── evaluate.log                 # full run log
├── fixtures.json                # record/doctor ids used by the experiments
├── benchmarks/
│   ├── summary.md               # throughput mean±std, p50/p95/p99, dataset sizes, failures
│   ├── summary.csv              # one row per (benchmark, run) — for plotting
│   ├── summary.json             # machine-readable
│   ├── figures/
│   │   ├── cpu-utilization.png / .pdf      # 300-DPI (Figure 2 replacement)
│   │   └── memory-usage.png / .pdf
│   ├── resource-usage.csv       # raw docker-stats samples (5 s interval)
│   ├── manifests/               # exact dataset size per worker/round
│   ├── raw/                     # per-transaction latency samples (JSONL)
│   └── *-report.html            # Caliper's own per-run reports
├── read-bottleneck/
│   └── summary.csv              # CouchDB indexed vs no-index vs gateway latency
├── security-bypass.txt          # compromised-gateway assertion matrix (5/5 pass)
└── baseline/
    ├── aggregate.json           # non-blockchain TPS + p50/p95/p99, mean±std across runs
    └── run-*.json               # per-run detail
```

---

## 5. Editing the paper — which file answers which reviewer item

When you send the paper, these are the sources for each revision. (Items 6, 9,
11, 13, 14 are text-only edits with no data file; the "source" column says what
to cite.)

| # | Reviewer point | Open this | What to write |
|---|---|---|---|
| 1 | Blurry figures | `benchmarks/figures/*.pdf` | Drop in the 300-DPI/vector figures; caption them per item 15. |
| 2 | Too few runs (3) | `benchmarks/summary.md` (per-run table) + `summary.csv` | Report mean ± std over **N runs** (state N); the per-run CSV shows variance. |
| 3 | Only average latency | `benchmarks/summary.md` (p50/p95/p99 columns) | Add p95/p99 to Tables 2 & 3, not just averages. |
| 4 | No non-blockchain comparison | `baseline/aggregate.json` vs `benchmarks/summary.md` | Add a comparison paragraph/table: baseline TPS & latency vs on-chain. |
| 5 | Reads slow — unproven | `read-bottleneck/summary.csv` | State the measured split: indexed CouchDB ≈ gateway full-path; **no-index ≈ 100× slower** → the cost is the CouchDB query, and the index is essential. |
| 6 | Orderer count ambiguity | `docker-compose.yaml` (3 orderer services) | Say "three Raft orderers on one host"; note single-host = no machine-level fault tolerance. |
| 7 | Dataset size unstated | `benchmarks/manifests/` + `summary.md` header | State patients/doctors/records/consents per round (printed in the summary). |
| 8 | Security claim untested | `security-bypass.txt` | Cite the live 5/5 assertion matrix: a compromised gateway is still denied by the chaincode. |
| 9 | No cost info | Azure portal price for your SKU + `benchmarks/figures/` | Report VM $/hr and the utilization envelope; contrast with a multi-node estimate. |
| 10 | File storage untested | `experiments/file-storage/` (run with `--with-api`) or state as out-of-scope | Either add the file-path numbers or explicitly scope it out and say why. |
| 11 | Abstract numbers don't match | `benchmarks/summary.csv` | Describe the curve as it is (rises, peaks, then flattens/dips) using the real TPS column. |
| 12 | "Failure" undefined | `benchmarks/summary.md` (failure-definition line) + `docs/methodology.md` | Quote the definition (not committed, or >30 s timeout; expected denials counted separately). |
| 13 | Show the auth code | `blockchain/artifacts/chaincode/javascript/lib/access/policy.js` | Replace the prose bullets with the actual `RULES` / `authorize()` listing. |
| 14 | Unfair Consentio comparison | (text) | Add a sentence that Consentio's 6,000 req/s used different/larger hardware than this VM. |
| 15 | Monitoring method unstated | `benchmarks/figures/` captions + `docs/methodology.md` | State tool = `docker stats`, interval = 5 s, and that CPU% is per-core normalized. |

Full item-to-implementation mapping also lives in
`blockchain/caliper/caliper-benchmarks-local/docs/methodology.md`.

---

## 6. Known limitations to state honestly in the paper

- **Single host.** All three Raft orderers and both peers run on one VM: this
  gives ordering-process crash tolerance, not machine fault tolerance.
- **File-storage arm is optional** (`experiments/file-storage/`, needs the API
  running). The API tier has open hardening issues (see the PR review); for the
  storage numbers run it in isolation, or scope it out.
- **`--quick` numbers are not publishable** — they exist to prove the pipeline
  runs end to end. Use the default (or `--runs 5`+) for reported figures.
