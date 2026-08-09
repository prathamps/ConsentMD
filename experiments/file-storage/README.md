# Off-chain file-storage benchmark (reviewer item 10)

> Off-chain file storage is described but never benchmarked.

ConsentMD stores medical files in S3-compatible object storage and records only
the SHA-256 hash and object key on-chain. `file-bench.js` drives the **real API
endpoints** that exercise that path and reports throughput and latency
distributions per file size, so the off-chain design has measured numbers.

Dependency-light: **Node stdlib only** (`http`, `https`, `crypto`) plus the
local `stats.js`.

## Endpoints exercised

Discovered from `api/src/routes/v1/`:

- **Auth** — `POST /v1/auth/login` with `{email, password}`; the access token
  is read from `payload.access.token` and sent as `Authorization: Bearer`.
- **Upload** — `POST /v1/records/self` (patient self-upload), `multipart/form-data`
  with fields `file` (a generated **PDF** — the API's filter only accepts
  `application/pdf`) and `details`. The response `payload` carries `recordId`
  and `s3ObjectKey`.
- **Download** — `GET /v1/records/:recordId/file-url`, which returns a
  pre-signed object-storage URL in `payload.url`. By default the benchmark
  times this API call (the download-initiation path); with `--download-object`
  it also fetches the object from storage and counts those bytes.

Each generated PDF embeds a unique nonce so every upload has a distinct hash
(the API rejects duplicate content), and the largest default size (5 MB)
matches the API's `fileSize` limit.

## Metrics

Per size, for upload and download separately:

- `ok` / `fail` counts,
- throughput: `req/s` and `MB/s` (over the phase wall-clock),
- latency: `mean`, `p50`, `p95`, `p99` (ms).

**Failure** (same definition as the other experiments): HTTP status >= 400, any
network error, or a response slower than 30 s. The process exits non-zero if any
request failed.

## Prerequisites

- The API is running and reachable (default `http://localhost:3000`) and its
  object storage (S3 / MinIO) is configured — uploads write real objects.
- A **patient** account whose credentials you pass via env vars.

## Usage

```bash
API_EMAIL=patient@example.com \
API_PASSWORD='...' \
node file-bench.js --sizes 100KB,1MB,5MB --requests 50 --concurrency 10
```

Flags (defaults shown):

- `--base-url` (`API_BASE_URL`, `http://localhost:3000`)
- `--email` / `--password` (`API_EMAIL` / `API_PASSWORD`)
- `--sizes 100KB,1MB,5MB` — accepts `B`/`KB`/`MB`/`GB` suffixes
- `--requests 50` — uploads per size
- `--concurrency 10` — max in-flight requests
- `--download-object` — also fetch the object from the pre-signed URL
- `--upload-path /v1/records/self` — override the upload endpoint

Results are printed as a table and written to `results.csv`.

> Note: `POST /v1/records/self` runs the API's server-side duplicate-hash check
> and the full patient-record chaincode submission, so upload latency includes
> a ledger write, not just the S3 PUT. That is the honest end-to-end cost of the
> off-chain design as implemented. If the API returns errors for this endpoint
> on your build, the benchmark reports them as failures rather than hiding them.
