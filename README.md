# ConsentMD – Telemedicine Consent Platform on Hyperledger Fabric

ConsentMD brings the "Consentio" research model to life: patients stay in control of who reads their medical records, every grant/revoke is immutably logged, and providers integrate through a familiar REST + React stack. This repository contains the full implementation – Fabric network, chaincode, API, React client, automation scripts, and Caliper performance harness – used to validate the architecture on a low-cost Azure VM.

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [System Architecture](#system-architecture)
3. [Repository Layout](#repository-layout)
4. [Consent Lifecycle](#consent-lifecycle)
5. [Getting Started](#getting-started)
6. [Operating the Fabric Network](#operating-the-fabric-network)
7. [Running the Application Services](#running-the-application-services)
8. [Benchmarking with Hyperledger Caliper](#benchmarking-with-hyperledger-caliper)
9. [Performance Takeaways vs. Consentio](#performance-takeaways-vs-consentio)
10. [Troubleshooting & Tips](#troubleshooting--tips)

---

## Platform Overview

- **Goal:** deliver a telemedicine consent layer where patients grant, revoke, and audit access to their electronic health records (EHRs) in real time.
- **Core idea:** encode consent policies as Fabric chaincode (`MedicalConsentContract`) so enforcement is deterministic and auditable.
- **Why Fabric:** permissioned membership, pluggable endorsement, CouchDB rich queries, and private data support align with healthcare compliance.
- **Project status:** evaluated in a controlled four-vCPU envelope (representative of a low-cost single VM) with a reproducible one-command harness ([`EVALUATION.md`](EVALUATION.md)).

---

## System Architecture


<img width="3023" height="2094" alt="image" src="https://github.com/user-attachments/assets/7b6e1db7-f56c-4071-919b-c1296f1bd3f6" />



## System Flow


<img width="4744" height="1070" alt="image" src="https://github.com/user-attachments/assets/638f3b75-4a62-402d-94be-97da1e4b74ae" />

<img width="4824" height="1792" alt="image" src="https://github.com/user-attachments/assets/d3c4e876-1f48-4e09-a642-00d10d8356c7" />

<img width="4070" height="1619" alt="image" src="https://github.com/user-attachments/assets/57d3b71f-5c91-498c-9942-e64ebe56e975" />

<img width="6466" height="1472" alt="image" src="https://github.com/user-attachments/assets/4734ceb4-db75-435b-bc02-958fe2795e70" />


Additional components:

- **Off-chain storage:** patient documents live in object storage (S3-compatible); Fabric stores hashes + metadata.
- **Analytics & benchmarking:** Hyperledger Caliper workspace (`blockchain/caliper`) exercises grants, revokes, and reads under configurable loads.
- **Automation:** shell scripts spin up Fabric, deploy chaincode, run benchmarks, and tear down.

---

## Repository Layout

| Path | Purpose |
|------|---------|
| `api/` | Node.js/Express API (authentication, consent orchestration, integration layer). |
| `client/` | React front-end for patients and providers. |
| `blockchain/` | Fabric network artifacts, chaincode, deployment scripts, Caliper workspace. |
| `blockchain/artifacts/chaincode/javascript/` | `MedicalConsentContract` smart contract implementation. |
| `blockchain/scripts/` | Start/stop Fabric network, create channel, deploy & upgrade chaincode. |
| `blockchain/caliper/` | Benchmark configs, Fabric network profile for Caliper, helper scripts. |
| `evaluate.sh`, `EVALUATION.md` | One-command evaluation orchestrator and its guide (sizing, timings, output map). |
| `baseline/` | Non-blockchain comparison (Express + SQLite + append-only audit log) with a load generator. |
| `experiments/` | Read-path attribution, live security-bypass test, and off-chain file-storage harness. |
| `paper/figures/` | Reproducible 300-DPI/vector figure generators. |
| `aws/`, `Apache Conf/`, `ui-old/` | Deployment and legacy assets. |

---

## Consent Lifecycle

1. **Doctor onboarding** – `registerDoctorProfile` stores deterministic doctor IDs (based on x509 ID). Doctors belong to Org2MSP.
2. **Record creation** – Patients (Org1MSP) create EHR metadata on-chain via `createPatientRecord`; files live off-chain.
3. **Grant consent** – Patients execute `grantConsent(recordId, doctorId)` to whitelist provider access. Chaincode writes a consent asset capturing record, doctor, timestamps, and status.
4. **Record access** – Provider apps call `getRecordById`. Chaincode verifies: patient is owner OR an active consent exists (`_verifyAccess`). Unauthorized access throws an error and is logged.
5. **Revocation** – Patients invoke `revokeConsent`. Chaincode flips status to `revoked`, removing quick-look indexes so further reads fail.
6. **Audit** – `getConsentStatus`, `getAssetHistory`, and Caliper reports provide end-to-end traceability.

---

## Getting Started

### Prerequisites

- **Docker + Docker Compose** (Fabric runtime)
- **Node.js 16+** and **npm**
- **Go 1.18+** (chaincode packaging)
- **Python 3** (optional helper scripts)
- **jq, curl, openssl** (utility scripts)
- **npx** (bundled with Node) for Caliper cli

### Quick Start Checklist

1. Clone the repository and install root dependencies:
   ```bash
   git clone https://github.com/<org>/ConsentMD_Prod.git
   cd ConsentMD_Prod
   npm install # installs Caliper workspace deps
   ```
2. Follow the [Fabric network steps](#operating-the-fabric-network) to bring up the blockchain.
3. Deploy the chaincode and run the API + client (see [Running the Application Services](#running-the-application-services)).
4. (Optional) Execute Caliper benchmarks via `blockchain/caliper/caliper-benchmarks-local/run-single-benchmark.sh`.

---

## Operating the Fabric Network

All scripts below reside in `blockchain/scripts`.

```bash
cd blockchain/scripts

# 1. Start CA, peers, orderer, CouchDB
./start.sh

# 2. Create application channel (default: consentchannel)
./createChannel.sh

# 3. Deploy MedicalConsentContract chaincode (JavaScript)
./deployChaincode.sh

# Optional: upgrade policy or chaincode implementation
./upgradeChaincodePolicy.sh

# When finished
./stop.sh
```

Key chaincode details:

- **Name:** `medicalconsent`
- **Contract class:** `MedicalConsentContract`
- **Primary functions:** registerDoctorProfile, createPatientRecord, grantConsent, revokeConsent, getRecordById, consent auditing helpers.

---

## Running the Application Services

Run these in parallel terminals (after Fabric is up):

1. **API Gateway (`api/`)**
   ```bash
   cd api
   npm install
   npm run dev
   ```
   Exposes REST endpoints for login, consent management, and integrates with Fabric SDKs.

2. **React Front-End (`client/`)**
   ```bash
   cd client
   npm install
   npm start
   ```
   Provides dashboards for patients (grant/revoke, audit) and doctors (record access).

Environment variables (JWT secrets, Fabric connection profiles, off-chain storage endpoints) live in the respective directories’ `.env.example` files.

---

## Benchmarking with Hyperledger Caliper

The Caliper workspace under `blockchain/caliper/caliper-benchmarks-local` bundles network profiles, workload modules, and scripts. The measurement methodology — 10 repetitions per benchmark, p50/p95/p99 tail latency, dataset manifests, an explicit failure definition, and fixed-interval resource sampling — is documented in [`blockchain/caliper/caliper-benchmarks-local/docs/methodology.md`](blockchain/caliper/caliper-benchmarks-local/docs/methodology.md).

### Reproducing the full evaluation (one command)

The entire evaluation — configure, deploy, provision, benchmark, run the
experiments and the baseline, and collect every artifact — is driven by a
single orchestrator. Full instructions (VM sizing, timings, output map, and the
reviewer-item → artifact mapping) are in [`EVALUATION.md`](EVALUATION.md).

```bash
./evaluate.sh --install                         # first run on a fresh VM (installs deps)
./evaluate.sh --paper --runs 10 --constrain "0-3"   # paper run in a controlled 4-vCPU envelope
./evaluate.sh --quick                           # ~15 min end-to-end smoke of the whole pipeline
```

`--constrain "0-3"` pins the Fabric system-under-test to four dedicated CPU
cores (via Docker `cpuset`) and isolates the Caliper load generator on the
remaining cores, giving a reproducible, non-burstable 4-vCPU measurement that is
portable to any host. `--paper` runs the rate sweep behind Tables 2 & 3
(fixed-load sustained + a fixed-rate knee bracket).

### Running an individual benchmark

```bash
cd blockchain/caliper/caliper-benchmarks-local
node setup/provision-identities.js                    # one-time: CA-enrolled identities with role attributes
./run-single-benchmark.sh minimal-consent-granting    # ~1 min smoke test
./run-benchmarks.sh --runs 10                          # per-benchmark campaign + aggregation
```

- Results are timestamped under `evaluation-results/` (orchestrator) or the suite's `results/`; each session produces per-run HTML reports plus `summary.md`/`summary.csv` with mean ± std across runs and pooled p50/p95/p99 latency, dataset manifests, and 300-DPI CPU/memory figures.
- The generated network profile (`networks/fabric/bench-network.yaml`) carries CA-enrolled benchmark identities; the chaincode's fail-closed policy denies identities without the CA-issued `organization` attribute.

### Companion evaluations

| Directory | Purpose |
|---|---|
| `baseline/` | Non-blockchain equivalent (Express + SQLite + append-only audit log) with a matching load generator, to quantify blockchain overhead |
| `experiments/read-bottleneck/` | Attributes read latency to CouchDB vs peer vs gateway, with and without the consent index |
| `experiments/security-bypass/` | Live test that a compromised API tier cannot read unauthorized records (chaincode-level denial) |
| `experiments/file-storage/` | Benchmarks the off-chain medical-file upload/download path |

### Measured results (controlled 4-vCPU envelope, n = 10)

Measured on a controlled four-vCPU envelope (Fabric pinned to four dedicated
cores; load generator isolated), 10 runs per configuration. `sustained` rows use
a closed-loop fixed-load controller (the maximum sustainable rate); latencies in
milliseconds.

| Scenario | Throughput (TPS) | Mean (ms) | p95 (ms) | p99 (ms) | Failed |
|----------|------------------|-----------|----------|----------|--------|
| write-saturation-50 | 48.5 +/- 0.05 | 333 | 691 | 923 | 0 |
| **write (sustained)** | **45.7 +/- 2.2** | 311 | 521 | 660 | 0 |
| read-scalability-600 | 600.5 +/- 0.18 | 6.8 | 12 | 35 | 0 |
| **read (sustained)** | **1104.7 +/- 35.9** | 8.9 | 16 | 21 | 0 |
| read (auth-enabled, sustained) | 926.8 +/- 87.5 | 12.3 | 20 | 27 | 0 |

**Read-path attribution** (200 samples): an indexed CouchDB consent lookup takes
**4.8 ms** versus **23,360 ms** without the index, and the Fabric gateway adds
~0 on top (4.5 ms) - the read cost is the state-database query, and the index is
the determinant. **Security:** a compromised-gateway test denies 5/5 unauthorized
requests at the chaincode. **Baseline:** a non-blockchain SQLite + audit-log
equivalent sustains 100 TPS at 1.6 ms mean / 3.7 ms p99.

Each run writes per-run HTML reports plus `summary.md`/`summary.csv` and 300-DPI
CPU/memory figures under its results directory.

---

## Performance Takeaways vs Consentio

| Aspect | ConsentMD (4-vCPU envelope) | Consentio paper (reference) | Insight |
|--------|-----------------------------|-----------------------------|---------|
| Read throughput | ~1,100 TPS sustained | ~6,000 req/s on a larger multi-node cluster | Consent checks are a single keyed state read; reads scale well on one host. |
| Write throughput | ~46 TPS sustained | - | Bounded by endorsement/ordering/commit; ample for consent write volumes (grants/revokes are infrequent). |
| Read latency | single-digit ms (p99 <= 35 ms) | - | Interactive-grade for clinician record access. |
| Unauthorized enforcement | 5/5 denied with the gateway bypassed | Not quantified | Direct evidence the ledger enforces consent independently of the app tier. |

> Consentio's ~6,000 req/s was obtained on a substantially larger, multi-node
> cluster and is **not** directly comparable to these single-host, four-vCPU
> numbers; it characterizes the design space rather than a like-for-like target.

**Key takeaway:** on a single low-cost four-vCPU host, ConsentMD sustains read
throughput far above its earlier CouchDB-rich-query design (the read bottleneck
is measured and removed) while enforcing consent at the ledger. For higher write
throughput, tune block parameters/endorsement or scale out.

---

## Troubleshooting & Tips

- **Chaincode logs:** `docker logs peer0.org1.example.com -f` (and Org2) for runtime exceptions.
- **Caliper failures:** read the corresponding `execution.log`; most "failures" are authorization denials by design.
- **Resetting the network:** run `./stop.sh && ./start.sh` if peers get stuck; remove Docker volumes if CouchDB holds stale state.
- **Benchmark tuning:** Edit YAML in `blockchain/caliper/caliper-benchmarks-local/benchmarks/consent-management/` to adjust TPS, round durations, and unauthorized ratios.
- **Environment variables:** maintain `.env` files per service; copy provided `.env.example` templates.
- **Security hardening:** move Fabric CA keys off the VM, enforce TLS everywhere, and integrate with your identity provider for production deployments.

---

### Further Reading

- Consentio Paper: *Fine-grained consent management for blockchain-based EHRs* (University of Waterloo)
- Hyperledger Fabric Docs: [https://hyperledger-fabric.readthedocs.io](https://hyperledger-fabric.readthedocs.io)
- Hyperledger Caliper Docs: [https://hyperledger.github.io/caliper](https://hyperledger.github.io/caliper)

For architectural deep dives, open `blockchain/README.md` (Fabric network) and the API/client READMEs for service-level details.
