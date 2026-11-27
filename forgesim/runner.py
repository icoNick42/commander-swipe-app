"""Run Forge simulation batches for a job.

A job (jobs/<id>.json in the board repo) says which decks to test, which
opponents to draw from and how many games to play. It is split into
batches of a few games each; each batch is one Forge process with one
seat order and one seed, and its parsed results go to
results/<job id>/<batch id>.json. A batch is the unit that gets retried,
so a crash or a pause only loses a few games.

Pairing: batch i uses the same opponents, seat and seed for every test
deck, so "v0 vs v1" compares the decks under the same conditions.

Job fields (defaults in brackets):
  id, note
  status          "active" | "paused" | "done"           [active]
  tests           {label: deck path}  decks being measured (first = baseline)
  opponents       [deck paths or globs]  pool the other seats are drawn from
  window          optional power window for the opponents, a name from
                  decks/pools.json "windows" ("default") or [low, high] steps
                  on Manafold's slider; decks with no score are left out
  picks           optional [deck paths or globs]: Nick's picks. When any exist,
                  picks_per_game of them (pools.json, default 1) sit at every
                  table and `opponents` fills the other seats. Picks skip the
                  window: Nick chose them.
  games_per_test  [200]     games_per_batch  [4]     pod  [4 players]
  clock           [1200]    seconds before Forge calls a game a draw
  seed            [1]
  machines        PCs that share the batches, e.g. ["desktop", "laptop"] (required;
                  the first builds variants and writes the report; "any" = every
                  machine runs everything, only for one-machine tests)
  mc              ["off"]   Forge's Monte Carlo AI setting (on | max | off)
  priority        [0]       higher runs first
  paired          [true]    same seeds for every test deck (false for noise tests)
"""

import fnmatch
import glob
import gzip
import json
import math
import os
import random
import re
import subprocess
import sys
import time

from . import decks as D
from .parse import parse_output

NOISE = (
    "not assigned to any set",
    "Picked up JAVA_TOOL_OPTIONS",
    "Picked up _JAVA_OPTIONS",
    "default (ie. inherited from base class) implementation",
    "dated in the future",
)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "deck"


def load_job(path):
    with open(path, encoding="utf-8-sig") as fh:
        job = json.load(fh)
    job.setdefault("status", "active")
    job.setdefault("games_per_test", 200)
    job.setdefault("games_per_batch", 4)
    job.setdefault("pod", 4)
    job.setdefault("clock", 1200)
    job.setdefault("seed", 1)
    job.setdefault("machines", [])
    job.setdefault("mc", "off")
    job.setdefault("priority", 0)
    return job


def test_path(job, label):
    """Deck file for a test label. A test is a .dck path, or a recipe
    {"base": ".dck", "export": ".txt", "app_swaps": N}: a variant the board
    builds with the app's own logic, saved under decks/variants/<job>/."""
    t = job["tests"][label]
    if isinstance(t, str):
        return t
    return "decks/variants/%s/%s.dck" % (slug(job["id"]), slug(label))


