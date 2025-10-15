# ConsentMD API Service

Node.js/Express gateway that exposes REST endpoints for patient consent management, orchestrates Hyperledger Fabric transactions, and brokers secure access to off-chain medical records.

---

## Highlights

- **Authentication** – JWT-based login for patients, doctors, and admins using MongoDB-backed user records.
- **Consent orchestration** – Invokes Fabric chaincode (via the Fabric Gateway SDK) to create patient records, grant/revoke consent, and query ledger state.
- **Record storage integration** – Generates signed AWS S3 URLs for uploading/downloading EHR artefacts; stores hashes and metadata on-chain.
- **Consultation support** – REST endpoints for booking and listing virtual consultations between patients and providers.
- **QSCC proxy** – Utility endpoints for querying Fabric channel/chaincode status for operational monitoring.

---

## Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | ≥ 16 | Uses ES2020 features and Fabric Gateway SDK |
| npm | ≥ 8 | Recommended to match Node version |
| MongoDB | Atlas or self-hosted | Persists users, sessions, consultations |
| Hyperledger Fabric network | Running ConsentMD network (`mychannel`, `medicalconsent` chaincode) |
| AWS S3 (or compatible) | Stores encrypted medical record files |

Before starting the API ensure the Fabric Docker network is live (`blockchain/scripts/start.sh`) and the `connection-profiles` mounted here match the generated crypto materials.

---

## Installation

```bash
cd api
npm install
```

The project uses npm scripts (not yarn). Installing dependencies also fetches the Fabric Gateway, CA client, and other integrations.

---

## Configuration

Environment variables are loaded from `.env`. Copy the existing template and update it with your own secrets:

```bash
cp .env .env.local    # optional backup
```

Key settings (define as needed):

| Variable | Description |
|----------|-------------|
| `PORT` | API port (default 3000) |
| `ENV` | `development`, `production`, or `test` |
| `JWT_SECRET`, `JWT_ACCESS_EXPIRATION_MINUTES`, `JWT_REFRESH_EXPIRATION_DAYS` | Authentication tokens |
| `MONGODB_URL` or `DB_URI` | Connection string to MongoDB/Atlas |
| `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS`, `AWS_PRIVATE_BUCKET_NAME` | Credentials for S3 file storage |
| `BLOCKCHAIN_CHANNEL_NAME`, `BLOCKCHAIN_CHAINCODE_NAME` | Fabric network identifiers (`mychannel`, `medicalconsent`) |
| `CA_ADMIN_ID`, `CA_ADMIN_SECRET` | Fabric CA admin credentials when enrolling identities |
| `COMMON_PASSWORD` | Default bootstrap password for seeded users |

> **Security note:** the committed `.env` file contains sample values. Replace every secret with your own credentials before running in any environment.

Fabric gateway connection profiles for Org1/Org2 are stored under `connection-profiles/`. Update them if you regenerate Fabric crypto material.

---

## Running the Service

### Development

```bash
npm run dev
```

Runs the API with `nodemon`, reloading on file changes. Logs are written through Winston (`api/src/logger`).

### Production

```bash
npm start
```

Uses PM2 (`ecosystem.config.json`) to manage the process.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start hot-reloading development server |
| `npm start` | Run under PM2 (production configuration) |
| `npm test` | Execute Jest test suite (unit + integration) |
| `npm run lint` | Run ESLint on the codebase |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run docker:dev` / `npm run docker:prod` | Docker Compose profiles (optional) |

---

## API Surface

All routes are namespaced under `/v1`.

| Route | Purpose |
|-------|---------|
| `POST /v1/auth/login` | Authenticate and issue JWTs |
| `POST /v1/records` | Patients upload metadata & create new records |
| `POST /v1/records/grant` | Patients grant consent to a doctor | 
| `POST /v1/records/:consentId/revoke` | Revoke an existing consent | 
| `GET /v1/records/:recordId` | Fetch a record (enforces consent) |
| `GET /v1/records` | List patient-owned records |
| `GET /v1/records/accessible` | List records a doctor can access |
| `GET /v1/records/:recordId/file-url` | Generate signed URL for file download |
| `DELETE /v1/records/:recordId/file` | Remove file metadata from a record |
| `GET /v1/consultations` / `POST /v1/consultations` | Manage tele-consultation slots |
| `GET /v1/qscc/*` | Fabric QSCC proxy endpoints (channel/chaincode status) |

Bearer tokens are required for all routes except `/v1/auth`. See `api/src/routes/v1` for the full router definitions.

Swagger documentation (when enabled) is hosted at `/v1/docs`.

---

## Integration Notes

- **Fabric identities** – Wallets are stored under `wallets/`. The services auto-enroll Org1/Org2 users based on CA credentials supplied in `.env`.
- **File uploads** – Temporary files land in `uploads/` before being pushed to S3. Clean up the folder regularly in local development.
- **Logging** – Winston rotates daily log files (see `src/logger`). Adjust transports as needed.

---

## Troubleshooting

- `Error: Identity not found` – Ensure the Fabric CA admin credentials are correct and the service has write access to `wallets/`.
- `peer connection refused` – Fabric network is not running or connection profiles point to the wrong ports.
- `AWSSignatureDoesNotMatch` – AWS key/secret mismatch or bucket region mismatch; verify `.env` and AWS IAM policies.
- `MongoNetworkError` – Confirm MongoDB URI, whitelist the VM/host in Atlas, or start your local mongod instance.

---

For system-wide architecture, deployment guidance, and benchmark results see the project root `README.md`.
