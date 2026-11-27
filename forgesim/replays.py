"""Game replays and live status for the sims page (sims.html on the app site).

Each PC keeps every game's full Forge log for 14 days in sim-work/logs, but
only on that PC. This file turns those logs into small replays and pushes
them where the page can read them, so the laptop's and the desktop's games
show up side by side:

* status/<machine>.json on the `sims` branch (written before each push by
  the board): what this PC is playing now, its last finished games, and its
  totals for today.
* branch replays-<machine>: one gzip JSON per game under g/<date>/, plus
  index.json.gz listing them. Each PC is the only writer of its own branch,
  and the branch is a single commit rebuilt each time (git push --force),
  so it never grows past the last 14 days.

A replay keeps what a person would want to watch: the players and their
commanders, each turn's lands, spells, attacks, deaths and life totals, and
how the game ended. The Forge noise (phases, mana, replacement effects) is
dropped, which takes a 4-game log from about 1 MB to a few KB per game.
"""

import glob
import gzip
import json
import os
import re
import shutil
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP_DAYS = 14
PLAYER = r"Ai\((\d+)\)-(.+?)"

TURN_RE = re.compile(r"^Turn: Turn (\d+) \(Ai\((\d+)\)-(.+)\)$")
LAND_RE = re.compile(r"^Land: " + PLAYER + r" played (.+) \(\d+\)$")
CAST_RE = re.compile(r"^Add To Stack: " + PLAYER + r" cast (.+?)(?: targeting .*)?$")
LIFE_RE = re.compile(r"^Life: Life: " + PLAYER + r" (-?\d+) > (-?\d+)$")
ATTACK_RE = re.compile(r"^Combat: " + PLAYER + r" assigned (.+) to attack (.+)\.$")
DIED_RE = re.compile(
    r"^Zone Change: (.+?) \(\d+\) was put into Graveyard from Battlefield\.$"
)
LOST_RE = re.compile(r"^Game Outcome: " + PLAYER + r" has lost because (.+)$")
WON_RE = re.compile(r"^Game Outcome: " + PLAYER + r" has won because (.+)$")
RESULT_RE = re.compile(
    r"^Game Result: Game (\d+) ended in (\d+) ms\. (?:"
    + PLAYER
    + r" has won!|.*Draw.*)"
)
MATCH_RE = re.compile(r"^Ai\(1\)-.+ vs .+ - .+ seed (\d+)")
DRAW_RE = re.compile(r"Stopping slow match as draw|ended in a Draw")
IDS_RE = re.compile(r" \(\d+\)")


def _short(card_list):
    return IDS_RE.sub("", card_list)


def parse_log(text):
    """Forge log (several games) -> [{players: {seat: label}, events, winner, ms, turns, end}]."""
    games, g = [], None
    life = {}

    def new_game():
        return {
            "players": {},
            "events": [],
            "winner": None,
            "ms": None,
            "turns": 0,
            "end": [],
        }

    for line in text.splitlines():
        if line.startswith("Mulligan:") and (g is None or g.get("done")):
            g = new_game()
            games.append(g)
            life = {}
        if g is None:
            continue
        m = re.match(r"^Mulligan: " + PLAYER + r" has", line)
        if m:
            g["players"][m.group(1)] = m.group(2)
            continue
        m = TURN_RE.match(line)
        if m:
            g["turns"] = int(m.group(1))
            g["players"].setdefault(m.group(2), m.group(3))
            g["events"].append([int(m.group(1)), m.group(2), "T", dict(life)])
            continue
        t = g["turns"]
        m = LAND_RE.match(line)
        if m:
            g["events"].append([t, m.group(1), "L", m.group(3)])
            continue
        m = CAST_RE.match(line)
        if m:
            g["events"].append([t, m.group(1), "C", m.group(3)])
            continue
        m = LIFE_RE.match(line)
        if m:
            life[m.group(1)] = int(m.group(4))
            continue
        m = ATTACK_RE.match(line)
        if m:
            target = re.sub(
                r"^" + PLAYER + "$", lambda x: "seat " + x.group(1), m.group(4)
            )
            g["events"].append(
                [t, m.group(1), "A", _short(m.group(3)) + " -> " + target]
            )
            continue
        m = DIED_RE.match(line)
        if m and "Token" not in m.group(1):
            g["events"].append([t, "", "D", m.group(1)])
            continue
        m = LOST_RE.match(line)
        if m:
            g["end"].append([m.group(1), "lost", m.group(3)])
            g["events"].append([t, m.group(1), "X", m.group(3)])
            continue
        m = WON_RE.match(line)
        if m:
            g["winner"] = m.group(1)
            g["end"].append([m.group(1), "won", m.group(3)])
            continue
        m = RESULT_RE.match(line)
        if m:
            g["ms"] = int(m.group(2))
            if m.group(3):
                g["winner"] = m.group(3)
            g["done"] = True
            g["events"].append([t, "", "E", dict(life)])
            continue
        if DRAW_RE.search(line):
            g["done"] = True
    for x in games:
        x.pop("done", None)
    return [x for x in games if x["players"] and x["turns"]]


