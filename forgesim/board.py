"""The job board: keeps each PC running sims with no one watching.

Loop (run_board.py, started at logon from the Startup folder):
  1. If the PAUSE file exists (Play Forge.cmd and Pause sims.cmd make it),
     stop any running sims and wait. A pause left by Play Forge.cmd is
     ignored once it's PLAY_PAUSE_MAX old (Forge crashed or the window was
     closed the hard way).
  2. git pull the sims branch: new jobs, and other machines' results. If
     the board's own code changed, restart into the new code.
  3. Run this machine's unfinished batches, `workers` at a time, at
     below-normal priority so the PC stays usable. Windows is asked not to
     sleep while batches run.
  4. Commit and push results every few minutes (and when a round ends).
  5. When every batch of a job is in, the job's first machine writes its
     report (results/<job>/report.md + summary.json).
  6. Nothing to do: run the standing job (jobs/standing.json) if there is
     one, else sleep and check again.

machine.json (next to run_board.py, never committed):
  {"name": "desktop", "workers": 4, "node": "...node.exe",
   "forge": {"java": "...java.exe", "jar": "...jar-with-dependencies.jar",
             "cwd": "...\\app", "mem": "3g", "version": "2.0.16",
             "gui_decks": "...\\userdata\\decks\\commander"},
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
PLAY_PAUSE_MAX = 8 * 3600
MAX_FAILS = 2  # a batch that gives no games this many times is set aside
LOG_KEEP_DAYS = 14

_pull_fails = 0
RUNNING = {}  # batch key -> what this PC is playing now (for status/<machine>.json)


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
    cfg["name"] = cfg["name"].lower()
    cfg.setdefault("workers", 2)
    cfg.setdefault("work_dir", os.path.join(os.path.dirname(ROOT), "sim-work"))
    cfg.setdefault("push", True)
    return cfg


# ------------------------------------------------------------------ git

GIT_ENV = dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="Never")


def git(*args, timeout=300):
    """Run git in the board folder; never waits on a prompt, never hangs."""
    kw = {"creationflags": 0x08000000} if os.name == "nt" else {}
    try:
        return subprocess.run(
            ["git", "-C", ROOT] + list(args),
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            stdin=subprocess.DEVNULL,
            env=GIT_ENV,
            timeout=timeout,
            **kw,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(args, 124, "", "git %s timed out" % args[0])


def git_cleanup():
    """After a power cut: a stale index.lock or a half-done rebase blocks git.
    Safe because run_board holds the single-instance lock."""
    gitdir = os.path.join(ROOT, ".git")
    lock = os.path.join(gitdir, "index.lock")
    if os.path.exists(lock):
        try:
            os.remove(lock)
            log("removed a stale git index.lock")
        except OSError:
            pass
    if os.path.isdir(os.path.join(gitdir, "rebase-merge")) or os.path.isdir(
        os.path.join(gitdir, "rebase-apply")
    ):
        git("rebase", "--abort")
        log("aborted a half-done rebase")


def code_rev():
    p = git("rev-parse", "HEAD:forgesim")
    return p.stdout.strip() if p.returncode == 0 else ""


def pull():
    """Pull, keeping our own commits on top. Results are separate files per
    machine, so a clash is rare; if one happens (two machines writing the same
    file), our side wins rather than leaving git stuck."""
    global _pull_fails
    p = git("pull", "--rebase", "--autostash", "-q")
    if p.returncode != 0:
        git("rebase", "--abort")
        p = git("pull", "--rebase", "--autostash", "-q", "-X", "theirs")
        if p.returncode != 0:
            git("rebase", "--abort")
    if p.returncode == 0:
        _pull_fails = 0
        return True
    _pull_fails += 1
    log(
        "pull failed (%d in a row): %s"
        % (_pull_fails, (p.stderr or p.stdout).strip()[:300])
    )
    if _pull_fails >= 6:
        log(
            "!! pulls keep failing: this PC isn't getting new jobs. Check board.log and git status in %s"
            % ROOT
        )
    return False


def push(cfg, msg):
    if not cfg.get("push", True):
        return
    try:
        from . import replays

        replays.write_status(cfg, sorted(RUNNING.values(), key=lambda x: x["started"]))
    except Exception as e:
        log("status not written: %r" % (e,))
    paths = [
        p
        for p in (
            "results", "decks/variants", "decks/nick", "decks/picks", "decks/chosen",
            "decks/rotation", "decks/retired", "decks/power.json", "status",
        )
        if os.path.exists(os.path.join(ROOT, p))
    ]
    a = git("add", "-A", *paths)
    if a.returncode != 0:
        log("git add failed: " + a.stderr.strip()[:300])
        return
    if git("diff", "--cached", "--quiet").returncode == 0:
        return
    c = git("commit", "-q", "-m", "%s (%s)" % (msg, cfg["name"]))
    if c.returncode != 0:
        log("git commit failed: " + (c.stderr or c.stdout).strip()[:300])
        return
    for attempt in range(4):
        p = git("push", "-q")
        if p.returncode == 0:
            return
        pull()
        time.sleep(5 * (attempt + 1))
    log("push failed, will retry next round: " + p.stderr.strip()[:300])


# ------------------------------------------------------------------ keep awake


def keep_awake(on):
    """Ask Windows not to sleep while sims run (ES_CONTINUOUS | ES_SYSTEM_REQUIRED)."""
    if os.name != "nt":
        return
    try:
        import ctypes

        ctypes.windll.kernel32.SetThreadExecutionState(0x80000001 if on else 0x80000000)
    except Exception:
        pass


# ------------------------------------------------------------------ pause


def paused():
    if not os.path.exists(PAUSE):
        return False
    try:
        with open(PAUSE, encoding="utf-8", errors="replace") as fh:
            why = fh.read()
        if "play" in why and time.time() - os.path.getmtime(PAUSE) > PLAY_PAUSE_MAX:
            os.remove(PAUSE)
            log(
                "a play pause was %d+ hours old; removed it and resumed"
                % (PLAY_PAUSE_MAX // 3600)
            )
            return False
    except OSError:
        pass
    return True


# ------------------------------------------------------------------ failures


def _fails_path(cfg):
    return os.path.join(cfg["work_dir"], "failures.json")


def load_fails(cfg):
    try:
        with open(_fails_path(cfg), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_fails(cfg, fails):
    os.makedirs(cfg["work_dir"], exist_ok=True)
    with open(_fails_path(cfg), "w", encoding="utf-8") as fh:
        json.dump(fails, fh)


# ------------------------------------------------------------------ jobs


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


def is_first(cfg, job):
    first = (job["machines"] or ["any"])[0].lower()
    return first in (cfg["name"], "any")


def maybe_report(cfg, job):
    from . import analyze

    out = os.path.join(ROOT, "results", R.slug(job["id"]), "report.md")
    if not is_first(cfg, job):
        return False
    if job.get("_file") == "standing.json":
        # never finishes: refresh its report every few hours once it has results
        fresh = (
            os.path.exists(out)
            and time.time() - os.path.getmtime(out) < STANDING_REPORT_EVERY
        )
        if fresh or not os.path.isdir(os.path.dirname(out)):
            return False
        analyze.write_report(ROOT, job)
        log("standing report refreshed")
        return True
    if os.path.exists(out) or not job_complete(job):
        return False
    analyze.write_report(ROOT, job)
    log("report written for " + job["id"])
    return True


def run_jobs(
    cfg, job_paths=None, take_any=False, max_batches=None, sync=True, standing=False
):
    """Run pending batches. Returns the number of batches finished."""
    from . import variants

    fails = load_fails(cfg)

    def todo_for(jobs):
        out = []
        for job in jobs:
            try:
                if sync:
                    variants.prepare(job, ROOT, cfg, log)
                for b in R.pending(job, ROOT, cfg["name"], take_any):
                    if fails.get("%s/%s" % (job["id"], b["id"]), 0) >= MAX_FAILS:
                        continue
                    out.append((job, b))
            except ValueError as e:
                log(str(e))
        return out

    if job_paths:
        jobs = [R.load_job(p) for p in job_paths]
        todo = todo_for(jobs)
    else:
        jobs = active_jobs()
        todo = todo_for(jobs)
        if standing and not todo:
            jobs = [j for j in active_jobs(True) if j["_file"] == "standing.json"]
            todo = todo_for(jobs)
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
        return stop.is_set() or paused()

    keep_awake(True)
    try:
        with ThreadPoolExecutor(max_workers=cfg["workers"]) as pool:
            running = {}
            queue = list(todo)
            while queue or running:
                while queue and len(running) < cfg["workers"] and not stopped():
                    job, b = queue.pop(0)
                    running[pool.submit(R.run_batch, job, b, ROOT, cfg, stopped)] = (
                        job,
                        b,
                    )
                    RUNNING["%s/%s" % (job["id"], b["id"])] = {
                        "job": job["id"], "batch": b["id"], "test": b["test"],
                        "opponents": [os.path.splitext(os.path.basename(o))[0] for o in b["opponents"]],
                        "started": int(time.time()),
                    }
                if not running:
                    break
                finished, _ = wait(
                    list(running), timeout=30, return_when=FIRST_COMPLETED
                )
                for fut in finished:
                    job, b = running.pop(fut)
                    key = "%s/%s" % (job["id"], b["id"])
                    RUNNING.pop(key, None)
                    try:
                        res = fut.result()
                    except Exception as e:  # keep going; the batch will be retried
                        log("batch %s crashed: %r" % (key, e))
                        res = {"games": [], "exit_code": "crash"}
                    if res is None:
                        continue  # stopped for a pause: not a failure
                    if not res["games"]:
                        fails[key] = fails.get(key, 0) + 1
                        save_fails(cfg, fails)
                        log(
                            "batch %s produced no games (exit %s, try %d of %d)%s"
                            % (
                                key,
                                res.get("exit_code"),
                                fails[key],
                                MAX_FAILS,
                                (
                                    "; set aside: "
                                    + res.get("error_tail", "")[-300:].replace(
                                        "\n", " | "
                                    )
                                    if fails[key] >= MAX_FAILS
                                    else ""
                                ),
                            )
                        )
                        continue
                    R.save_result(ROOT, job, b, res)
                    done += 1
                    log(
                        "done %s: %d games in %ss"
                        % (key, len(res["games"]), res["seconds"])
                    )
                if stopped():
                    queue.clear()
                if sync and time.time() - last_push > PUSH_EVERY:
                    push(cfg, "sim results")
                    update_replays(cfg)
                    last_push = time.time()
    finally:
        keep_awake(False)
        RUNNING.clear()
    if sync:
        for job in jobs:
            try:
                maybe_report(cfg, job)
            except Exception as e:
                log("report failed for %s: %r" % (job["id"], e))
        push(cfg, "sim results")
    return done


# ------------------------------------------------------------------ decks


def deck_converter(cfg):
    """Only one machine converts decks (the standing job's first machine), so
    two PCs never commit different versions of the same file."""
    path = os.path.join(ROOT, "jobs", "standing.json")
    try:
        job = R.load_job(path)
    except (OSError, ValueError):
        return True
    return is_first(cfg, job)


def sync_decks(cfg):
    """Your decks: decks/nick/<name>.txt (a Moxfield export) becomes
    <name>.dck when the .txt is new or newer (picks in decks/picks and
    chosen opponents in decks/chosen too). Then every deck in
    decks/nick and decks/variants is copied into Forge's own deck folder,
    so it shows up when you play in the Forge window."""
    from . import decks as D

    if deck_converter(cfg):
        changed = False
        txts = glob.glob(os.path.join(ROOT, "decks", "nick", "*.txt"))
        txts += glob.glob(os.path.join(ROOT, "decks", "picks", "*.txt"))
        txts += glob.glob(os.path.join(ROOT, "decks", "chosen", "*.txt"))
        for txt in txts:
            dck = txt[:-4] + ".dck"
            if os.path.exists(dck) and os.path.getmtime(dck) >= os.path.getmtime(txt):
                continue
            label = os.path.splitext(os.path.basename(txt))[0]
            with open(txt, encoding="utf-8-sig") as fh:
                commanders, main, missing = D.convert(fh.read(), label)
            if not commanders:
                log(
                    "deck %s: no commander found (put it first, or under a Commander heading)"
                    % label
                )
                continue
            D.write_dck(dck, label, commanders, main)
            changed = True
            log(
                "deck %s converted%s"
                % (
                    label,
                    (" (not in Forge: %s)" % ", ".join(missing)) if missing else "",
                )
            )
        if changed:
            push(cfg, "decks converted")
    gui = cfg.get("forge", {}).get("gui_decks")
    if gui and os.path.isdir(os.path.dirname(gui)):
        import shutil

        os.makedirs(gui, exist_ok=True)
        srcs = [
            (os.path.basename(p), p)
            for p in glob.glob(os.path.join(ROOT, "decks", "nick", "*.dck"))
        ]
        srcs += [
            ("pick " + os.path.basename(p), p)
            for p in glob.glob(os.path.join(ROOT, "decks", "picks", "*.dck"))
        ]
        srcs += [
            ("opp " + os.path.basename(p), p)
            for p in glob.glob(os.path.join(ROOT, "decks", "chosen", "*.dck"))
        ]
        for p in glob.glob(os.path.join(ROOT, "decks", "variants", "*", "*.dck")):
            # variants are named by job too, so the same label in two jobs can't collide
            srcs.append(
                (
                    "%s %s"
                    % (os.path.basename(os.path.dirname(p))[:24], os.path.basename(p)),
                    p,
                )
            )
        for name, src in srcs:
            dst = os.path.join(gui, "CS " + name)
            if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
                shutil.copyfile(src, dst)


def prune_logs(cfg):
    logs = os.path.join(cfg["work_dir"], "logs")
    cutoff = time.time() - LOG_KEEP_DAYS * 86400
    for p in glob.glob(os.path.join(logs, "*", "*.log.gz")):
        try:
            if os.path.getmtime(p) < cutoff:
                os.remove(p)
        except OSError:
            pass


def update_replays(cfg):
    """This PC's replays for the sims page (forgesim/replays.py); never stops the board."""
    if not cfg.get("push", True):
        return
    try:
        from . import replays

        replays.update(cfg, log)
    except Exception as e:
        log("replays failed: %r" % (e,))


def pools_upkeep(cfg):
    """On the rotation's machine (pools.json rotation.refresh_on): score new
    or changed opponent decks (picks dropped in by Nick, say), and refresh
    the rotation once a week. Needs Scryfall Local and the internet."""
    from . import power, rotation

    try:
        conf = rotation.cfg()["rotation"]
    except (OSError, ValueError, KeyError):
        return
    if cfg["name"] != conf.get("refresh_on", "").lower():
        return
    try:
        if rotation.due(cfg["name"]):
            log("rotation refresh starting")
            pool = rotation.refresh(log=log)
            log("rotation refreshed: %d decks" % len(pool["decks"]))
            push(cfg, "rotation refresh")
        elif power.update(log=log):
            push(cfg, "power scores")
    except Exception as e:
        log("pools upkeep failed: %r" % (e,))


# ------------------------------------------------------------------ loop


class Restart(Exception):
    """Raised when pulled code changed; run_board.py starts a fresh copy."""


def restart_if_code_changed(before):
    now = code_rev()
    if before and now and now != before:  # "" = git hiccup, not a change
        log("board code changed; restarting into the new version")
        raise Restart()


def loop():
    cfg = load_config()
    git_cleanup()
    log("board started on %s, %d workers" % (cfg["name"], cfg["workers"]))
    # The code this process is running. Compared with what's on disk after
    # every pull: a push that loses a race pulls mid-round (push() -> pull()),
    # so comparing only around the loop-start pull missed most code changes
    # and the board kept running old code from memory.
    started = code_rev()
    last_prune = 0
    while True:
        if paused():
            time.sleep(30)
            continue
        pull()
        restart_if_code_changed(started)
        if time.time() - last_prune > 86400:
            prune_logs(cfg)
            last_prune = time.time()
        try:
            sync_decks(cfg)
        except Exception as e:
            log("deck sync failed: %r" % (e,))
        try:
            from . import mirror

            mirror.sync(cfg, log)
        except Exception as e:
            log("mirror failed: %r" % (e,))
        pools_upkeep(cfg)
        try:
            n = run_jobs(cfg, standing=True)
        except Exception as e:
            log("round failed: %r" % (e,))
            n = 0
        for job in active_jobs(True):
            try:
                maybe_report(cfg, job)
            except Exception as e:
                log("report failed for %s: %r" % (job["id"], e))
        push(cfg, "sim reports")
        update_replays(cfg)
        if n == 0:
            for _ in range(IDLE_SLEEP // 30):
                if os.path.exists(PAUSE):
                    break
                time.sleep(30)


if __name__ == "__main__":
    loop()