def _expand(patterns, root):
    pool = []
    for pat in patterns or []:
        hits = sorted(glob.glob(os.path.join(root, pat)))
        pool += (
            [os.path.relpath(h, root) for h in hits]
            if any(c in pat for c in "*?[")
            else [pat]
        )
    seen, out = set(), []
    for p in pool:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _pools_conf(root):
    try:
        with open(os.path.join(root, "decks", "pools.json"), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def window_steps(job, root):
    w = job.get("window")
    if w is None:
        return None
    if isinstance(w, str):
        w = _pools_conf(root).get("windows", {}).get(w)
        if w is None:
            raise ValueError("job %s: unknown window %r" % (job["id"], job["window"]))
    return int(w[0]), int(w[1])


def opponent_pool(job, root):
    pool = _expand(job.get("opponents", []), root)
    steps = window_steps(job, root)
    if steps is None:
        return pool
    try:
        with open(os.path.join(root, "decks", "power.json"), encoding="utf-8") as fh:
            scores = json.load(fh)["decks"]
    except (OSError, ValueError, KeyError):
        scores = {}
    return [
        p for p in pool
        if p.replace("\\", "/") in scores
        and steps[0] <= scores[p.replace("\\", "/")]["step"] <= steps[1]
    ]


def pick_pool(job, root):
    picks = _expand(job.get("picks", []), root)
    return [p for p in picks if os.path.exists(os.path.join(root, p))]


def batches(job, root):
    """All batches of a job, in run order: [{id, test, index, seat, seed, opponents, owner}]."""
    picks = pick_pool(job, root)
    pool = [p for p in opponent_pool(job, root) if p not in picks]
    pod = job["pod"]
    n_picks = 0
    if picks:
        n_picks = min(
            len(picks), pod - 1,
            int(job.get("picks_per_game", _pools_conf(root).get("picks_per_game", 1))),
        )
    if len(pool) < pod - 1 - n_picks:
        raise ValueError(
            "job %s: need at least %d opponents, have %d"
            % (job["id"], pod - 1 - n_picks, len(pool))
        )
    n = math.ceil(job["games_per_test"] / job["games_per_batch"])
    out = []
    machines = [m.lower() for m in job["machines"]]
    if not machines:
        raise ValueError("job %s: say which machines run it (\"machines\": [\"desktop\", \"laptop\"])" % job["id"])
    paired = job.get("paired", True)
    for i in range(n):
        rng = random.Random(job["seed"] * 1000003 + i)
        opps = rng.sample(pool, pod - 1 - n_picks)
        if n_picks:
            # picks first in the draw so a job without picks keeps its old tables
            opps = rng.sample(picks, n_picks) + opps
            rng.shuffle(opps)
        seat = i % pod  # 0-based seat for the test deck
        # Forge replays a game exactly from its seed. Paired (the default): every
        # test deck gets the same seed in batch i, so a deck and its variant play
        # the same games until a swapped card matters. Unpaired: each deck gets
        # its own seeds (for the "same deck twice" noise test).
        for t, label in enumerate(job["tests"]):
            out.append(
                {
                    "id": "%s-%04d" % (slug(label), i),
                    "test": label,
                    "index": i,
                    "seat": seat,
                    "seed": job["seed"] * 7919 + i + (0 if paired else 100000 * (t + 1)),
                    "opponents": opps,
                    # whole batch index to one machine: Forge's draw clock is wall time,
                    # so a deck and its variant should run on the same hardware
                    "owner": machines[i % len(machines)],
                }
            )
    return out


def stage_decks(job, batch, root, work):
    """Copy this batch's decks into one folder with unique Name= labels.
    Returns (deck file names in seat order, {label: commander names})."""
    ddir = os.path.join(work, "decks")
    os.makedirs(ddir, exist_ok=True)
    seats = list(batch["opponents"])
    seats.insert(batch["seat"], ("TEST", test_path(job, batch["test"])))
    files, cmdrs = [], {}
    for n, entry in enumerate(seats):
        if isinstance(entry, tuple):
            label, path = batch["test"], entry[1]
        else:
            path = entry
            label = "o-" + slug(os.path.splitext(os.path.basename(path))[0])
        _name, commanders, main = D.read_dck(os.path.join(root, path))
        fname = "%s.dck" % slug(label)
        D.write_dck(os.path.join(ddir, fname), label, commanders, main)
        files.append(fname)
        cmdrs[label] = [c for _, c in commanders]
    return files, cmdrs


def forge_command(cfg, deck_dir, files, job, batch):
    f = cfg["forge"]
    cmd = (
        [
            f["java"],
            "-Xmx" + f.get("mem", "3g"),
            "-Djava.awt.headless=true",
            "-Dio.netty.tryReflectionSetAccessible=true",
            "-Dfile.encoding=UTF-8",
            "-Dstdout.encoding=UTF-8",
            "-Dstderr.encoding=UTF-8",
            "-jar",
            f["jar"],
            "sim",
            "-D",
            os.path.abspath(deck_dir),
            "-d",
        ]
        + files
        + [
            "-f",
            "commander",
            "-n",
            str(job["games_per_batch"]),
            "-c",
            str(job["clock"]),
            "-s",
            str(batch["seed"]),
        ]
    )
    if job.get("mc") and job["mc"] != "off":
        cmd += ["-mc", job["mc"]]
    return cmd


def run_batch(job, batch, root, cfg, stop=None):
    """Run one batch; returns the result dict (or None if stopped/failed)."""
    work = os.path.join(cfg["work_dir"], slug(job["id"]), batch["id"])
    files, cmdrs = stage_decks(job, batch, root, work)
    cmd = forge_command(cfg, os.path.join(work, "decks"), files, job, batch)
    kw = {}
    if os.name == "nt":
        kw["creationflags"] = (
            0x00004000 | 0x08000000
        )  # BELOW_NORMAL priority, no console window
    else:
        kw["preexec_fn"] = lambda: os.nice(10)
    started = time.time()
    log_path = os.path.join(work, "forge.log")
    with open(log_path, "w", encoding="utf-8", errors="replace") as out:
        proc = subprocess.Popen(
            cmd, cwd=cfg["forge"]["cwd"], stdout=out, stderr=subprocess.STDOUT, **kw
        )
        limit = job["clock"] * job["games_per_batch"] + 600
        while proc.poll() is None:
            if stop is not None and stop():
                proc.kill()
                proc.wait()
                return None
            if time.time() - started > limit:
                proc.kill()
                proc.wait()
                break
            time.sleep(2)
    with open(log_path, encoding="utf-8", errors="replace") as fh:
        text = "\n".join(
            l for l in fh.read().splitlines() if not any(n in l for n in NOISE)
        )
    games = parse_output(text, cmdrs)
    # keep the full log locally, compressed; results only carry the numbers
    logs = os.path.join(cfg["work_dir"], "logs", slug(job["id"]))
    os.makedirs(logs, exist_ok=True)
    with gzip.open(
        os.path.join(logs, batch["id"] + ".log.gz"), "wt", encoding="utf-8"
    ) as gz:
        gz.write(text)
    os.remove(log_path)
    test = batch["test"]
    for g in games:
        # only the test deck's per-card stats are kept; opponents' cards aren't needed
        # and only cards that did something, to keep the files (and git) small
        mine = g["cards"].get(test, {})
        g["cards"] = {test: {n: c for n, c in mine.items() if any(v for k, v in c.items() if k != "first_cast_turn")}}
    return {
        "job": job["id"],
        "batch": batch["id"],
        "test": test,
        "index": batch["index"],
        "seat": batch["seat"] + 1,
        "seed": batch["seed"],
        "opponents": batch["opponents"],
        "machine": cfg["name"],
        "forge": cfg["forge"].get("version", ""),
        "exit_code": proc.returncode,
        "seconds": round(time.time() - started, 1),
        "games_expected": job["games_per_batch"],
        "games": games,
        "error_tail": "" if games else text[-2000:],
    }


def result_path(root, job, batch):
    return os.path.join(root, "results", slug(job["id"]), batch["id"] + ".json")


def pending(job, root, machine, take_any=False):
    """Batches of this job still to run on this machine."""
    out = []
    for b in batches(job, root):
        if os.path.exists(result_path(root, job, b)):
            continue
        if not os.path.exists(os.path.join(root, test_path(job, b["test"]))):
            continue  # a variant not built yet
        if take_any or b["owner"] in (machine, "any"):
            out.append(b)
    return out


def save_result(root, job, batch, res):
    path = result_path(root, job, batch)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(res, fh, separators=(",", ":"))
    os.replace(tmp, path)
    return path


def main(argv):
    """python -m forgesim.runner <job.json> [--any] [--max N]  (runs in the foreground)"""
    from .board import load_config, run_jobs

    cfg = load_config()
    args = argv[1:]
    take_any = "--any" in args
    mx = None
    if "--max" in args:
        mx = int(args[args.index("--max") + 1])
    job_paths = [a for a in args if a.endswith(".json")]
    run_jobs(cfg, job_paths, take_any=take_any, max_batches=mx, sync=False)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
