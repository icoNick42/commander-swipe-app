"""
scryfall_local.py - a card search page that runs on this PC, using the local
copy of Scryfall's data that update_scryfall.py downloads.

Start it by double-clicking "Start card search.bat" (or: python scryfall_local.py).
It opens http://localhost:8765 in your browser. Close the black window to stop it.

Search syntax is a large subset of Scryfall's; click "Syntax" on the page for the list.
Results match live Scryfall to within a few cards (checked 2026-11-19).
Only this PC can open the page (it listens on 127.0.0.1). Standard library only.
"""

import gzip
import json
import os
import re
import sys
import threading
import unicodedata
import webbrowser
from collections import Counter, defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
IMAGES = os.path.join(HERE, "images", "normal")
PAGE = os.path.join(HERE, "search.html")
PORT = 8765
PAGE_SIZE = 60

# Kinds of cards Scryfall leaves out of searches unless you add include:extras.
EXTRA_LAYOUTS = {"token", "double_faced_token", "emblem", "art_series",
                 "planar", "scheme", "vanguard"}
RARITY = {"common": 0, "uncommon": 1, "rare": 2, "mythic": 3, "special": 4, "bonus": 5}
RARITY_ABBR = {"c": "common", "u": "uncommon", "r": "rare", "m": "mythic",
               "s": "special", "b": "bonus"}
REMINDER = re.compile(r"\([^)]*\)")  # Scryfall's o: skips reminder text; fo: keeps it


# ---------------------------------------------------------------- loading data

