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
- **Project status:** actively benchmarked on Azure B1ms (1 vCPU/2 GB) to measure performance against the Consentio research baseline.

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

### Running a Benchmark

```bash
cd blockchain/caliper/caliper-benchmarks-local
node setup/provision-identities.js      # one-time: CA-enrolled identities with role attributes
./run-single-benchmark.sh minimal-consent-granting   # ~1 min smoke test
./run-benchmarks.sh                     # full campaign: 4 benchmarks x 10 runs + aggregation
```

- Results are timestamped under `blockchain/caliper/caliper-benchmarks-local/results/`; each session produces per-run HTML reports plus `summary.md`/`summary.csv` with mean ± std across runs and pooled latency percentiles, and 300-DPI CPU/memory figures.
- The generated network profile (`networks/fabric/bench-network.yaml`) carries CA-enrolled benchmark identities; the chaincode's fail-closed policy denies identities without the CA-issued `organization` attribute.

### Companion evaluations

| Directory | Purpose |
|---|---|
| `baseline/` | Non-blockchain equivalent (Express + SQLite + append-only audit log) with a matching load generator, to quantify blockchain overhead |
| `experiments/read-bottleneck/` | Attributes read latency to CouchDB vs peer vs gateway, with and without the consent index |
| `experiments/security-bypass/` | Live test that a compromised API tier cannot read unauthorized records (chaincode-level denial) |
| `experiments/file-storage/` | Benchmarks the off-chain medical-file upload/download path |

### Latest Azure B1ms Measurements

Benchmarks executed on Azure **B1ms** (1 vCPU, 2 GB RAM) – the smallest burstable VM. Throughput matches the Consentio paper; latency is higher due to limited CPU.

| Scenario | Workers | Target TPS | Success | Expected Failures* | Avg Latency | Observed Throughput |
|----------|---------|------------|---------|--------------------|-------------|----------------------|
| Consent granting (main) | 2 | 35 | 1 578 | 0 | 2.77 s | 33.3 TPS |
| Consent revocation (main) | 2 | 18 | 840 | 0 | 0.47 s | 16.9 TPS |
| Record access warm-up | 3 | 20 | 120 | 285 | 0.01 s | 20.1 TPS |
| Record access main | 3 | 60 | 775 | 1 928 | 0.01 s | 60.0 TPS |
| Mixed workload main | 2 | 30 | 843 | 503 | 0.45 s | 28.5 TPS |

\* "Failures" correspond to intentionally unauthorized record-access attempts. Chaincode correctly rejected ~70 % of random doctor/record reads because no active consent was present.

HTML reports:

- `consent-granting-report.html`
- `consent-revocation-report.html`
- `record-access-report.html`
- `mixed-workload-report.html`

Each report (under `results/single-<timestamp>/`) contains the exact Caliper configuration, metrics, and resource utilization snapshots.

---

## Performance Takeaways vs Consentio

| Aspect | ConsentMD on Azure B1ms | Consentio paper (reference) | Insight |
|--------|-------------------------|-----------------------------|---------|
| Grant TPS | ~33 TPS sustained | 30–35 TPS on larger multi-core nodes | Comparable throughput despite minimal hardware. |
| Grant latency | 2.7 s avg / 5.2 s max | Sub-second averages | Latency penalty stems from single shared vCPU; batching/endorsement still succeed. |
| Revocation TPS | 17 TPS | 20–25 TPS | Slightly lower throughput—acceptable given hardware ceiling. |
| Record access TPS | 60 TPS | 40–60 TPS | Matches policy-enforced reads even while hammering denial paths. |
| Unauthorized detection | 70 % of reads correctly denied | Not quantified | Benchmark proves enforcement of consent boundaries under load. |

**Key takeaway:** even on the lowest-tier Azure VM, ConsentMD sustains Consentio-level throughput while providing stronger evidence of access-control enforcement. If sub-second latencies are required, move to a Standard D-series VM or loosen endorsement policies.

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
