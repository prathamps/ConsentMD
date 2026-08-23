#!/usr/bin/env python3
"""Render the resource-utilization figure (paper Figure 2) crisply.

Two stacked panels (CPU%, memory MiB) per container over the benchmark sweep,
300-DPI PNG + vector PDF. Replaces the blurry Figure 2 (reviewer comment 1) and
carries the sampling method in the on-figure title (reviewer comment 15).

Usage: python3 resource_util.py <resource-usage.csv> <out-basename>
"""
import sys
from collections import defaultdict
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

DPI = 300
PREFIX = ("peer", "orderer", "couchdb", "medicalconsent")  # SUT containers


def load(path):
    s = defaultdict(lambda: {"t": [], "cpu": [], "mem": []})
    import csv
    for r in csv.DictReader(open(path)):
        n = r["name"]
        if not n.startswith(PREFIX):
            continue
        s[n]["t"].append(datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")))
        s[n]["cpu"].append(float(r["cpu_pct"]))
        s[n]["mem"].append(float(r["mem_used_mib"]))
    return s


def main():
    csv_path, out = sys.argv[1], sys.argv[2]
    s = load(csv_path)
    t0 = min(v["t"][0] for v in s.values() if v["t"])
    interval = None
    for v in s.values():
        if len(v["t"]) > 1:
            interval = (v["t"][1] - v["t"][0]).total_seconds()
            break

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 7), sharex=True)
    for name in sorted(s):
        mins = [(t - t0).total_seconds() / 60 for t in s[name]["t"]]
        ax1.plot(mins, s[name]["cpu"], label=name, linewidth=1.1)
        ax2.plot(mins, s[name]["mem"], label=name, linewidth=1.1)
    ax1.set_ylabel("CPU utilization (%)")
    ax2.set_ylabel("Memory (MiB)")
    ax2.set_xlabel("Elapsed time (minutes)")
    for ax in (ax1, ax2):
        ax.grid(True, linewidth=0.3, alpha=0.6)
    ax1.legend(fontsize=7, ncols=4, frameon=False, loc="upper center")
    cap = "Container CPU and memory during the benchmark sweep"
    if interval:
        cap += f"  (docker stats, sampled every {interval:.0f} s)"
    ax1.set_title(cap, fontsize=11)
    fig.tight_layout()
    for ext in ("pdf", "png"):
        fig.savefig(f"{out}.{ext}", dpi=DPI, bbox_inches="tight")
    print(f"wrote {out}.pdf / .png ({DPI} DPI)")


if __name__ == "__main__":
    main()
