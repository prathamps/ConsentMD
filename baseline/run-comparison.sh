#!/usr/bin/env bash
#
# One-shot comparison run for the ConsentMD non-blockchain baseline:
# starts the server on a fresh database, waits for /health, runs the load
# test with the defaults that mirror the Caliper suite, then stops the server.
#
# Any extra arguments are passed through to load-test.js, e.g.:
#   ./run-comparison.sh --workload read --tps 100 --duration 30 --runs 10

set -euo pipefail
cd "$(dirname "$0")"

PORT="${BASELINE_PORT:-3100}"
DB="${BASELINE_DB:-$(pwd)/data/comparison.db}"

# Fresh database so repeated comparison runs start from the same state.
rm -f "$DB" "$DB-wal" "$DB-shm"

BASELINE_PORT="$PORT" BASELINE_DB="$DB" node server.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true' EXIT

echo "Waiting for baseline server on port $PORT ..."
for i in $(seq 1 50); do
	if node -e "fetch('http://127.0.0.1:$PORT/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
		break
	fi
	if [ "$i" -eq 50 ]; then
		echo "server did not become healthy in time" >&2
		exit 1
	fi
	sleep 0.2
done

BASELINE_URL="http://127.0.0.1:$PORT" node load-test.js "$@"
