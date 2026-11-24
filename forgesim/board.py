"""The job board: keeps each PC running sims with no one watching.

Loop (python run_board.py, started by the scheduled task at logon):
  1. If the PAUSE file exists (play.cmd and pause.cmd make it), stop any
     running sims and wait.
  2. git pull the sims branch: new jobs, and other machines' results.
  3. Run this machine's unfinished batches, `workers` at a time, at
     below-normal priority so the PC stays usable.
  4. Commit and push results every few minutes (and when a job finishes).
  5. When every batch of a job is in, the job's first machine writes its
     report (results/<job>/report.md + summary.json).
  6. Nothing to do: run the standing job (jobs/standing.json) if there is
     one, else sleep and check again.

machine.json (next to run_board.py, never committed):
  {"name": "desktop", "workers": 4,
   "forge": {"java": "...java.exe", "jar": "...jar-with-dependencies.jar",
             "cwd": "...\\app", "mem": "3g", "version": "2.0.16"},
   "work_dir": "...\\sim-work", "push": true}
"""

import glob
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, FIRST_COMPLETED, wait

from . import runner as R

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAUSE = os.path.join(ROOT, "PAUSE")
LOG = os.path.join(ROOT, "board.log")
PUSH_EVERY = 10 * 60
IDLE_SLEEP = 10 * 60
STANDING_REPORT_EVERY = 6 * 3600
ROUND_BATCHES = 6  # per worker: after this many, pull again so new jobs start soon


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        if os.path.getsize(LOG) > 2_000_000:
            os.replace(LOG, LOG + ".old")
    except OSError:
        pass


def load_config():
    with open(os.path.join(ROOT, "machine.json"), encoding="utf-8-sig") as fh:
        cfg = json.load(fh)
    cfg.setdefault("workers", 2)
    cfg.setdefault("work_dir", os.path.join(os.path.dirname(ROOT), "sim-work"))
    cfg.setdefault("push", True)
    return cfg


def git(*args, check=False):
    kw = {"creationflags": 0x08000000} if os.name == "nt" else {}
    p = subprocess.run(
        ["git", "-C", ROOT] + list(args), capture_output=True, text=True, **kw
    )
    if check and p.returncode != 0:
        raise RuntimeError("git %s failed: %s" % (" ".join(args), p.stderr.strip()))
    return p


def pull():
    p = git("pull", "--rebase", "--autostash", "-q")
    if p.returncode != 0:
        log("pull failed: " + (p.stderr or p.stdout).strip()[:300])
        git("rebase", "--abort")


def push(cfg, msg):
    if not cfg.get("push", True):
        return
    git("add", "-A", "results", "decks/variants")
    if git("diff", "--cached", "--quiet").returncode == 0:
        return
    git("commit", "-q", "-m", "%s (%s)" % (msg, cfg["name"]))
    for attempt in range(4):
        p = git("push", "-q")
        if p.returncode == 0:
            return
        pull()
        time.sleep(5 * (attempt + 1))
    log("push failed, will retry next round: " + p.stderr.strip()[:300])


def active_jobs(include_standing=False):
    jobs = []
    for path in sorted(glob.glob(os.path.join(ROOT, "jobs", "*.json"))):
        name = os.path.basename(path)
        if name == "standing.json" and not include_standing:
            continue
        try:
            job = R.load_job(path)
        except (OSError, ValueError) as e:
            log("bad job file %s: %s" % (name, e))
            continue
        job["_file"] = name
        if job["status"] == "active":
            jobs.append(job)
    jobs.sort(key=lambda j: -j["priority"])
    return jobs


def job_complete(job):
    return all(
        os.path.exists(R.result_path(ROOT, job, b)) for b in R.batches(job, ROOT)
    )


def maybe_report(cfg, job):
    from . import analyze

    out = os.path.join(ROOT, "results", R.slug(job["id"]), "report.md")
    first = (job["machines"] or ["any"])[0]
    if first not in (cfg["name"], "any"):
        return False
    if job.get("_file") == "standing.json":
        # never finishes: refresh its report every few hours once it has results
        fresh = os.path.exists(out) and time.time() - os.path.getmtime(out) < STANDING_REPORT_EVERY
        if fresh or not os.path.isdir(os.path.dirname(out)):
            return False
        analyze.write_report(ROOT, job)
        log("standing report refreshed")
        return True
    if os.path.exists(out):
        return False
    if not job_complete(job):
        return False
    analyze.write_report(ROOT, job)
    log("report written for " + job["id"])
    return True