def read_jsonl(name):
    with gzip.open(os.path.join(DATA, name + ".jsonl.gz"), "rt", encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def norm(s):
    """Lowercase and strip accents, so 'lim-dul' finds 'Lim-Dûl'."""
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(ch for ch in s if not unicodedata.combining(ch)).lower()


def mana_symbols(cost):
    """'{2}{R}{R}' or '2RR' -> Counter({'R': 2, '2': 1})."""
    cost = (cost or "").upper()
    if "{" in cost:
        return Counter(re.findall(r"\{([^}]+)\}", cost))
    return Counter(re.findall(r"\d+|[A-Z]", cost))


def face_number(v):
    """Power/toughness/loyalty as a number: '*' and 'X' count as 0, '1+*' as 1, '+2' as 2."""
    if v is None:
        return None
    m = re.match(r"[-+]?\d+(\.\d+)?", v)
    return float(m.group()) if m else 0.0


def trim(c):
    """Keep what the page shows and searches, plus lowercase copies for matching."""
    faces = c.get("card_faces") or [c]
    text = "\n".join(f.get("oracle_text", "") for f in faces)
    type_line = c.get("type_line") or " // ".join(f.get("type_line", "") for f in faces)
    mana_cost = c.get("mana_cost") or " // ".join(f["mana_cost"] for f in faces if f.get("mana_cost"))
    # Like Scryfall, colors and mana costs are checked face by face on double-faced
    # cards and Adventures: a red // white card isn't multicolored.
    if c.get("colors") is not None:
        face_colors = [set(c["colors"])]
    else:
        face_colors = [set(f.get("colors", [])) for f in faces]
    colors = set().union(*face_colors)
    if c.get("card_faces") and any(f.get("mana_cost") for f in faces):
        face_mana = [mana_symbols(f.get("mana_cost")) for f in faces]
    else:
        face_mana = [mana_symbols(c.get("mana_cost"))]
    if "image_uris" in c:
        imgs = [c["image_uris"].get("normal")]
    else:
        imgs = [f["image_uris"].get("normal") for f in faces if "image_uris" in f][:2]
    legal = c.get("legalities", {})
    flavor = "\n".join(f.get("flavor_text", "") for f in faces)
    return {
        "id": c["id"], "oracle_id": c.get("oracle_id") or faces[0].get("oracle_id"),
        "name": c["name"], "layout": c.get("layout", ""), "mana_cost": mana_cost,
        "cmc": c.get("cmc", 0.0), "type_line": type_line,
        "colors": colors, "face_colors": face_colors, "ci": set(c.get("color_identity", [])),
        "keywords": {k.lower() for k in c.get("keywords", [])},
        "legalities": legal, "rarity": c.get("rarity", ""), "set": c.get("set", ""),
        "set_name": c.get("set_name", ""), "released": c.get("released_at", ""),
        "prices": c.get("prices", {}), "edhrec": c.get("edhrec_rank"),
        "gc": bool(c.get("game_changer")), "reserved": bool(c.get("reserved")),
        "games": set(c.get("games", [])), "imgs": imgs,
        "artist": c.get("artist") or faces[0].get("artist", ""),
        "scryfall_uri": c.get("scryfall_uri", ""),
        "faces": [{k: f.get(k) for k in ("name", "mana_cost", "type_line", "oracle_text",
                                          "power", "toughness", "loyalty", "defense", "flavor_text")}
                  for f in faces],
        "illustration_id": c.get("illustration_id") or faces[0].get("illustration_id"),
        # lowercase copies used by the search
        "_name": norm(c["name"]), "_face_names": {norm(f.get("name")) for f in faces},
        "_short": norm(faces[0].get("name", c["name"])),
        "_text": REMINDER.sub("", norm(text)), "_full": norm(text),
        "_type": norm(type_line), "_front_type": norm(faces[0].get("type_line") or type_line),
        "_flavor": norm(flavor), "_artist": norm(c.get("artist") or faces[0].get("artist", "")),
        "_mana": face_mana,
        # Artist, flavor text, year and game can differ between printings. These start
        # as the main printing's and widen to every printing once printings load.
        "_artist_all": norm(c.get("artist") or faces[0].get("artist", "")),
        "_flavor_all": norm(flavor), "_years": {c.get("released_at", "")[:4]},
        "_games": set(c.get("games", [])),
        "_extra": (c.get("layout") in EXTRA_LAYOUTS or "playtest" in c.get("promo_types", [])
                   or (not any(v != "not_legal" for v in legal.values())
                       and c.get("set_type") != "funny")),
    }


class DB:
    """Everything the server knows, loaded once at startup."""
    cards = []          # trimmed oracle cards
    by_id = {}          # card id -> card
    tag_names = {}      # anything you might type after otag: -> tag
    tags_by_id = {}
    tag_members = {}    # tag id -> oracle_ids, child tags included (cached)
    card_tags = defaultdict(set)   # oracle_id -> tags placed on it directly
    rulings = defaultdict(list)    # oracle_id -> [(date, text)]
    printings = defaultdict(list)  # oracle_id -> every English printing
    print_sets = defaultdict(set)  # oracle_id -> set codes it was printed in
    print_rarity = defaultdict(set)
    printings_ready = False
    updated = ""


def load():
    print("Loading cards...", flush=True)
    DB.cards = [trim(c) for c in read_jsonl("oracle_cards")]
    DB.by_id = {c["id"]: c for c in DB.cards}
    tags = list(read_jsonl("oracle_tags"))
    for t in tags:
        DB.tags_by_id[t["id"]] = t
        DB.tag_names[tag_key(t["slug"])] = t  # real names win over aliases
        for g in t.get("taggings", []):
            DB.card_tags[g["oracle_id"]].add(t["slug"])
    for t in tags:  # aliases: otag:board-wipe finds the "sweeper" tag (alias "boardwipe")
        for n in [t.get("label", "")] + list(t.get("aliases", [])):
            DB.tag_names.setdefault(tag_key(n), t)
    for r in read_jsonl("rulings"):
        DB.rulings[r["oracle_id"]].append((r.get("published_at", ""), r.get("comment", "")))
    try:
        with open(os.path.join(DATA, "manifest.json"), encoding="utf-8") as f:
            DB.updated = json.load(f).get("oracle_cards", {}).get("updated_at", "")[:10]
    except OSError:
        pass
    print(f"Loaded {len(DB.cards):,} cards. Loading printings in the background...", flush=True)
    threading.Thread(target=load_printings, daemon=True).start()


def load_printings():
    """default_cards is big (every printing), so it loads after the page is up.
    Until it's done, e:/r: only see each card's main printing."""
    extra = defaultdict(lambda: (set(), set(), set(), set()))  # artists, flavors, years, games
    for p in read_jsonl("default_cards"):
        faces = p.get("card_faces") or [p]
        oid = p.get("oracle_id") or faces[0].get("oracle_id")
        DB.print_sets[oid].add(p.get("set", ""))
        DB.print_rarity[oid].add(p.get("rarity", ""))
        artists, flavors, years, games = extra[oid]
        artists.add(norm(p.get("artist") or faces[0].get("artist", "")))
        flavors.add(norm("\n".join(f.get("flavor_text", "") for f in faces)))
        years.add(p.get("released_at", "")[:4])
        games.update(p.get("games", []))
        DB.printings[oid].append({
            "set": p.get("set", ""), "set_name": p.get("set_name", ""),
            "number": p.get("collector_number", ""), "released": p.get("released_at", ""),
            "rarity": p.get("rarity", ""), "usd": (p.get("prices") or {}).get("usd"),
            "usd_foil": (p.get("prices") or {}).get("usd_foil"),
            "uri": p.get("scryfall_uri", ""), "digital": bool(p.get("digital")),
        })
    for c in DB.cards:
        if c["oracle_id"] in extra:
            artists, flavors, years, games = extra[c["oracle_id"]]
            c["_artist_all"] = "\n".join(sorted(artists | {c["_artist"]}))
            c["_flavor_all"] = "\n".join(sorted(flavors | {c["_flavor"]}))
            c["_years"] = years | c["_years"]
            c["_games"] = games | c["_games"]
    DB.printings_ready = True
    print("Printings loaded.", flush=True)
    for c in DB.cards:  # get ~ searches ready ahead of time
        self_text(c, "_text")
        self_text(c, "_full")


def tag_key(name):
    """Tag names compared without case, spaces or dashes."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def tag_members(tag):
    """Oracle ids with this tag or any tag under it (Scryfall counts children:
    otag:removal has no cards of its own, only through its child tags)."""
    if tag["id"] in DB.tag_members:
        return DB.tag_members[tag["id"]]
    out, stack, seen = set(), [tag], set()
    while stack:
        t = stack.pop()
        if t["id"] in seen:
            continue
        seen.add(t["id"])
        out.update(g["oracle_id"] for g in t.get("taggings", []))
        stack.extend(DB.tags_by_id[i] for i in t.get("child_ids", []) if i in DB.tags_by_id)
    DB.tag_members[tag["id"]] = out
    return out


# ------------------------------------------------------- reading a search query
# A query is a list of terms. Terms side by side must all match; "or" between
# them means either; a leading "-" means NOT; (parentheses) group.

TERM = re.compile(r'''(?P<neg>-)?(?:
      (?P<key>[A-Za-z]+)(?P<op>!=|<=|>=|:|=|<|>)(?P<val>"[^"]*"?|/(?:\\.|[^/\\])*/?|[^\s()]*)
    | !(?P<exact>"[^"]*"?|[^\s()]+)
    | (?P<word>"[^"]*"?|[^\s()]+))''', re.X)


def value(raw):
    """('re', pattern) for /regex/, else ('str', text without quotes)."""
    if len(raw) >= 2 and raw.startswith("/"):
        return ("re", raw[1:-1] if raw.endswith("/") else raw[1:])
    return ("str", raw.strip('"'))


def tokenize(q):
    out, pos = [], 0
    while pos < len(q):
        ch = q[pos]
        if ch.isspace():
            pos += 1
        elif q.startswith("-(", pos):
            out += [("not",), ("(",)]
            pos += 2
        elif ch in "()":
            out.append((ch,))
            pos += 1
        else:
            m = TERM.match(q, pos)
            if not m or m.end() == pos:
                pos += 1
                continue
            pos = m.end()
            neg = bool(m.group("neg"))
            if m.group("key") is not None:
                tok = ("term", m.group("key").lower(), m.group("op"), value(m.group("val")))
            elif m.group("exact") is not None:
                tok = ("exact", m.group("exact").strip('"'))
            else:
                w = m.group("word")
                if not neg and w.lower() == "or":
                    out.append(("or",))
                    continue
                if not neg and w.lower() == "and":
                    continue
                tok = ("name", value(w))
            if neg:
                out.append(("not",))
            out.append(tok)
    return out


class Parser:
    """Turns tokens into a tree: ("and", [...]), ("or", [...]), ("not", x) or a term."""

    def __init__(self, tokens):
        self.t, self.i = tokens, 0

    def peek(self):
        return self.t[self.i][0] if self.i < len(self.t) else None

    def parse(self):
        parts = []
        while self.i < len(self.t):
            parts.append(self.parse_or())
            if self.peek() == ")":  # stray closing parenthesis: skip it
                self.i += 1
        return ("and", parts)

    def parse_or(self):
        parts = [self.parse_and()]
        while self.peek() == "or":
            self.i += 1
            parts.append(self.parse_and())
        return parts[0] if len(parts) == 1 else ("or", parts)

    def parse_and(self):
        parts = []
        while self.peek() not in (None, "or", ")"):
            parts.append(self.parse_unary())
        return ("and", parts)

    def parse_unary(self):
        tok = self.t[self.i]
        self.i += 1
        if tok[0] == "not":
            if self.peek() in (None, "or", ")"):
                return ("and", [])
            return ("not", self.parse_unary())
        if tok[0] == "(":
            inner = self.parse_or()
            if self.peek() == ")":
                self.i += 1
            return inner
        return tok


# ------------------------------------------------------------ matching terms

CMP = {":": lambda a, b: a == b, "=": lambda a, b: a == b, "!=": lambda a, b: a != b,
       "<": lambda a, b: a < b, "<=": lambda a, b: a <= b,
       ">": lambda a, b: a > b, ">=": lambda a, b: a >= b}

COLOR_WORDS = {
    "white": "w", "blue": "u", "black": "b", "red": "r", "green": "g",
    "azorius": "wu", "dimir": "ub", "rakdos": "br", "gruul": "rg", "selesnya": "gw",
    "orzhov": "wb", "izzet": "ur", "golgari": "bg", "boros": "rw", "simic": "gu",
    "bant": "gwu", "esper": "wub", "grixis": "ubr", "jund": "brg", "naya": "rgw",
    "abzan": "wbg", "jeskai": "urw", "sultai": "bgu", "mardu": "rwb", "temur": "gur",
    "colorless": "c", "multicolor": "m", "wubrg": "wubrg", "fivecolor": "wubrg",
}

FORMATS = {"edh": "commander", "cmdr": "commander", "pdh": "paupercommander",
           "historicbrawl": "brawl"}


class Ctx:
    """Settings and warnings gathered while reading one query."""

    def __init__(self):
        self.warnings, self.extras = [], False
        self.order, self.dir = None, None

    def warn(self, msg):
        if msg not in self.warnings:
            self.warnings.append(msg)


# What ~ stands for in o: searches: the card's name, a legend's short name
# ("Zurgo"), or newer wording like "this creature".
SELF_WORDS = ("spell|creature|card|artifact|enchantment|land|planeswalker|permanent|saga|"
              "vehicle|aura|equipment|battle|class|case|siege|room|token|background|"
              "spacecraft|planet|kindred|instant|sorcery")


def self_pattern(c):
    names = {re.escape(c["_short"]), re.escape(c["_short"].split(",")[0])}
    # whole words only, so a card named "Ash" doesn't turn "flash" into "fl~"
    return (r"(?<![a-z0-9])(?:" + "|".join(sorted(names, key=len, reverse=True))
            + "|this (?:" + SELF_WORDS + r"))(?![a-z0-9])")


def self_text(c, field):
    """The card's text with its own name (and 'this creature' etc.) written as ~.
    Made the first time it's needed, or in the background after printings load."""
    key = "_self" + field
    if key not in c:
        c[key] = re.sub(self_pattern(c), "~", c[field])
    return c[key]


def text_test(val, field, ctx):
    """Substring or /regex/ test on a lowercase text field. ^ and $ work per line."""
    kind, s = val
    tilde = "~" in s and field in ("_text", "_full")
    if kind == "str":
        s = norm(s)
        if tilde:
            return lambda c: s in self_text(c, field)
        return lambda c: s in c[field]
    try:
        rx = re.compile(s, re.I | re.M)
    except re.error as e:
        ctx.warn(f"Couldn't read the regex /{s}/ ({e}), so it was ignored.")
        return None
    if tilde:
        return lambda c: bool(rx.search(self_text(c, field)))
    return lambda c: bool(rx.search(c[field]))


def color_test(field, op, s, ctx, is_identity):
    """c: and id: tests. c:rg means at least red and green; id:rg means within
    red-green (what a Gruul commander can play), like Scryfall."""
    s = COLOR_WORDS.get(s.lower(), s.lower())
    # colors are checked per face (any face can match); identity is one set
    sets = (lambda c: [c["ci"]]) if is_identity else (lambda c: c["face_colors"])
    if s.isdigit():  # c=2: exactly two colors
        n = int(s)
        return lambda c: any(CMP[op](len(x), n) for x in sets(c))
    if s == "m":
        test = lambda c: any(len(x) >= 2 for x in sets(c))
        return (lambda c: not test(c)) if op == "!=" else test
    if s == "c":
        want = set()
    elif set(s) <= set("wubrg"):
        want = set(s.upper())
    else:
        ctx.warn(f"Didn't recognize the color '{s}', so it was ignored.")
        return None
    if op == ":":
        op = "<=" if is_identity else ">="
    if not want and op == ">=":  # c:c means colorless, not "anything"
        op = "="
    compare = {"=": lambda x: x == want, "!=": lambda x: x != want,
               ">=": lambda x: x >= want, "<=": lambda x: x <= want,
               ">": lambda x: x > want, "<": lambda x: x < want}[op]
    return lambda c: any(compare(x) for x in sets(c))


def number_test(op, s, getter, ctx, label):
    """cmc>=4, pow>tou, cmc:even ... getter(card) returns a number or a list of
    numbers (one per face); any face matching counts."""
    fields = {"pow": "power", "power": "power", "tou": "toughness", "toughness": "toughness",
              "loy": "loyalty", "loyalty": "loyalty"}
    if s in ("even", "odd"):
        want = 0 if s == "even" else 1
        return lambda c: any(v is not None and v == int(v) and int(v) % 2 == want
                             for v in as_list(getter(c)))
    if s.lower() in fields:  # compare against another stat: any face against any face,
        other = fields[s.lower()]  # which is how Scryfall treats double-faced cards
        return lambda c: any(a is not None and b is not None and CMP[op](a, b)
                             for a in as_list(getter(c))
                             for b in [face_number(f.get(other)) for f in c["faces"]])
    try:
        n = float(s)
    except ValueError:
        ctx.warn(f"'{label}' needs a number, not '{s}'; ignored.")
        return None
    return lambda c: any(v is not None and CMP[op](v, n) for v in as_list(getter(c)))


def as_list(v):
    return v if isinstance(v, list) else [v]


PERMANENT = ("artifact", "creature", "enchantment", "land", "planeswalker", "battle")
DFC_LAYOUTS = {"transform", "modal_dfc", "meld", "reversible_card", "double_faced_token"}


def front_has(c, *words):
    return any(w in c["_front_type"] for w in words)


IS_TESTS = {
    "commander": lambda c: ("legendary" in c["_front_type"]
                            and (front_has(c, "creature")
                                 or (front_has(c, "vehicle", "spacecraft")
                                     and c["faces"][0].get("power") is not None)))
                           or "can be your commander" in c["_text"],
    "permanent": lambda c: front_has(c, *PERMANENT),
    "spell": lambda c: not front_has(c, "land"),
    "historic": lambda c: front_has(c, "legendary", "artifact", "saga"),
    "vanilla": lambda c: front_has(c, "creature") and not c["_full"].strip(),
    "gamechanger": lambda c: c["gc"], "gc": lambda c: c["gc"],
    "reserved": lambda c: c["reserved"],
    "dfc": lambda c: c["layout"] in DFC_LAYOUTS, "mdfc": lambda c: c["layout"] == "modal_dfc",
    "token": lambda c: c["layout"] in ("token", "double_faced_token"),
    "party": lambda c: front_has(c, "creature") and front_has(c, "cleric", "rogue", "warrior", "wizard"),
    "outlaw": lambda c: front_has(c, "creature")
                        and front_has(c, "assassin", "mercenary", "pirate", "rogue", "warlock"),
    "bear": lambda c: front_has(c, "creature") and c["cmc"] == 2
                      and c["faces"][0].get("power") == "2" and c["faces"][0].get("toughness") == "2",
}
LAYOUT_WORDS = {"split", "flip", "transform", "meld", "leveler", "adventure", "saga",
                "class", "case", "prototype", "mutate", "host", "augment", "emblem"}


def is_test(s, ctx):
    s = s.lower().replace("_", "")
    if s in IS_TESTS:
        return IS_TESTS[s]
    if s in LAYOUT_WORDS:
        return lambda c: c["layout"] == s
    ctx.warn(f"is:{s} isn't supported here, so it was ignored.")
    return None


def term_test(key, op, val, ctx):
    """One key:value term -> a function card -> True/False (None = ignore it)."""
    kind, s = val
    low = s.lower()
    if key in ("name", "n"):
        return text_test(val, "_name", ctx)
    if key in ("o", "oracle"):
        return text_test(val, "_text", ctx)
    if key in ("fo", "fulloracle"):
        return text_test(val, "_full", ctx)
    if key in ("t", "type"):
        if low in ("token", "emblem", "plane", "scheme", "vanguard", "phenomenon"):
            ctx.extras = True
        return text_test(val, "_type", ctx)
    if key in ("ft", "flavor"):  # any printing's flavor text / artist, like Scryfall
        return text_test(val, "_flavor_all", ctx)
    if key in ("a", "artist"):
        return text_test(val, "_artist_all", ctx)
    if key in ("c", "color", "colors"):
        return color_test("colors", op, s, ctx, is_identity=False)
    if key in ("id", "identity", "ci", "commander"):
        return color_test("ci", op, s, ctx, is_identity=True)
    if key in ("cmc", "mv", "manavalue"):
        return number_test(op, low, lambda c: c["cmc"], ctx, key)
    for keys, stat in ((("pow", "power"), "power"), (("tou", "toughness"), "toughness"),
                       (("loy", "loyalty"), "loyalty")):
        if key in keys:
            return number_test(op, low, lambda c, st=stat: [face_number(f.get(st)) for f in c["faces"]],
                               ctx, key)
    if key in ("m", "mana"):  # checked per face, like colors
        want = mana_symbols(s)
        def has(m):  # face cost m contains everything in want
            return all(m[k] >= n for k, n in want.items())
        def within(m):  # want contains everything in face cost m
            return all(want[k] >= n for k, n in m.items())
        face_test = {":": has, ">=": has, "=": lambda m: m == want, "!=": lambda m: m != want,
                     "<=": within, ">": lambda m: has(m) and m != want,
                     "<": lambda m: within(m) and m != want}[op]
        return lambda c: any(face_test(m) for m in c["_mana"])
    if key in ("r", "rarity"):
        name = RARITY_ABBR.get(low, low)
        if name not in RARITY:
            ctx.warn(f"Didn't recognize the rarity '{s}'; ignored.")
            return None
        rank = RARITY[name]
        def rarity(c):
            have = DB.print_rarity.get(c["oracle_id"]) if DB.printings_ready else None
            return any(CMP[op](RARITY.get(r, -1), rank) for r in (have or {c["rarity"]}))
        return rarity
    if key in ("s", "e", "set", "edition"):
        if not DB.printings_ready:
            ctx.warn("Printings are still loading, so set searches only see each card's main printing.")
        def in_set(c):
            sets = DB.print_sets.get(c["oracle_id"]) if DB.printings_ready else None
            return low in (sets or {c["set"]})
        return in_set
    return more_term_tests(key, op, val, ctx)


def more_term_tests(key, op, val, ctx):
    kind, s = val
    low = s.lower()
    if key in ("f", "format", "legal", "banned", "restricted"):
        fmt = FORMATS.get(low, low)
        if not any(fmt in c["legalities"] for c in DB.cards[:50]):
            ctx.warn(f"Didn't recognize the format '{s}'; ignored.")
            return None
        if key == "banned":
            return lambda c: c["legalities"].get(fmt) == "banned"
        if key == "restricted":
            return lambda c: c["legalities"].get(fmt) == "restricted"
        return lambda c: c["legalities"].get(fmt) in ("legal", "restricted")
    if key in ("is", "has"):
        if low in ("token", "extra"):
            ctx.extras = True
        return is_test(low, ctx)
    if key == "not":
        t = is_test(low, ctx)
        return (lambda c: not t(c)) if t else None
    if key in ("kw", "keyword"):
        return lambda c: low in c["keywords"]
    if key in ("otag", "oracletag", "function", "oracle_tag"):
        tag = DB.tag_names.get(tag_key(low))
        if not tag:
            ctx.warn(f"No Scryfall tag called '{s}', so nothing matched it.")
            return lambda c: False
        members = tag_members(tag)
        return lambda c: c["oracle_id"] in members
    if key == "year":  # any printing's year
        return number_test(op, low, lambda c: [float(y) for y in c["_years"] if y], ctx, key)
    if key in ("usd", "eur", "tix"):
        def price(c, k=key):
            p = c["prices"].get(k) or (c["prices"].get(k + "_foil") if k != "tix" else None)
            return float(p) if p else None
        return number_test(op, low, price, ctx, key)
    if key == "game":
        return lambda c: low in c["_games"]
    if key == "order":
        ctx.order = low
        return None
    if key == "dir":
        ctx.dir = low
        return None
    if key == "include":
        ctx.extras = ctx.extras or low == "extras"
        return None
    if key in ("unique", "prefer", "display", "lang", "as"):
        return None  # display settings on Scryfall; nothing to do here
    if key in ("atag", "arttag", "art"):
        ctx.warn("Art tags (atag:) aren't supported here yet; ignored.")
        return None
    ctx.warn(f"Unknown keyword '{key}:', so it was ignored.")
    return None


def build(node, ctx):
    """Tree -> function card -> bool. None means 'no condition' (always true)."""
    kind = node[0]
    if kind == "and":
        parts = [p for p in (build(n, ctx) for n in node[1]) if p]
        if not parts:
            return None
        return parts[0] if len(parts) == 1 else (lambda c: all(p(c) for p in parts))
    if kind == "or":
        parts = [build(n, ctx) for n in node[1]]
        if any(p is None for p in parts):
            return None
        return lambda c: any(p(c) for p in parts)
    if kind == "not":
        inner = build(node[1], ctx)
        return (lambda c: not inner(c)) if inner else None
    if kind == "name":
        return text_test(node[1], "_name", ctx)
    if kind == "exact":
        want = norm(node[1])
        return lambda c: c["_name"] == want or want in c["_face_names"]
    return term_test(node[1], node[2], node[3], ctx)


def price_of(c):
    p = c["prices"].get("usd") or c["prices"].get("usd_foil")
    return float(p) if p else None


SORTS = {  # order name -> (key that may be None, default direction)
    "name": (lambda c: c["_name"], "asc"),
    "cmc": (lambda c: c["cmc"], "asc"), "mv": (lambda c: c["cmc"], "asc"),
    "edhrec": (lambda c: c["edhrec"], "asc"),
    "usd": (price_of, "asc"), "price": (price_of, "asc"),
    "released": (lambda c: c["released"] or None, "desc"),
    "rarity": (lambda c: RARITY.get(c["rarity"]), "desc"),
    "color": (lambda c: (len(c["colors"]), sorted("WUBRG".index(x) for x in c["colors"] if x in "WUBRG")), "asc"),
    "power": (lambda c: face_number(c["faces"][0].get("power")), "desc"),
    "toughness": (lambda c: face_number(c["faces"][0].get("toughness")), "desc"),
    "artist": (lambda c: c["_artist"] or None, "asc"),
}


def search(q, order="name", direction="", page=1):
    ctx = Ctx()
    test = build(Parser(tokenize(q)).parse(), ctx)
    if test is None and not q.strip():
        return {"total": 0, "cards": [], "warnings": [], "page": 1, "pages": 0}
    found = [c for c in DB.cards
             if (ctx.extras or not c["_extra"]) and (test is None or test(c))]
    order = ctx.order or order or "name"
    if order not in SORTS:
        ctx.warn(f"Can't sort by '{order}'; sorted by name.")
        order = "name"
    key, default_dir = SORTS[order]
    direction = ctx.dir if ctx.dir in ("asc", "desc") else (direction or default_dir)
    have = [c for c in found if key(c) is not None]
    missing = [c for c in found if key(c) is None]  # no price etc.: always last
    have.sort(key=lambda c: c["_name"])  # ties keep name order
    have.sort(key=key, reverse=(direction == "desc"))
    found = have + sorted(missing, key=lambda c: c["_name"])
    pages = max(1, -(-len(found) // PAGE_SIZE))
    page = min(max(1, page), pages)
    chunk = found[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]
    return {"total": len(found), "page": page, "pages": pages, "order": order,
            "dir": direction, "warnings": ctx.warnings, "cards": [summary(c) for c in chunk]}


def summary(c):
    return {"id": c["id"], "name": c["name"], "mana_cost": c["mana_cost"],
            "type_line": c["type_line"], "back": len(c["imgs"]) > 1,
            "faces": c["faces"], "usd": c["prices"].get("usd"), "rarity": c["rarity"]}


def details(card_id):
    c = DB.by_id.get(card_id)
    if not c:
        return None
    oid = c["oracle_id"]
    prints = sorted(DB.printings.get(oid, []), key=lambda p: p["released"], reverse=True)
    return dict(summary(c), **{
        "cmc": c["cmc"], "legalities": c["legalities"], "prices": c["prices"],
        "edhrec": c["edhrec"], "gc": c["gc"], "reserved": c["reserved"], "artist": c["artist"],
        "set_name": c["set_name"], "released": c["released"], "scryfall_uri": c["scryfall_uri"],
        "colors": sorted(c["colors"]), "ci": sorted(c["ci"]), "keywords": sorted(c["keywords"]),
        "tags": sorted(DB.card_tags.get(oid, ())),
        "rulings": sorted(DB.rulings.get(oid, [])),
        "printings": prints if DB.printings_ready else None,
    })


# ------------------------------------------------------------------ web server

IMG_NAME = re.compile(r"^([0-9a-f-]{36})(-back)?\.jpg$")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the window quiet
        pass

    def send(self, body, ctype, code=200, cache=False):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if cache:
            self.send_header("Cache-Control", "max-age=86400")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, obj, code=200):
        self.send(json.dumps(obj).encode("utf-8"), "application/json; charset=utf-8", code)

    def do_GET(self):
        u = urlparse(self.path)
        qs = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if u.path in ("/", "/index.html"):
                with open(PAGE, "rb") as f:
                    self.send(f.read(), "text/html; charset=utf-8")
            elif u.path == "/api/search":
                self.send_json(search(qs.get("q", ""), qs.get("order", "name"),
                                      qs.get("dir", ""), int(qs.get("page", "1") or 1)))
            elif u.path == "/api/card":
                d = details(qs.get("id", ""))
                self.send_json(d if d else {"error": "not found"}, 200 if d else 404)
            elif u.path == "/api/status":
                self.send_json({"cards": len(DB.cards), "updated": DB.updated,
                                "printings_ready": DB.printings_ready})
            elif u.path.startswith("/img/"):
                self.image(u.path[5:])
            else:
                self.send(b"Not found", "text/plain", 404)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser gave up on this request; nothing to do

    def image(self, name):
        """Serve the saved image if there is one, else send the browser to Scryfall's."""
        m = IMG_NAME.match(name)
        card = DB.by_id.get(m.group(1)) if m else None
        if not card:
            return self.send(b"Not found", "text/plain", 404)
        path = os.path.join(IMAGES, name)
        if os.path.exists(path):
            with open(path, "rb") as f:
                return self.send(f.read(), "image/jpeg", cache=True)
        imgs = card["imgs"]
        url = imgs[1] if m.group(2) and len(imgs) > 1 else (imgs[0] if imgs else None)
        if not url:
            return self.send(b"No image", "text/plain", 404)
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()


def main(argv):
    if not os.path.exists(os.path.join(DATA, "oracle_cards.jsonl.gz")):
        sys.exit("No card data yet. Run: python update_scryfall.py")
    url = f"http://localhost:{PORT}/"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print(f"Port {PORT} is busy; the search is probably already running. Opening it.")
        webbrowser.open(url)
        return
    load()
    print(f"Card search is running at {url}  (close this window to stop it)", flush=True)
    if "--no-browser" not in argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(sys.argv[1:])
