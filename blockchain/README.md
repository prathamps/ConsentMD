# ConsentMD Fabric Network

This package contains the Hyperledger Fabric network, chaincode sources, and automation scripts that power the ConsentMD consent-management platform.

---

## Network Topology

- **Organizations**
  - `Org1MSP` – Patient services
  - `Org2MSP` – Provider services
  - Ordering service (Raft, three orderers)
- **Peers**
  - `peer0.org1.example.com` (CouchDB state database)
  - `peer0.org2.example.com` (CouchDB state database)
- **Channel**: `mychannel`
- **Chaincode**: `medicalconsent` (JavaScript `MedicalConsentContract`)

All container definitions live under `blockchain/artifacts` and are orchestrated with Docker Compose.

---

## Prerequisites

Install these tools before running the network:

| Tool | Version | Notes |
|------|---------|-------|
| Docker & Docker Compose | latest stable | Required for running Fabric components |
| Node.js & npm | ≥ 16 | Used to package/install JavaScript chaincode |
| Go | ≥ 1.18 | Required by Fabric toolchain (lifecycle packaging) |
| jq, openssl | optional | Used by helper scripts |

The Fabric binaries (`peer`, `osnadmin`, etc.) must be on your PATH if you plan to interact with the network manually.

---

## Starting the Network

All orchestration scripts reside in `blockchain/scripts`.

```bash
cd blockchain/scripts

# Optionally preset CouchDB credentials, then start everything
./start-with-env.sh   # or ./start.sh if CouchDB defaults are already exported

# The start script performs the following:
#   1. Launches Fabric CAs via docker-compose
#   2. Generates channel artifacts
#   3. Starts orderers, peers, and CouchDB containers
#   4. Creates channel "mychannel"
#   5. Deploys the medicalconsent chaincode
```

When you are finished:

```bash
./stop.sh
```

This tears down all containers defined in `artifacts/`.

---

## Chaincode Details

- **Location:** `blockchain/artifacts/chaincode/javascript/`
- **Contract class:** `MedicalConsentContract`
- **Key transaction functions:**
  - `registerDoctorProfile(name, specialization)`
  - `createPatientRecord(fileName, s3ObjectKey, fileHash, details)`
  - `createMedicalRecord(patientId, details, fileName, s3ObjectKey, fileHash)`
  - `grantConsent(recordId, doctorId)` / `revokeConsent(consentId)`
  - `getRecordById(recordId)` and `findAssetsByQuery(query)`
  - `removeFileFromRecord(recordId)`, `archiveMedicalRecord(recordId)`
  - `getConsentStatus(consentId)` & `getAssetHistory(id)`

For development changes, use:

```bash
# Package, install, approve, and commit an updated chaincode
./redeploy-chaincode.sh

# Force rebuild and reinstall (cleans old package first)
./force-rebuild-chaincode.sh
```

The scripts wrap the Fabric lifecycle commands so you only need to edit the smart contract and rerun the helper.

---

## Sequence Diagrams

<img width="3372" height="2829" alt="image" src="https://github.com/user-attachments/assets/7f46d24e-d364-4ec2-90cf-22bd8cf4aadd" />

<img width="3168" height="2530" alt="image" src="https://github.com/user-attachments/assets/8192dcee-ed50-4be6-b773-4696456448f5" />



## Utility Scripts

| Script | Purpose |
|--------|---------|
| `start.sh` | Bring up CAs, peers, orderers, create channel, deploy chaincode |
| `start-with-env.sh` | Sets default CouchDB credentials before running `start.sh` |
| `stop.sh` | Tear down all Fabric containers |
| `createChannel.sh` | Create/join channel `mychannel` (called by `start.sh`) |
| `deployChaincode.sh` | Install and commit `medicalconsent` (called by `start.sh`) |
| `redeploy-chaincode.sh` | Lifecycle upgrade for iterative development |
| `force-rebuild-chaincode.sh` | Removes old packages before redeploying |
| `chaincode_test.sh`, `test-endorsement.sh` | Convenience scripts for ad‑hoc testing |

All scripts assume they are executed from `blockchain/scripts`.

---

## Verifying the Deployment

After running `start.sh` you can confirm the network is healthy by running:

```bash
# List containers
docker ps --format '{{.Names}}' | grep consent

# Check installed chaincode
peer lifecycle chaincode queryinstalled

# Query chaincode from Org1 (peer binary must be configured)
peer chaincode query \
  -C mychannel \
  -n medicalconsent \
  -c '{"function":"getMyId","Args":[]}'
```

If you need to rotate credentials or adjust ports, edit the docker-compose files under `blockchain/artifacts` before starting the network.

---

For benchmark instructions, refer to `blockchain/caliper/caliper-benchmarks-local/README.md`. For the application services (API and React client), see their respective READMEs.
