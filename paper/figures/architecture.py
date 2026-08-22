#!/usr/bin/env python3
"""Render ConsentMD's architecture (paper Figure 1) as a crisp vector PDF + 300-DPI PNG.

Reproducible replacement for the blurry Figure 1 (reviewer comment 1). Reflects
the deployed topology used in the evaluation (reviewer comment 6): THREE Raft
orderers on a single host, two peers each with a CouchDB state database, the
consent chaincode as an external service (CCaaS), a REST/gateway tier, and
off-chain object storage anchored on-chain by a SHA-256 hash.

Usage:  python3 paper/figures/architecture.py [output-dir]
Requires: matplotlib.
"""

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch  # noqa: E402

DPI = 300
INK = "#1f2933"
EDGE = "#52606d"

# Palette (colour-blind safe, prints legibly in grayscale)
C_CLIENT = "#dbeafe"
C_APP = "#e6f4ea"
C_PEER = "#fde8d7"
C_DB = "#fce7f3"
C_ORDER = "#e8e3fb"
C_OFF = "#eef1f4"


def box(ax, x, y, w, h, text, fc, fontsize=10, bold=False):
    ax.add_patch(FancyBboxPatch(
        (x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.06",
        linewidth=1.2, edgecolor=EDGE, facecolor=fc, mutation_aspect=1))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            fontsize=fontsize, color=INK, fontweight="bold" if bold else "normal",
            zorder=5, wrap=True)


def arrow(ax, p, q, style="-|>", ls="-", color=EDGE, lw=1.3):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle=style, mutation_scale=12,
                                 linewidth=lw, color=color, linestyle=ls,
                                 shrinkA=3, shrinkB=3, zorder=1))


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent)
    out.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(10, 6.2))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 66)
    ax.axis("off")

    # Client tier
    box(ax, 4, 52, 20, 8, "Patients / Clinicians\n(React web client)", C_CLIENT, bold=True)

    # Application tier
    box(ax, 4, 34, 20, 10, "REST API +\nFabric Gateway\n(Node.js)", C_APP, bold=True)
    box(ax, 4, 20, 20, 8, "Off-chain object store\n(medical files)", C_OFF)

    # Fabric boundary
    ax.add_patch(FancyBboxPatch(
        (32, 4), 64, 56, boxstyle="round,pad=0.2,rounding_size=0.4",
        linewidth=1.4, edgecolor="#9aa5b1", facecolor="#fbfcfd", zorder=0))
    ax.text(64, 57.6, "Hyperledger Fabric network (single host)",
            ha="center", va="center", fontsize=11, color=INK, fontweight="bold")

    # Chaincode (CCaaS)
    box(ax, 40, 44, 48, 8, "Consent chaincode  (CCaaS external service)\n"
                           "policy: role from X.509 cert · consent = one getState", C_APP, fontsize=9, bold=True)

    # Peers + CouchDB
    box(ax, 38, 28, 24, 10, "peer0.org1\n(endorser)", C_PEER, bold=True)
    box(ax, 66, 28, 24, 10, "peer0.org2\n(endorser)", C_PEER, bold=True)
    box(ax, 38, 17, 24, 7, "CouchDB\nstate DB (org1)", C_DB, fontsize=9)
    box(ax, 66, 17, 24, 7, "CouchDB\nstate DB (org2)", C_DB, fontsize=9)

    # Orderers (THREE — comment 6)
    for i, x in enumerate((40, 56.5, 73)):
        box(ax, x, 6, 15, 6.5, f"Raft\norderer {i+1}", C_ORDER, fontsize=8.5)
    ax.text(64, 13.8, "Ordering service: 3 Raft nodes (crash-tolerant process; single host)",
            ha="center", va="center", fontsize=8.5, color=EDGE, style="italic")

    # Arrows
    arrow(ax, (14, 52), (14, 44))                       # client -> API
    arrow(ax, (24, 39), (40, 47))                       # API -> chaincode (gateway)
    ax.text(31, 45, "invoke /\nquery", ha="center", va="center", fontsize=7.5, color=EDGE)
    arrow(ax, (14, 34), (14, 28))                       # API -> object store
    arrow(ax, (24, 24), (38, 21), ls=(0, (4, 3)))       # object store <-> API hash path
    ax.text(30, 26, "SHA-256\nanchor", ha="center", va="center", fontsize=7, color=EDGE)

    arrow(ax, (50, 44), (50, 38))                       # chaincode -> peer1
    arrow(ax, (78, 44), (78, 38))                       # chaincode -> peer2
    arrow(ax, (50, 28), (50, 24))                       # peer1 -> couch1
    arrow(ax, (78, 28), (78, 24))                       # peer2 -> couch2
    arrow(ax, (62, 33), (66, 33), style="<|-|>")        # peer gossip
    # Submit-to-ordering flow: a single clean connector down the middle gutter,
    # avoiding the CouchDB boxes (the italic caption states the relationship).
    arrow(ax, (64, 17), (64, 13), ls=(0, (4, 3)))

    fig.suptitle("ConsentMD deployment architecture", fontsize=13, fontweight="bold", y=0.98)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    for ext in ("pdf", "png"):
        fig.savefig(out / f"architecture.{ext}", dpi=DPI, bbox_inches="tight")
    plt.close(fig)
    print(f"wrote {out}/architecture.pdf and architecture.png ({DPI} DPI)")


if __name__ == "__main__":
    main()
