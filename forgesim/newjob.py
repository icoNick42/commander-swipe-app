"""Write a new job with its opponents frozen, so a rotation refresh can't
change it halfway (fair comparisons: every test deck meets the same tables
from start to finish).

    python -m forgesim.newjob <id> <label>=<deck path> [<label>=<deck path> ...]
        [--window default|precon|high|<lo>-<hi>] [--no-picks] [--no-chosen]
        [--from decks/rotation/*.dck,decks/gauntlet-b/*.dck]
        [--games 300] [--seed 50] [--priority 5] [--note "..."]

Defaults: opponents from the rotation plus both gauntlets, filtered to the
default window; Nick's picks at every table (pools.json picks_per_game);
his chosen opponents (decks/chosen) at about one table in chosen_one_in;
300 games per test; both PCs. It prints the job and writes jobs/<id>.json.
"""

import argparse
import json
import os
import sys

from . import runner as R

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_FROM = [
    "decks/rotation/*.dck",
    "decks/gauntlet-a/*.dck",
    "decks/gauntlet-b/*.dck",
]


def main(argv):
    ap = argparse.ArgumentParser(prog="forgesim.newjob")
    ap.add_argument("id")
    ap.add_argument(
        "tests", nargs="+", help="label=decks/....dck (first is the baseline)"
    )
    ap.add_argument("--window", default="default")
    ap.add_argument("--from", dest="src", default=",".join(DEFAULT_FROM))
    ap.add_argument("--no-picks", action="store_true")
    ap.add_argument("--no-chosen", action="store_true")
    ap.add_argument("--games", type=int, default=300)
    ap.add_argument("--seed", type=int, default=50)
    ap.add_argument("--priority", type=int, default=5)
    ap.add_argument("--note", default="")
    a = ap.parse_args(argv)

    window = a.window
    if "-" in window and window.replace("-", "").isdigit():
        lo, hi = window.split("-")
        window = [int(lo), int(hi)]
    probe = {
        "id": a.id,
        "opponents": a.src.split(","),
        "window": window,
        "picks": [] if a.no_picks else ["decks/picks/*.dck"],
        "chosen": [] if a.no_chosen else ["decks/chosen/*.dck"],
    }
    picks = R.pick_pool(probe, ROOT)
    chosen = R.chosen_pool(probe, ROOT)
    opps = [
        p.replace("\\", "/")
        for p in R.opponent_pool(probe, ROOT)
        if p not in picks and p not in chosen
    ]
    tests = {}
    for t in a.tests:
        label, path = t.split("=", 1)
        tests[label] = path
    job = {
        "id": a.id,
        "note": a.note
        or "Made by forgesim.newjob: opponents frozen from %s, window %s."
        % (a.src, a.window),
        "tests": tests,
        "opponents": opps,
        "picks": [p.replace("\\", "/") for p in picks],
        "chosen": [p.replace("\\", "/") for p in chosen],
        "chosen_one_in": R.chosen_one_in(probe, ROOT),
        "games_per_test": a.games,
        "games_per_batch": 4,
        "clock": 1200,
        "seed": a.seed,
        "machines": ["desktop", "laptop"],
        "priority": a.priority,
    }
    if not job["picks"]:
        del job["picks"]
    if not job["chosen"]:
        del job["chosen"], job["chosen_one_in"]
    R.load_job_dict = None
    full = (
        R.load_job.__wrapped__(job)
        if hasattr(R.load_job, "__wrapped__")
        else dict(job, pod=4, status="active", mc="off")
    )
    R.batches(full, ROOT)  # fails loudly if there aren't enough opponents
    out = os.path.join(ROOT, "jobs", a.id + ".json")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(job, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(
        "wrote %s: %d opponents, %d picks, %d chosen"
        % (out, len(opps), len(job.get("picks", [])), len(job.get("chosen", [])))
    )


if __name__ == "__main__":
    main(sys.argv[1:])
