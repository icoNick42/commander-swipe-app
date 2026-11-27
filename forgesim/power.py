"""Power scores for opponent decks, on playmanafold.com's scale.

Manafold rates a table on one 10-step slider (read from its Filters panel,
2026-11-25):

    step 0  Bracket 2 · Low     step 5  Bracket 3 · High
    step 1  Bracket 2 · Mid     step 6  Bracket 4 · Low
    step 2  Bracket 2 · High    step 7  Bracket 4 · Mid
    step 3  Bracket 3 · Low     step 8  Bracket 4 · High
    step 4  Bracket 3 · Mid     step 9  Bracket 5 · cEDH

Manafold doesn't say how it picks Low/Mid/High, so this file makes its own
call in two parts:

1. **Bracket** from the official rules (Game Changers, two-card combos,
   mass land denial, extra turns). Commander Spellbook's estimate-bracket
   service gives the combos, MLD and extra turns; Scryfall's game_changer
   flag gives the Game Changers. 0 GC and no combo: Bracket 2. 1-3 GC or a
   late combo: 3. 4+ GC, an early combo, MLD or chained extra turns: 4.
   Bracket 5 is never given automatically (Manafold doesn't either).
2. **Level** inside the bracket from a "push" score: tutors, fast mana,
   cheap interaction, card draw, combos and a low curve. The cut points
   (pools.json "level_cuts") were set on 2026-11-25 against the 41
   gauntlet precons and Nick's decks: about a third of the Bracket 2
   precons read Low, most of the rest Mid, a few High. Nick's Zurgo reads
   Bracket 2 High here; Manafold's deck list said Bracket 2 High too (its
   editor says Bracket 3 Low, from a Viscera Seer + Cathars' Crusade combo
   Commander Spellbook doesn't list).

Card facts come from the local Scryfall copy (Scryfall Local), found in
the usual places on Nick's PCs. Results go to decks/power.json, keyed by
deck path, with the file's hash so a changed deck is scored again.

    python -m forgesim.power            # score decks with no or stale scores
    python -m forgesim.power --all      # score every deck again
    python -m forgesim.power decks/picks/x.dck
"""

import glob
import gzip
import hashlib
import json
import os
import re
import sys
import time
import urllib.request

from . import decks as D

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POWER = os.path.join(ROOT, "decks", "power.json")
POOLS = os.path.join(ROOT, "decks", "pools.json")
SCORED_DIRS = ["decks/picks", "decks/rotation", "decks/gauntlet-a", "decks/gauntlet-b"]

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

FAST_MANA = {
    "sol ring",
    "mana crypt",
    "mana vault",
    "grim monolith",
    "chrome mox",
    "mox diamond",
    "mox opal",
    "mox amber",
    "lotus petal",
    "jeweled lotus",
    "ancient tomb",
    "lion's eye diamond",
    "mishra's workshop",
    "gaea's cradle",
    "serra's sanctum",
    "dark ritual",
    "cabal ritual",
    "simian spirit guide",
    "elvish spirit guide",
    "carpet of flowers",
    "mox of opal",
}

_cards = None


def scryfall_dir():
    for p in SCRYFALL_PLACES:
        if os.path.exists(os.path.join(p, "data", "oracle_cards.jsonl.gz")):
            return p
    return None


def card_facts():
    """{name_key: {cmc, type, text, gc, tags:set}} from Scryfall Local."""
    global _cards
    if _cards is not None:
        return _cards
    base = scryfall_dir()
    if not base:
        raise RuntimeError(
            "Scryfall Local not found (looked in %s)" % "; ".join(SCRYFALL_PLACES)
        )
    want = {"tutor", "ramp", "removal", "counterspell", "draw", "sweeper", "ritual"}
    by_oracle = {}
    with gzip.open(
        os.path.join(base, "data", "oracle_tags.jsonl.gz"), "rt", encoding="utf-8"
    ) as fh:
        tags = [json.loads(l) for l in fh]
    by_id = {t["id"]: t for t in tags}

    def descendants(t, seen):
        for cid in t.get("child_ids") or []:
            if cid in by_id and cid not in seen:
                seen.add(cid)
                descendants(by_id[cid], seen)
        return seen

    for t in tags:
        if t.get("label") not in want:
            continue
        ids = {t["id"]} | descendants(t, set())
        if t["label"] == "tutor":
            # land tutors (Cultivate, fetch effects) are ramp, not tutors
            ids = {
                i
                for i in ids
                if not re.search(
                    r"land|basic|forest|plains|island|swamp|mountain", by_id[i]["label"]
                )
            }
        for i in ids:
            for tg in by_id[i].get("taggings") or []:
                by_oracle.setdefault(tg["oracle_id"], set()).add(t["label"])
    out = {}
    with gzip.open(
        os.path.join(base, "data", "oracle_cards.jsonl.gz"), "rt", encoding="utf-8"
    ) as fh:
        for line in fh:
            c = json.loads(line)
            if c.get("layout") in ("token", "art_series", "emblem"):
                continue
            text = c.get("oracle_text") or " // ".join(
                f.get("oracle_text", "") for f in c.get("card_faces") or []
            )
            out[D.name_key(c["name"])] = {
                "cmc": c.get("cmc", 0),
                "type": c.get("type_line", ""),
                "text": text,
                "gc": bool(c.get("game_changer")),
                "tags": by_oracle.get(c.get("oracle_id"), set()),
            }
    _cards = out
    return out


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


