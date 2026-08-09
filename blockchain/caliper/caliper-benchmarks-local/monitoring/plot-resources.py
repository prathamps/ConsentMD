#!/usr/bin/env python3
"""Render publication-quality resource-utilization figures (reviewer items 1, 15).

Reads the CSV written by collect-docker-stats.sh and produces CPU and memory
time-series plots at 300 DPI in both PNG and PDF (vector) form, so Figure 2
can be regenerated crisply at any size.

Usage:
    python3 monitoring/plot-resources.py <resource-usage.csv> [output-dir]
    python3 monitoring/plot-resources.py results/X/resource-usage.csv figs \
        --containers peer0.org1.example.com couchdb0 orderer.example.com

Requires: matplotlib (pip install matplotlib).
"""

import argparse
import csv
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

DPI = 300
# Containers that matter for the paper's Figure 2, in preference order.
DEFAULT_PREFIXES = ("peer", "orderer", "couchdb", "ca.", "dev-")


def load(csv_path, containers):
    series = defaultdict(lambda: {"t": [], "cpu": [], "mem": []})
    with open(csv_path, newline="") as fh:
        for row in csv.DictReader(fh):
            name = row["name"]
            if containers:
                if name not in containers:
                    continue
            elif not name.startswith(DEFAULT_PREFIXES):
                continue
            s = series[name]
            s["t"].append(datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")))
            s["cpu"].append(float(row["cpu_pct"]))
            s["mem"].append(float(row["mem_used_mib"]))
    return series


def sample_interval_seconds(series):
    for s in series.values():
        if len(s["t"]) > 1:
            return (s["t"][1] - s["t"][0]).total_seconds()
    return None


def plot(series, metric, ylabel, title, out_base, interval):
    fig, ax = plt.subplots(figsize=(8, 4.5))
    t0 = min(s["t"][0] for s in series.values() if s["t"])
    for name in sorted(series):
        s = series[name]
        minutes = [(t - t0).total_seconds() / 60 for t in s["t"]]
        ax.plot(minutes, s[metric], label=name, linewidth=1.4)
    ax.set_xlabel("Elapsed time (minutes)")
    ax.set_ylabel(ylabel)
    caption = title
    if interval:
        caption += f"  (docker stats, sampled every {interval:.0f} s)"
    ax.set_title(caption, fontsize=11)
    ax.grid(True, linewidth=0.3, alpha=0.6)
    ax.legend(fontsize=8, ncols=2, frameon=False)
    fig.tight_layout()
    for ext in ("png", "pdf"):
        fig.savefig(f"{out_base}.{ext}", dpi=DPI)
    plt.close(fig)
    print(f"wrote {out_base}.png / .pdf ({DPI} DPI)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("output_dir", nargs="?", default=".")
    parser.add_argument("--containers", nargs="*", default=None,
                        help="exact container names to plot (default: fabric containers)")
    args = parser.parse_args()

    series = load(args.csv_path, args.containers)
    if not series:
        sys.exit("No matching container samples found in the CSV.")

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    interval = sample_interval_seconds(series)
    plot(series, "cpu", "CPU utilization (%)",
         "Container CPU utilization during benchmark", out / "cpu-utilization", interval)
    plot(series, "mem", "Memory (MiB)",
         "Container memory usage during benchmark", out / "memory-usage", interval)


if __name__ == "__main__":
    main()
