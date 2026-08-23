#!/usr/bin/env python3
"""Render the resource-utilization figure (paper Figure 2) clearly.

Two stacked panels (CPU%, memory MiB), 300-DPI PNG + vector PDF. To keep the
figure legible (reviewer comment 1 is about clarity, not just resolution), the
seven system-under-test containers are aggregated into four component roles and
each series is smoothed with a short rolling mean to remove docker-stats
point-sample spikes. The sampling interval is carried in the on-figure title
(reviewer comment 15).

Usage: python3 resource_util.py <resource-usage.csv> <out-basename> [--per-container]
"""
import sys
from collections import defaultdict
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

DPI = 300
SMOOTH = 9  # rolling-mean window (~1 min at a ~7 s sampling interval)

# Aggregate the SUT containers into readable component roles.
ROLES = [
    ("CouchDB (2 instances)", ("couchdb0", "couchdb1"), "#1f77b4"),
    ("Peers (2 endorsers)", ("peer0.org1.example.com", "peer0.org2.example.com"), "#d62728"),
    ("Raft orderers (3)", ("orderer.example.com", "orderer2.example.com", "orderer3.example.com"), "#7f7f7f"),
    ("Consent chaincode (CCaaS)", ("medicalconsent-ccaas",), "#2ca02c"),
]


def load(path):
    rows = defaultdict(lambda: {"t": [], "cpu": [], "mem": []})
    import csv
    for r in csv.DictReader(open(path)):
        n = r["name"]
        rows[n]["t"].append(datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")))
        rows[n]["cpu"].append(float(r["cpu_pct"]))
        rows[n]["mem"].append(float(r["mem_used_mib"]))
    return rows


def smooth(xs, w=SMOOTH):
    if w <= 1 or len(xs) < w:
        return xs
    out, half = [], w // 2
    for i in range(len(xs)):
        lo, hi = max(0, i - half), min(len(xs), i + half + 1)
        out.append(sum(xs[lo:hi]) / (hi - lo))
    return out


def median_interval(rows):
    d = []
    for v in rows.values():
        ts = sorted(v["t"])
        d += [(b - a).total_seconds() for a, b in zip(ts, ts[1:])]
    return sorted(d)[len(d) // 2] if d else None


def aligned_role(rows, members, metric, grid, t0):
    """Sum a role's members onto a common minute-grid (interpolated), then smooth."""
    total = [0.0] * len(grid)
    for name in members:
        v = rows.get(name)
        if not v or not v["t"]:
            continue
        mins = [(t - t0).total_seconds() / 60 for t in v["t"]]
        vals = v[metric]
        j = 0
        for i, g in enumerate(grid):
            while j + 1 < len(mins) and mins[j + 1] <= g:
                j += 1
            total[i] += vals[min(j, len(vals) - 1)]
    return smooth(total)


def main():
    csv_path, out = sys.argv[1], sys.argv[2]
    per_container = "--per-container" in sys.argv
    rows = load(csv_path)
    t0 = min(v["t"][0] for v in rows.values() if v["t"])
    tmax = max((t - t0).total_seconds() / 60 for v in rows.values() for t in v["t"])
    interval = median_interval(rows)
    grid = [i * (interval or 7) / 60 for i in range(int(tmax * 60 / (interval or 7)) + 1)]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 6.5), sharex=True)
    if per_container:
        for name in sorted(rows):
            mins = [(t - t0).total_seconds() / 60 for t in rows[name]["t"]]
            ax1.plot(mins, smooth(rows[name]["cpu"]), label=name, linewidth=1.0)
            ax2.plot(mins, smooth(rows[name]["mem"]), label=name, linewidth=1.0)
        ncol = 3
    else:
        for label, members, color in ROLES:
            ax1.plot(grid, aligned_role(rows, members, "cpu", grid, t0), label=label, color=color, linewidth=1.8)
            ax2.plot(grid, aligned_role(rows, members, "mem", grid, t0), label=label, color=color, linewidth=1.8)
        ncol = 2

    ax1.set_ylabel("CPU utilization (%)")
    ax2.set_ylabel("Memory (MiB)")
    ax2.set_xlabel("Elapsed time (minutes)")
    for ax in (ax1, ax2):
        ax.grid(True, linewidth=0.3, alpha=0.6)
        ax.margins(x=0.01)
    ax1.legend(fontsize=8.5, ncols=ncol, frameon=False, loc="upper center")
    cap = "Container CPU (top) and memory (bottom) during the benchmark sweep"
    if interval:
        cap += f"  (docker stats, {interval:.0f} s effective interval; {SMOOTH}-sample rolling mean)"
    ax1.set_title(cap, fontsize=10.5)
    fig.tight_layout()
    for ext in ("pdf", "png"):
        fig.savefig(f"{out}.{ext}", dpi=DPI, bbox_inches="tight")
    print(f"wrote {out}.pdf / .png ({DPI} DPI){' [per-container]' if per_container else ' [grouped]'}")


if __name__ == "__main__":
    main()
