"""Power scores for opponent decks, on playmanafold.com's scale.

Manafold rates a table on one 10-step slider (read from its Filters panel,
2026-11-25):

    step 0  Bracket 2 · Low     step 5  Bracket 3 · High
    step 1  Bracket 2 · Mid     step 6  Bracket 4 · Low
    step 2  Bracket 2 · High    step 7  Bracket 4 · Mid
    step 3  Bracket 3 · Low     step 8  Bracket 4 · High
    step 4  Bracket 3 · Mid     step 9  Bracket 5 · cEDH

Since 2026-11-28 this uses Manafold's own method, read from its page code
and ported in forgesim/manafold.py:

1. **Power 0-100** from fast mana, Game Changers, tutors, ramp, draw,
   removal, counterspells, wipes and the average mana value.
2. **Bracket:** 7+ GC or power 84+: 5. 4+ GC or power 70+: 4. 1+ GC or
   power 52+: 3. Otherwise 2. A two-card combo (from Commander Spellbook)
   lifts to 3, or 4 when Spellbook calls it early. Manafold's mass land
   denial list lifts to 4.
3. **Level** is where power sits in the bracket's band (B2 20-52, B3 52-70,
   B4 70-84): bottom third Low, middle third Mid, top High.

On Manafold's 185 precons this gives Manafold's step on 165 (the old
push-score method: 52). Nick's current Zurgo reads Bracket 3 Low, as in
Manafold's editor.

Card facts come from the local Scryfall copy (Scryfall Local), found in
the usual places on Nick's PCs. Results go to decks/power.json, keyed by
deck path, with the file's hash so a changed deck is scored again.

    python -m forgesim.power            # score decks with no or stale scores
    python -m forgesim.power --all      # score every deck again
    python -m forgesim.power decks/picks/x.dck
"""

import glob
import hashlib
import json
import os
import sys
import time
import urllib.request

from . import decks as D
from . import manafold as MF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POWER = os.path.join(ROOT, "decks", "power.json")
POOLS = os.path.join(ROOT, "decks", "pools.json")
METHOD = "manafold-1"  # bump to make every board score its decks again
SCORED_DIRS = ["decks/picks", "decks/chosen", "decks/rotation", "decks/gauntlet-a", "decks/gauntlet-b"]

LABELS = [
    "Bracket 2 · Low",
    "Bracket 2 · Mid",
    "Bracket 2 · High",
    "Bracket 3 · Low",
    "Bracket 3 · Mid",
    "Bracket 3 · High",
    "Bracket 4 · Low",
    "Bracket 4 · Mid",
    "Bracket 4 · High",
    "Bracket 5 · cEDH",
]

SCRYFALL_PLACES = [
    r"F:\Claude Files\Scryfall Local",
    r"D:\Claude\Scryfall Local",
    os.path.expanduser(r"~\Claude Files\Scryfall Local"),
    os.path.join(os.path.dirname(os.path.dirname(ROOT)), "Scryfall Local"),
]

def scryfall_dir():
    for p in SCRYFALL_PLACES:
        if os.path.exists(os.path.join(p, "data", "oracle_cards.jsonl.gz")):
            return p
    return None


