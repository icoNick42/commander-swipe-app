"""playmanafold.com's deck power, ported from its page code (2026-11-28).

Checked on Manafold's 185 precons (/precons.json): power exact on 149,
within 1 point on 172; same slider step as Manafold on 165, within one
step on 181 (see the "Manafold power check 2026-11-28" Project doc).

power = 26 + 3.2*fast mana + 4.6*Game Changers + 2*tutors + 0.5*ramp
        + 0.55*draw + 0.45*(removal + counters) + 0.8*wipes + 5*(3.5 - avg mv)
clamped 0-100. Bracket: GC>=7 or power>=84 -> 5; GC>=4 or power>=70 -> 4;
GC>=1 or power>=52 -> 3; else 2. Two-card combo -> at least 3 (4 with a
tutor that finds it); mass land denial -> 4. Level = where power sits in
the bracket's band (2: 20-52, 3: 52-70, 4: 70-84): <0.34 Low, <0.7 Mid, High.
"""
import gzip
import json
import os
import re

I = re.I
U = {
    "counter": re.compile(r"counter target (?:\w+\s+)*spell|counter that spell", I),
    "wipe": re.compile(r"(?:destroy|exile) all [\w\s-]*(?:creature|permanent|artifact|enchantment)|deals? (?:\d+|x) damage to each creature|(?:each|all) creatures? gets? -\d+/-\d+", I),
    "removal": re.compile(r"(?:destroy|exile) target|deals? (?:\d+|x) damage to (?:any target|target )|target creature gets -\d+/-\d+|return target (?:creature|nonland permanent|permanent|artifact|enchantment) to its owner's hand|target permanent shuffles it into|target creature's owner shuffles", I),
    "search": re.compile(r"search your library for", I),
    "landSearch": re.compile(r"search your library for (?:a|an|up to \w+|\w+)? ?(?:basic )?(?:land|lands|plains|island|swamp|mountain|forest)", I),
    "sacLand": re.compile(r"(?<!cycling—)\bsacrifice (?:a|an|one) (?:basic )?land\b", I),
    "multiLandSearch": re.compile(r"search your library for (?:up to )?(?:two|three|four|five|x|that many)\b", I),
    "draw": re.compile(r"draw (?:a card|\w+ cards|that many cards)", I),
    "addMana": re.compile(r"\{t\}[^:]{0,24}: ?add|add \{[wubrgc]|add (?:one|two|three|x) mana|adds an additional (?:\{[wubrgc]|one mana)", I),
}
W = re.compile(r"(?:each|target) (?:opponent|other player|player)s? draws?[^.]*\.?", I)
CE = re.compile(r"exile [^.]*\bcards? named [^.]*from your graveyard\.? If you do, search your library[^.]*\.", I)
FAST = ["Sol Ring", "Mana Crypt", "Mana Vault", "Grim Monolith", "Jeweled Lotus", "Chrome Mox", "Mox Diamond", "Mox Opal", "Mox Amber", "Mox Jasper", "Lotus Petal", "Dark Ritual", "Cabal Ritual", "Rite of Flame", "Pyretic Ritual", "Desperate Ritual", "Simian Spirit Guide", "Elvish Spirit Guide", "Ancient Tomb", "City of Traitors", "Gaea's Cradle", "Serra's Sanctum", "Carpet of Flowers"]
LAND_DENIAL = ["Blood Moon", "Magus of the Moon", "Back to Basics", "Armageddon", "Ravages of War", "Catastrophe", "Jokulhaups", "Obliterate", "Ruination", "Winter Orb", "Static Orb", "Rising Waters", "Hokori, Dust Drinker", "Contamination", "Sunder", "Impending Disaster"]
BANDS = {2: (20, 52), 3: (52, 70), 4: (70, 84)}
LABELS = ["Bracket 2 · Low", "Bracket 2 · Mid", "Bracket 2 · High", "Bracket 3 · Low", "Bracket 3 · Mid", "Bracket 3 · High", "Bracket 4 · Low", "Bracket 4 · Mid", "Bracket 4 · High", "Bracket 5 · cEDH"]
SUPER = ["creature", "planeswalker", "instant", "sorcery", "artifact", "enchantment", "land", "battle"]
BASICS = {"plains", "island", "swamp", "mountain", "forest", "wastes", "snow-covered plains", "snow-covered island", "snow-covered swamp", "snow-covered mountain", "snow-covered forest"}


MANY = re.compile(r"a deck can have (?:any number of|up to \w+) cards named", I)


def key(name):
    return name.lower().replace("\u2019", "'").strip()


