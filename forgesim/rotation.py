"""The rotation: a pool of popular opponent decks that refreshes itself.

Nick's picks (decks/picks) never rotate. The rotation (decks/rotation) does:
once a week the machine named in pools.json "rotation.refresh_on" (the
laptop) runs refresh():

  1. Pull candidates from Archidekt: public Commander decks, most viewed
     first, with the owner's bracket in rotation.brackets, updated recently.
     The deck's Archidekt tags give its plan (tokens, voltron, spellslinger).
  2. Turn each into a .dck, skip any with cards Forge doesn't have or that
     Forge's AI is flagged as weak with (10+ cards), and score its power.
  3. Keep only decks inside the default power window.
  4. Fill the pool to rotation.size, at least per_plan_min decks per plan
     when there are enough, at most per_plan_max. Once full, each refresh
     retires the swap_per_refresh oldest decks (to decks/retired, kept so
     old results can be rerun) and brings in new ones.
  5. Write decks/rotation/pool.json and push.

A refresh never changes a job that's already running: jobs made with
`python -m forgesim.newjob` list their opponents file by file. Only the
standing job (which uses folder patterns) picks up the new pool.

    python -m forgesim.rotation            # refresh now
    python -m forgesim.rotation --dry-run  # show what it would do
"""

import glob
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from . import decks as D
from . import power as P

ROOT = P.ROOT
ROT = os.path.join(ROOT, "decks", "rotation")
RETIRED = os.path.join(ROOT, "decks", "retired")
POOL = os.path.join(ROT, "pool.json")
UA = {"User-Agent": "commander-swipe-sims (personal playtesting)"}

# Archidekt tag -> plan label used in plans.json; anything else is slugged as is
PLAN_ALIASES = {
    "go-wide": "tokens",
    "token": "tokens",
    "tokens": "tokens",
    "aristocrat": "aristocrats",
    "aristocrats": "aristocrats",
    "sacrifice": "aristocrats",
    "voltron": "voltron",
    "equipment": "voltron",
    "auras": "voltron",
    "spellslinger": "spellslinger",
    "spells": "spellslinger",
    "storm": "spellslinger",
    "reanimator": "graveyard",
    "graveyard": "graveyard",
    "self-mill": "graveyard",
    "mill": "mill",
    "landfall": "lands",
    "lands-matter": "lands",
    "lands": "lands",
    "ramp": "ramp",
    "+1/+1-counters": "counters",
    "counters": "counters",
    "group-hug": "group-hug",
    "politics": "group-hug",
    "goad": "group-hug",
    "stax": "stax",
    "control": "control",
    "combo": "combo",
    "tribal": "tribal",
    "typal": "tribal",
    "dragons": "tribal",
    "elves": "tribal",
    "artifacts": "artifacts",
    "enchantress": "enchantress",
    "enchantments": "enchantress",
    "blink": "blink",
    "flicker": "blink",
    "aggro": "aggro",
    "burn": "burn",
    "lifegain": "lifegain",
    "life-gain": "lifegain",
    "theft": "theft",
    "wheels": "wheels",
}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def cfg():
    with open(P.POOLS, encoding="utf-8") as fh:
        return json.load(fh)