def _counts(commanders, main):
    facts = card_facts()
    n = dict(
        tutor=0, fast=0, interaction=0, draw=0, gc=[], cmc_sum=0.0, spells=0, unknown=0
    )
    for q, name in commanders + main:
        f = facts.get(D.name_key(name))
        if f is None:
            n["unknown"] += q
            continue
        if f["gc"]:
            n["gc"].append(name)
        if "Land" in f["type"] and "//" not in f["type"]:
            if D.name_key(name) in FAST_MANA:
                n["fast"] += q
            continue
        n["spells"] += q
        n["cmc_sum"] += f["cmc"] * q
        t = f["tags"]
        if "tutor" in t:
            n["tutor"] += q
        if (
            D.name_key(name) in FAST_MANA
            or "ritual" in t
            or ("ramp" in t and f["cmc"] <= 1 and "Artifact" in f["type"])
        ):
            n["fast"] += q
        if ({"removal", "counterspell"} & t) and f["cmc"] <= 2:
            n["interaction"] += q
        if "draw" in t:
            n["draw"] += q
    n["avg_cmc"] = round(n["cmc_sum"] / max(1, n["spells"]), 2)
    return n


def push_score(n, sb):
    """One number for how hard a deck pushes; level cuts sit on this."""
    combos = len(sb["combos"]) if sb else 0
    return round(
        1.5 * n["tutor"]
        + 2.0 * n["fast"]
        + 1.0 * n["interaction"]
        + 0.5 * n["draw"]
        + 2.0 * min(combos, 4)
        + 5.0 * (3.4 - n["avg_cmc"])
        + 1.0 * len(n["gc"]),
        2,
    )


def level_cuts():
    try:
        with open(POOLS, encoding="utf-8") as fh:
            return json.load(fh)["level_cuts"]
    except (OSError, ValueError, KeyError):
        return {"2": [11.0, 17.0], "3": [20.0, 28.0], "4": [28.0, 38.0]}


def score_lists(commanders, main, online=True):
    n = _counts(commanders, main)
    sb = spellbook(commanders, main) if online else None
    gcs = len(n["gc"])
    why = []
    early = [c for c in (sb or {}).get("combos", []) if c["early"]]
    if gcs >= 4 or early or (sb and (sb["mld"] or len(sb["extra"]) >= 2)):
        bracket = 4
        if gcs >= 4:
            why.append("%d Game Changers" % gcs)
        if early:
            why.append("early combo: " + " + ".join(early[0]["cards"]))
        if sb and sb["mld"]:
            why.append("mass land denial: " + ", ".join(sb["mld"][:2]))
        if sb and len(sb["extra"]) >= 2:
            why.append("extra turns: " + ", ".join(sb["extra"][:2]))
    elif gcs or (sb and sb["combos"]):
        bracket = 3
        if gcs:
            why.append(
                "%d Game Changer%s: %s"
                % (gcs, "" if gcs == 1 else "s", ", ".join(n["gc"][:3]))
            )
        if sb and sb["combos"]:
            why.append("two-card combo: " + " + ".join(sb["combos"][0]["cards"]))
    else:
        bracket = 2
        why.append("no Game Changers or two-card combos")
    push = push_score(n, sb)
    lo, hi = level_cuts()[str(bracket)]
    level = 0 if push < lo else (1 if push < hi else 2)
    step = (bracket - 2) * 3 + level
    return {
        "bracket": bracket,
        "level": ["Low", "Mid", "High"][level],
        "step": step,
        "label": LABELS[step],
        "push": push,
        "why": why,
        "counts": {
            k: n[k]
            for k in ("tutor", "fast", "interaction", "draw", "avg_cmc", "unknown")
        },
        "game_changers": n["gc"],
        "combos": [c["cards"] for c in (sb or {}).get("combos", [])][:5],
        "spellbook": bool(sb),
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
        ):
            continue
        s = score_file(rel, data, online)
        done += 1
        log(
            "power %s: %s (push %s; %s)"
            % (rel, s["label"], s["push"], "; ".join(s["why"]))
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