FAST_K = {key(n) for n in FAST}
LD_K = {key(n) for n in LAND_DENIAL}
_cards = None


def cards(scryfall=None):
    global _cards
    if _cards is not None:
        return _cards
    if scryfall is None:
        from .power import scryfall_dir
        scryfall = scryfall_dir()
        if not scryfall:
            raise RuntimeError("Scryfall Local not found")
    out = {}
    with gzip.open(os.path.join(scryfall, "data", "oracle_cards.jsonl.gz"), "rt", encoding="utf-8") as fh:
        for line in fh:
            c = json.loads(line)
            if c.get("layout") in ("token", "art_series", "emblem", "double_faced_token"):
                continue
            faces = c.get("card_faces") or []
            text = c.get("oracle_text") or "\n".join(f.get("oracle_text", "") for f in faces)
            tl = (c.get("type_line") or "").split("//")[0].lower()
            sup = next((s for s in SUPER if s in tl), None)
            cost = c.get("mana_cost") or (faces[0].get("mana_cost") if faces else "") or ""
            rec = {"mv": c.get("cmc", 0) or 0, "text": text, "super": sup, "gc": bool(c.get("game_changer")), "cost": cost}
            out.setdefault(key(c["name"]), rec)
            if " // " in c["name"]:
                out.setdefault(key(c["name"].split(" // ")[0]), rec)
    _cards = out
    return out


def stats(commanders, main):
    """commanders/main: [(qty, name)]. Returns Manafold-style counts and power."""
    db = cards()
    counts = {}
    for q, n in commanders + main:
        counts[n] = counts.get(n, 0) + q
    u = dict(ramp=0, fastMana=0, tutors=0, draw=0, removal=0, wipes=0, counters=0)
    gc, mv_sum, nonland, missing, ld = [], 0.0, 0, [], []
    for name, r in counts.items():
        s = db.get(key(name))
        if not s:
            missing.append(name)
            continue
        land = s["super"] == "land"
        if not land:
            nonland += r
            mv_sum += s["mv"] * r
        j = re.sub(r"\([^)]*\)", " ", s["text"])
        # Manafold counts a card allowed in multiples (basics, "any number of
        # cards named ...") once, not per copy
        many = key(name) in BASICS or MANY.search(s["text"])
        m = 1 if many else r
        n_ = CE.sub(" ", j)
        if U["counter"].search(j):
            u["counters"] += m
        if U["wipe"].search(j):
            u["wipes"] += m
        elif U["removal"].search(j):
            u["removal"] += m
        if U["draw"].search(W.sub(" ", j)):
            u["draw"] += m
        if not land:
            if U["search"].search(n_):
                if U["landSearch"].search(n_):
                    if not (U["sacLand"].search(re.sub(r"\([^)]*\)", "", j)) and not U["multiLandSearch"].search(j)):
                        u["ramp"] += m
                else:
                    u["tutors"] += m
            if U["addMana"].search(j):
                u["ramp"] += m
        if key(name) in FAST_K:
            u["fastMana"] += m
        if s["gc"]:
            gc.append(name)
        if key(name) in LD_K:
            ld.append(name)
    avg = round(mv_sum / nonland * 10) / 10 if nonland else 0
    p = (26 + u["fastMana"] * 3.2 + len(gc) * 4.6 + u["tutors"] * 2 + u["ramp"] * 0.5 + u["draw"] * 0.55
         + (u["removal"] + u["counters"]) * 0.45 + u["wipes"] * 0.8 + (3.5 - avg) * 5)
    power = max(0, min(100, int(p + 0.5)))
    return dict(u, gc=len(gc), gcCards=gc, avgCmc=avg, power=power, missing=missing, landDenial=ld)


def bracket(st, two_card_combos=0, combo_tutor=False):
    g, p = st["gc"], st["power"]
    if g >= 7 or p >= 84:
        b = 5
    elif g >= 4 or p >= 70:
        b = 4
    elif g >= 1 or p >= 52:
        b = 3
    else:
        b = 2
    if two_card_combos and combo_tutor and b < 4:
        b = 4
    elif two_card_combos and b < 3:
        b = 3
    if st.get("landDenial") and b < 4:
        b = 4
    if b == 5:
        return {"bracket": 5, "sub": "single", "step": 9, "label": LABELS[9]}
    lo, hi = BANDS[b]
    c = (p - lo) / max(1, hi - lo)
    sub = "low" if c < 0.34 else ("mid" if c < 0.7 else "high")
    step = (b - 2) * 3 + {"low": 0, "mid": 1, "high": 2}[sub]
    return {"bracket": b, "sub": sub, "step": step, "label": LABELS[step]}
