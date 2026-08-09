#!/bin/bash
# Container resource sampler (reviewer item 15).
#
# Samples `docker stats` for every running container at a FIXED interval
# (default 5 s) and appends CSV rows:
#   timestamp,name,cpu_pct,mem_used_mib,mem_limit_mib,mem_pct
#
# Measurement method (state this in figure captions):
#   tool = docker stats (Docker Engine cgroup counters), one-shot samples,
#   interval = $INTERVAL seconds, CPU% is normalized to a single core the way
#   docker stats reports it (may exceed 100 on multi-core containers).
#
# Usage: collect-docker-stats.sh [interval_seconds] [output.csv]
# Stops on SIGTERM/SIGINT (run-benchmarks.sh manages its lifecycle).
set -euo pipefail

INTERVAL="${1:-5}"
OUT="${2:-resource-usage.csv}"

mkdir -p "$(dirname "$OUT")"
if [ ! -s "$OUT" ]; then
	echo "timestamp,name,cpu_pct,mem_used_mib,mem_limit_mib,mem_pct" > "$OUT"
fi

to_mib() {
	# "123.4MiB" / "1.5GiB" / "900KiB" / "1.2GB" -> MiB
	awk '{
		v = $0 + 0
		if ($0 ~ /GiB|GB/) v *= 1024
		else if ($0 ~ /KiB|kB|KB/) v /= 1024
		else if ($0 ~ /B$/ && $0 !~ /iB|GB|kB|KB|MB/) v /= 1048576
		printf "%.1f", v
	}' <<< "$1"
}

echo "Sampling docker stats every ${INTERVAL}s -> $OUT (Ctrl-C to stop)" >&2
while true; do
	ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
	docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' |
	while IFS='|' read -r name cpu mem mempct; do
		used="${mem%%/*}"; limit="${mem##*/}"
		echo "$ts,$name,${cpu%\%},$(to_mib "$used"),$(to_mib "$limit"),${mempct%\%}"
	done >> "$OUT"
	sleep "$INTERVAL"
done
