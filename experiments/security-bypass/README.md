# Compromised-gateway security test (reviewer item 8)

> The claim that a compromised gateway/application layer still cannot read
> unauthorized data was never tested.

`bypass-test.js` **simulates a compromised application tier**. It connects to
the chaincode directly through the Fabric SDK with a *legitimate enrolled
doctor identity* and deliberately skips every check the Express API performs
(role gating, consultation verification, ownership checks). If the security
model is sound, the **chaincode alone** must still deny each unauthorized
action — because authorization is derived from the caller's signed X.509
certificate (`principalOf` reads the `organization` attribute off the ecert),
never from anything the application asserts.

## Relationship to the offline unit tests

The same authorization matrix is proven **offline, with no network**, by the
chaincode policy unit tests in
`blockchain/artifacts/chaincode/javascript/test/policy.test.js`
(`npm test` in that directory). Those tests exercise `authorize()` as a pure
function over every (action, principal, consent-state) combination and assert
the matrix is exhaustive.

This script is the **online counterpart**: it confirms that the *deployed*
chaincode on a *live network* actually enforces that same matrix when driven by
a real SDK client that bypasses the API. Offline proves the policy; this proves
the deployment.

## Assertions

| # | Action (chaincode call, API checks skipped) | Expected |
|---|----------------------------------------------|----------|
| a | doctor reads a record with **no consent** granted | DENIED |
| + | doctor reads **after the owner grants consent** (positive control) | ALLOWED |
| b | doctor reads **after the owner revokes consent** | DENIED |
| c | doctor calls `grantConsent` on a record they do **not own** | DENIED |
| d | a **non-owner patient** reads the record | DENIED |

The script normalizes to a no-consent baseline first (idempotent), so it is
safe to re-run. It exits non-zero if any assertion fails and prints a pass/fail
table. Denials are recognized by the chaincode's stable `ACCESS_DENIED` error
token (see `lib/domain/errors.js`).

## Prerequisites

- The Fabric network is running with the chaincode committed.
- `fabric-network` installed here (`npm install` in this directory).
- Three enrolled wallet identities present under `api/wallets/`:
  - a **doctor** (org1),
  - the **owner patient** of the target record (org2),
  - a **different patient** (org2).
- A `RECORD_ID` owned by the owner patient (create one via the API, e.g.
  `POST /v1/records/self` as that patient).

The doctor's on-ledger id and the doctor profile are handled automatically
(the script reads `getMyId` and upserts `registerDoctorProfile`).

## Usage

```bash
npm install

RECORD_ID=record_<txid> \
DOCTOR_IDENTITY=doctor@example.com \
OWNER_IDENTITY=patient-owner@example.com \
OTHER_PATIENT_IDENTITY=patient-other@example.com \
node bypass-test.js
```

Optional env vars (defaults shown): `DOCTOR_ORG=org1`, `OWNER_ORG=org2`,
`OTHER_PATIENT_ORG=org2`, `CHANNEL=mychannel`, `CC_NAME=medicalconsent`,
`PROFILE_DIR=../../api/connection-profiles`, `WALLET_DIR=../../api/wallets`,
`DISCOVERY_AS_LOCALHOST=false`.

> The connection profile must be generated for the same run mode you execute in
> (host vs. container). If TLS-cert paths don't resolve, point `PROFILE_DIR` at
> the matching `connection-<org>.json`, or regenerate with
> `api/connection-profiles/generate-ccp.sh`.