def spellbook(commanders, main):
    """Commander Spellbook's estimate-bracket: {tag, combos:[{cards, early}], mld, extra}.
    Returns None when it can't be reached (scores then use Game Changers only)."""
    body = "\n".join(
        ["// Commander"]
        + ["%d %s" % (q, n) for q, n in commanders]
        + ["// Main"]
        + ["%d %s" % (q, n) for q, n in main]
    )
    req = urllib.request.Request(
        "https://backend.commanderspellbook.com/estimate-bracket",
        data=body.encode("utf-8"),
        headers={"Content-Type": "text/plain", "User-Agent": "commander-swipe-sims"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.loads(r.read())
    except Exception:
        return None
    combos = []
    for c in d.get("combos") or []:
        uses = [u["card"]["name"] for u in (c.get("combo") or {}).get("uses") or []]
        tags = json.dumps({k: v for k, v in c.items() if k != "combo"}).lower()
        if len(uses) <= 2:
            combos.append(
                {"cards": uses, "early": "early" in tags or "ruthless" in tags}
            )
    cards = d.get("cards") or []
    return {
        "tag": d.get("bracketTag"),
        "combos": combos,
        "mld": [x["card"]["name"] for x in cards if x.get("massLandDenial")],
        "extra": [x["card"]["name"] for x in cards if x.get("extraTurn")],
    }


def score_lists(commanders, main, online=True):
    """Manafold's reading (forgesim/manafold.py), with Spellbook's two-card combos."""
    st = MF.stats(commanders, main)
    sb = spellbook(commanders, main) if online else None
    combos = (sb or {}).get("combos", [])
    early = [c for c in combos if c["early"]]
    r = MF.bracket(st, len(combos), bool(early))
    p, gcs = st["power"], st["gc"]
    why = []
    if gcs:
        why.append(
            "%d Game Changer%s: %s"
            % (gcs, "" if gcs == 1 else "s", ", ".join(st["gcCards"][:3]))
        )
    if early:
        why.append("early combo: " + " + ".join(early[0]["cards"]))
    elif combos:
        why.append("two-card combo: " + " + ".join(combos[0]["cards"]))
    if st["landDenial"]:
        why.append("mass land denial: " + ", ".join(st["landDenial"][:2]))
    why.append("power %d of 100" % p)
    level = "High" if r["sub"] in ("high", "single") else r["sub"].capitalize()
    return {
        "bracket": r["bracket"],
        "level": level,
        "step": r["step"],
        "label": r["label"],
        "power": p,
        "why": why,
        "counts": {
            k: st[k]
            for k in ("fastMana", "tutors", "ramp", "draw", "removal", "counters", "wipes", "avgCmc")
        },
        "game_changers": st["gcCards"],
        "combos": [c["cards"] for c in combos][:5],
        "unknown": st["missing"][:10],
        "spellbook": bool(sb),
        "method": METHOD,
    }


def file_hash(path):
    with open(path, "rb") as fh:
        return hashlib.sha1(fh.read().replace(b"\r\n", b"\n")).hexdigest()[:12]


def load():
    try:
        with open(POWER, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {
            "note": "Power scores (forgesim/power.py). step 0-9 = Manafold's slider.",
            "decks": {},
        }


def save(data):
    with open(POWER, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write("\n")


def score_file(rel, data, online=True):
    _name, commanders, main = D.read_dck(os.path.join(ROOT, rel))
    s = score_lists(commanders, main, online)
    s["hash"] = file_hash(os.path.join(ROOT, rel))
    s["scored"] = time.strftime("%Y-%m-%d")
    data["decks"][rel.replace("\\", "/")] = s
    return s


def update(paths=None, everything=False, log=print, online=True):
    """Score decks that have no score or whose file changed. Returns how many."""
    data = load()
    if paths is None:
        paths = []
        for d in SCORED_DIRS:
            paths += sorted(glob.glob(os.path.join(ROOT, d, "*.dck")))
        paths = [os.path.relpath(p, ROOT).replace("\\", "/") for p in paths]
    done = 0
    for rel in paths:
        old = data["decks"].get(rel)
        if (
            not everything
            and old
            and old.get("hash") == file_hash(os.path.join(ROOT, rel))
            and old.get("spellbook", True)
            and old.get("method") == METHOD
        ):
            continue
        s = score_file(rel, data, online)
        done += 1
        log(
            "power %s: %s (%s)"
            % (rel, s["label"], "; ".join(s["why"]))
        )
        time.sleep(0.5)
    # forget decks that are gone
    gone = [r for r in data["decks"] if not os.path.exists(os.path.join(ROOT, r))]
    for rel in gone:
        del data["decks"][rel]
    if done or gone:
        save(data)
    return done


def step_of(rel, data=None):
    data = data or load()
    s = data["decks"].get(rel.replace("\\", "/"))
    return None if s is None else s["step"]


def main(argv):
    everything = "--all" in argv
    paths = [a.replace("\\", "/") for a in argv if not a.startswith("--")] or None
    n = update(paths, everything)
    print("%d deck(s) scored" % n)


if __name__ == "__main__":
    main(sys.argv[1:])