def _git(repo, *args, timeout=600):
    kw = {"creationflags": 0x08000000} if os.name == "nt" else {}
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="Never")
    try:
        return subprocess.run(
            ["git", "-C", repo] + list(args),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            stdin=subprocess.DEVNULL,
            env=env,
            timeout=timeout,
            **kw
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(args, 124, "", "timed out")


def _commanders(job_id, labels, cache):
    """{seat: commander names} for a game's players: the test deck from its job, an
    opponent ("o-<file>") from its deck file anywhere under decks/."""
    from . import decks as D
    from . import runner as R

    if "files" not in cache:
        cache["files"] = {}
        for p in glob.glob(os.path.join(ROOT, "decks", "**", "*.dck"), recursive=True):
            cache["files"].setdefault(R.slug(os.path.splitext(os.path.basename(p))[0]), p)
    out = {}
    for seat, label in labels.items():
        path = None
        if label.startswith("o-"):
            path = cache["files"].get(label[2:])
        else:
            try:
                key = "job:" + job_id
                if key not in cache:
                    cache[key] = R.load_job(os.path.join(ROOT, "jobs", job_id + ".json"))
                job = cache[key]
                if label in job["tests"]:
                    path = os.path.join(ROOT, R.test_path(job, label))
            except (OSError, ValueError):
                pass
        if path and os.path.exists(path):
            try:
                out[seat] = [c for _, c in D.read_dck(path)[1]]
            except Exception:
                pass
    return out


def update(cfg, log, push=True):
    """Turn new logs into replays and push this PC's replay branch.
    Returns how many games were added."""
    name = cfg["name"]
    work = cfg["work_dir"]
    repo = os.path.join(work, "replays-git")
    branch = "replays-" + name
    state_p = os.path.join(work, "replays-state.json")
    try:
        state = json.load(open(state_p, encoding="utf-8"))
    except (OSError, ValueError):
        state = {"done": {}}
    if not os.path.isdir(os.path.join(repo, ".git")):
        os.makedirs(repo, exist_ok=True)
        url = _git(ROOT, "remote", "get-url", "origin").stdout.strip()
        _git(repo, "init", "-q")
        _git(repo, "remote", "add", "origin", url)
        _git(repo, "config", "user.name", "Commander Swipe sims (%s)" % name)
        _git(repo, "config", "user.email", "sims-%s@users.noreply.github.com" % name)
        _git(repo, "config", "core.autocrlf", "false")
        _git(repo, "checkout", "-q", "--orphan", branch)
    idx_p = os.path.join(repo, "index.json.gz")
    try:
        with gzip.open(idx_p, "rt", encoding="utf-8") as fh:
            index = json.load(fh)
    except (OSError, ValueError, EOFError):
        index = {"machine": name, "games": []}
    added = 0
    cache = {}
    cutoff = time.time() - KEEP_DAYS * 86400
    for path in sorted(glob.glob(os.path.join(work, "logs", "*", "*.log.gz"))):
        key = os.path.relpath(path, work).replace("\\", "/")
        mt = os.path.getmtime(path)
        if mt < cutoff or state["done"].get(key) == int(mt):
            continue
        job = os.path.basename(os.path.dirname(path))
        batch = os.path.basename(path)[:-7]
        res_p = os.path.join(ROOT, "results", job, batch + ".json")
        meta = {}
        try:
            meta = json.load(open(res_p, encoding="utf-8"))
        except (OSError, ValueError):
            pass
        try:
            with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
                games = parse_log(fh.read())
        except (OSError, EOFError):
            continue
        day = time.strftime("%Y-%m-%d", time.localtime(mt))
        for i, g in enumerate(games, 1):
            gid = "%s-%s-%s-g%d" % (name, job, batch, i)
            rel = "g/%s/%s.json.gz" % (day, gid)
            rec = dict(
                g,
                id=gid,
                machine=name,
                job=job,
                batch=batch,
                game=i,
                date=day,
                test=meta.get("test"),
                seed=meta.get("seed"),
                commanders=_commanders(job, g["players"], cache),
            )
            out = os.path.join(repo, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with gzip.open(out, "wt", encoding="utf-8") as fh:
                json.dump(rec, fh, separators=(",", ":"))
            index["games"] = [x for x in index["games"] if x["id"] != gid]
            index["games"].append(
                {
                    "id": gid,
                    "file": rel,
                    "date": day,
                    "t": int(mt),
                    "job": job,
                    "test": meta.get("test"),
                    "players": g["players"],
                    "winner": g["winner"],
                    "turns": g["turns"],
                    "ms": g["ms"],
                    "commanders": {k: v[0] for k, v in rec["commanders"].items() if v},
                }
            )
            added += 1
        state["done"][key] = int(mt)
    # keep the last KEEP_DAYS days
    keep_after = time.strftime("%Y-%m-%d", time.localtime(cutoff))
    index["games"] = [x for x in index["games"] if x["date"] >= keep_after]
    for d in glob.glob(os.path.join(repo, "g", "*")):
        if os.path.basename(d) < keep_after:
            shutil.rmtree(d, ignore_errors=True)
    state["done"] = {k: v for k, v in state["done"].items() if v >= cutoff}
    if not added:
        json.dump(state, open(state_p, "w", encoding="utf-8"))
        return 0
    index["games"].sort(key=lambda x: x["t"])
    index["updated"] = int(time.time())
    with gzip.open(idx_p, "wt", encoding="utf-8") as fh:
        json.dump(index, fh, separators=(",", ":"))
    if push:
        # one commit, rebuilt each time: the branch holds only the last KEEP_DAYS days
        _git(repo, "checkout", "-q", "--orphan", "rebuild")
        _git(repo, "add", "-A")
        c = _git(
            repo, "commit", "-q", "-m", "replays (%s), last %d days" % (name, KEEP_DAYS)
        )
        _git(repo, "branch", "-D", "-q", branch)
        _git(repo, "branch", "-m", branch)
        p = _git(repo, "push", "-q", "-f", "origin", branch)
        if p.returncode != 0:
            log("replay push failed: %s" % (p.stderr or p.stdout).strip()[:300])
            return 0  # state not saved: tried again next round
        _git(repo, "gc", "-q", "--prune=now")
    json.dump(state, open(state_p, "w", encoding="utf-8"))
    log("replays: %d game(s) added and pushed to %s" % (added, branch))
    return added


def write_status(cfg, running):
    """status/<machine>.json on the sims branch (pushed with the results):
    what this PC is playing now, its newest finished games, and today's count."""
    os.makedirs(os.path.join(ROOT, "status"), exist_ok=True)
    # this PC's own logs say what it finished and when (result files' times move with git pulls)
    today = time.strftime("%Y-%m-%d")
    logs = []
    for p in glob.glob(os.path.join(cfg["work_dir"], "logs", "*", "*.log.gz")):
        try:
            logs.append((os.path.getmtime(p), p))
        except OSError:
            pass
    logs.sort()
    recent, games_today = [], 0
    for mt, p in logs:
        if time.strftime("%Y-%m-%d", time.localtime(mt)) != today:
            continue
        job = os.path.basename(os.path.dirname(p))
        batch = os.path.basename(p)[:-7]
        try:
            r = json.load(open(os.path.join(ROOT, "results", job, batch + ".json"), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for g in r.get("games", []):
            games_today += 1
            recent.append({"job": job, "batch": batch, "test": r.get("test"), "game": g.get("index"),
                           "winner": g.get("winner"), "turns": g.get("turns"), "t": int(mt)})
    out = {
        "machine": cfg["name"],
        "updated": int(time.time()),
        "workers": cfg.get("workers"),
        "running": running,
        "games_today": games_today,
        "recent": recent[-12:],
    }
    with open(os.path.join(ROOT, "status", cfg["name"] + ".json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, indent=1)