def load_pool():
    try:
        with open(POOL, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {"refreshed": None, "decks": {}, "seen": []}


def save_pool(pool):
    os.makedirs(ROT, exist_ok=True)
    with open(POOL, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(pool, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write("\n")


def due(machine):
    c = cfg()["rotation"]
    if machine.lower() != c["refresh_on"].lower():
        return False
    last = load_pool().get("refreshed")
    if not last:
        return True
    t = time.mktime(time.strptime(last, "%Y-%m-%d"))
    return time.time() - t >= c["refresh_days"] * 86400


GENERIC_TAGS = {
    "casual", "budget", "fun", "precon", "upgraded", "upgraded-precon", "competitive",
    "cedh", "edh", "commander", "high-power", "mid-power", "low-power", "jank",
    "pauper", "primer", "meme", "bracket-2", "bracket-3", "bracket-4",
}


def plan_of(tags):
    tags = [t for t in tags or [] if re.sub(r"\s+", "-", str(t).strip().lower()) not in GENERIC_TAGS]
    for t in tags:
        k = re.sub(r"\s+", "-", str(t).strip().lower())
        if k in PLAN_ALIASES:
            return PLAN_ALIASES[k]
    for t in tags:
        k = re.sub(r"[^a-z0-9+/]+", "-", str(t).lower()).strip("-")
        if k:
            return k
    return "unknown"


def candidates(c, log):
    """Archidekt search results, most viewed first, filtered by bracket/size/age."""
    cutoff = time.time() - c["updated_within_days"] * 86400
    out = []
    for bracket in c["brackets"]:
        for page in range(1, 4):
            q = urllib.parse.urlencode(
                {
                    "deckFormat": 3,
                    "orderBy": "-viewCount",
                    "pageSize": 50,
                    "edhBracket": bracket,
                    "page": page,
                }
            )
            try:
                res = get("https://archidekt.com/api/decks/v3/?" + q)
            except Exception as e:
                log("archidekt search failed: %r" % (e,))
                break
            for d in res.get("results") or []:
                if d.get("size") != 100 or d.get("private") or d.get("theorycrafted"):
                    continue
                if (d.get("viewCount") or 0) < c["min_views"]:
                    continue
                try:
                    upd = time.mktime(time.strptime(d["updatedAt"][:10], "%Y-%m-%d"))
                except (KeyError, ValueError):
                    continue
                if upd < cutoff:
                    continue
                tags = [
                    t.get("name") if isinstance(t, dict) else t
                    for t in d.get("tags") or []
                ]
                out.append(
                    {
                        "id": d["id"],
                        "name": d["name"],
                        "views": d.get("viewCount"),
                        "bracket": d.get("edhBracket"),
                        "tags": tags,
                        "plan": plan_of(tags),
                    }
                )
            time.sleep(1)
    out.sort(key=lambda x: -(x["views"] or 0))
    return out


def fetch_lists(deck_id):
    d = get("https://archidekt.com/api/decks/%d/" % deck_id)
    commanders, main = [], []
    for c in d.get("cards") or []:
        cats = [x.lower() for x in c.get("categories") or []]
        if "maybeboard" in cats or "sideboard" in cats:
            continue
        name = ((c.get("card") or {}).get("oracleCard") or {}).get("name") or (
            c.get("card") or {}
        ).get("displayName")
        if not name:
            continue
        (commanders if "commander" in cats else main).append(
            (int(c.get("quantity") or 1), name)
        )
    owner = (d.get("owner") or {}).get("username")
    return commanders, main, owner


def build(cand, window, log):
    """-> (relative .dck path, entry) or None if the deck doesn't qualify."""
    commanders, main, owner = fetch_lists(cand["id"])
    if not commanders or sum(q for q, _ in commanders + main) != 100:
        return None
    problems = D.check(commanders, main)
    missing, weak = problems["missing"], problems["ai_weak"]
    if missing or len(weak) >= 10:
        log("rotation: skip %s (%d not in Forge, %d AI-weak)" % (cand["name"], len(missing), len(weak)))
        return None
    commanders, _m1 = D.to_forge_names(commanders)
    main, _m2 = D.to_forge_names(main)
    score = P.score_lists(commanders, main)
    if not (window[0] <= score["step"] <= window[1]):
        log(
            "rotation: skip %s (%s, outside the window)"
            % (cand["name"], score["label"])
        )
        return None
    fname = "ar%d-%s.dck" % (cand["id"], D_slug(commanders[0][1]))
    rel = "decks/rotation/" + fname
    D.write_dck(os.path.join(ROOT, rel), "ar%d" % cand["id"], commanders, main)
    entry = {
        "file": fname,
        "name": cand["name"],
        "commander": " + ".join(c for _, c in commanders),
        "plan": cand["plan"],
        "tags": cand["tags"],
        "views": cand["views"],
        "owner_bracket": cand["bracket"],
        "power": score["label"],
        "step": score["step"],
        "source": "https://archidekt.com/decks/%d" % cand["id"],
        "owner": owner,
        "added": time.strftime("%Y-%m-%d"),
    }
    return rel, entry


def D_slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def git(*args):
    return subprocess.run(
        ["git", "-C", ROOT] + list(args), capture_output=True, text=True
    )


def refresh(log=print, dry_run=False):
    conf = cfg()
    c = conf["rotation"]
    window = conf["windows"]["default"]
    pool = load_pool()
    decks = pool["decks"]
    seen = set(pool.get("seen", []))

    # 1. drop decks whose score fell out of the window (rules or cuts changed)
    pw = P.load()
    for f in list(decks):
        s = pw["decks"].get("decks/rotation/" + f)
        if s and not (window[0] <= s["step"] <= window[1]):
            log("rotation: retire %s (now %s)" % (f, s["label"]))
            retire(f, decks, dry_run)

    # 2. once full, retire the oldest few
    if len(decks) >= c["size"]:
        oldest = sorted(
            decks, key=lambda f: (decks[f]["added"], decks[f]["views"] or 0)
        )
        for f in oldest[: c["swap_per_refresh"]]:
            log("rotation: retire %s (oldest)" % f)
            retire(f, decks, dry_run)

    # 3. fill: first plans under per_plan_min, then the most viewed, capped per plan
    plans = {}
    for e in decks.values():
        plans[e["plan"]] = plans.get(e["plan"], 0) + 1
    cands = [x for x in candidates(c, log) if x["id"] not in seen]
    log("rotation: %d new candidates from Archidekt" % len(cands))

    def take(x):
        if len(decks) >= c["size"] or plans.get(x["plan"], 0) >= c["per_plan_max"]:
            return False
        seen.add(x["id"])
        if dry_run:
            log(
                "rotation: would try %s (%s, %s views)"
                % (x["name"], x["plan"], x["views"])
            )
            decks["ar%d" % x["id"]] = {
                "plan": x["plan"],
                "added": "dry",
                "views": x["views"],
            }
            plans[x["plan"]] = plans.get(x["plan"], 0) + 1
            return True
        try:
            got = build(x, window, log)
        except Exception as e:
            log("rotation: %s failed: %r" % (x["name"], e))
            return False
        time.sleep(1)
        if not got:
            return False
        rel, entry = got
        decks[entry["file"]] = entry
        plans[x["plan"]] = plans.get(x["plan"], 0) + 1
        log(
            "rotation: add %s (%s, %s, %s views)"
            % (entry["name"], entry["plan"], entry["power"], entry["views"])
        )
        return True

    for x in cands:
        if plans.get(x["plan"], 0) < c["per_plan_min"] and x["plan"] != "unknown":
            take(x)
    for x in cands:
        if x["id"] not in seen:
            take(x)

    pool["decks"] = decks
    pool["seen"] = sorted(seen)
    pool["refreshed"] = time.strftime("%Y-%m-%d")
    pool["plans"] = dict(sorted(plans.items()))
    if dry_run:
        log("rotation (dry run): %d decks, plans %s" % (len(decks), pool["plans"]))
        return pool
    save_pool(pool)
    P.update(log=log)  # record scores for the new files (and forget retired ones)
    return pool


def retire(fname, decks, dry_run):
    decks.pop(fname, None)
    if dry_run:
        return
    src = os.path.join(ROT, fname)
    if os.path.exists(src):
        os.makedirs(RETIRED, exist_ok=True)
        os.replace(src, os.path.join(RETIRED, fname))


if __name__ == "__main__":
    refresh(dry_run="--dry-run" in sys.argv[1:])