def run_jobs(
    cfg, job_paths=None, take_any=False, max_batches=None, sync=True, standing=False
):
    """Run pending batches. Returns the number of batches finished."""
    if job_paths:
        jobs = [R.load_job(p) for p in job_paths]
    else:
        jobs = active_jobs()
        if standing and not any(
            R.pending(j, ROOT, cfg["name"], take_any) for j in jobs
        ):
            jobs = [j for j in active_jobs(True) if j["_file"] == "standing.json"]
    todo = []
    from . import variants
    for job in jobs:
        try:
            if sync and not variants.prepare(job, ROOT, cfg, log):
                pass  # its other batches can still run once their decks exist
            for b in R.pending(job, ROOT, cfg["name"], take_any):
                todo.append((job, b))
        except ValueError as e:
            log(str(e))
    if max_batches is None and sync:
        max_batches = ROUND_BATCHES * cfg["workers"]
    if max_batches is not None:
        todo = todo[:max_batches]
    if not todo:
        return 0
    log("%d batches to run" % len(todo))
    stop = threading.Event()
    done = 0
    last_push = time.time()

    def stopped():
        return stop.is_set() or os.path.exists(PAUSE)

    with ThreadPoolExecutor(max_workers=cfg["workers"]) as pool:
        running = {}
        queue = list(todo)
        while queue or running:
            while queue and len(running) < cfg["workers"] and not stopped():
                job, b = queue.pop(0)
                running[pool.submit(R.run_batch, job, b, ROOT, cfg, stopped)] = (job, b)
            if not running:
                break
            finished, _ = wait(list(running), timeout=30, return_when=FIRST_COMPLETED)
            for fut in finished:
                job, b = running.pop(fut)
                try:
                    res = fut.result()
                except Exception as e:  # keep going; the batch will be retried
                    log("batch %s/%s crashed: %r" % (job["id"], b["id"], e))
                    continue
                if res is None:
                    continue
                if not res["games"]:
                    log(
                        "batch %s/%s produced no games (exit %s); not saved"
                        % (job["id"], b["id"], res["exit_code"])
                    )
                    continue
                R.save_result(ROOT, job, b, res)
                done += 1
                log(
                    "done %s/%s: %d games in %ss"
                    % (job["id"], b["id"], len(res["games"]), res["seconds"])
                )
            if stopped():
                queue.clear()
            if sync and time.time() - last_push > PUSH_EVERY:
                push(cfg, "sim results")
                last_push = time.time()
    if sync:
        for job in jobs:
            try:
                maybe_report(cfg, job)
            except Exception as e:
                log("report failed for %s: %r" % (job["id"], e))
        push(cfg, "sim results")
    return done


def sync_decks(cfg):
    """Your decks: decks/nick/<name>.txt (a Moxfield export) becomes
    <name>.dck when the .txt is new or newer. Then every deck in
    decks/nick and decks/variants is copied into Forge's own deck folder,
    so it shows up when you play in the Forge window."""
    from . import decks as D

    changed = False
    for txt in glob.glob(os.path.join(ROOT, "decks", "nick", "*.txt")):
        dck = txt[:-4] + ".dck"
        if os.path.exists(dck) and os.path.getmtime(dck) >= os.path.getmtime(txt):
            continue
        label = os.path.splitext(os.path.basename(txt))[0]
        with open(txt, encoding="utf-8-sig") as fh:
            commanders, main, missing = D.convert(fh.read(), label)
        if not commanders:
            log("deck %s: no commander found (put it first, or under a Commander heading)" % label)
            continue
        D.write_dck(dck, label, commanders, main)
        changed = True
        log("deck %s converted%s" % (label, (" (not in Forge: %s)" % ", ".join(missing)) if missing else ""))
    if changed and cfg.get("push", True):
        git("add", "decks/nick")
        git("commit", "-q", "-m", "decks converted (%s)" % cfg["name"])
    gui = cfg.get("forge", {}).get("gui_decks")
    if gui and os.path.isdir(os.path.dirname(gui)):
        import shutil

        os.makedirs(gui, exist_ok=True)
        for src in glob.glob(os.path.join(ROOT, "decks", "nick", "*.dck")) + glob.glob(
            os.path.join(ROOT, "decks", "variants", "*", "*.dck")
        ):
            dst = os.path.join(gui, "CS " + os.path.basename(src))
            if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
                shutil.copyfile(src, dst)


def loop():
    cfg = load_config()
    log("board started on %s, %d workers" % (cfg["name"], cfg["workers"]))
    while True:
        if os.path.exists(PAUSE):
            time.sleep(30)
            continue
        pull()
        try:
            sync_decks(cfg)
        except Exception as e:
            log("deck sync failed: %r" % (e,))
        try:
            n = run_jobs(cfg, standing=True)
        except Exception as e:
            log("round failed: %r" % (e,))
            n = 0
        if True:  # reports and pushes every round
            for job in active_jobs(True):
                try:
                    maybe_report(cfg, job)
                except Exception as e:
                    log("report failed for %s: %r" % (job["id"], e))
            push(cfg, "sim reports")
        if n == 0:
            for _ in range(IDLE_SLEEP // 30):
                if os.path.exists(PAUSE):
                    break
                time.sleep(30)


if __name__ == "__main__":
    loop()
