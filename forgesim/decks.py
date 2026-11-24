"""Deck files: Moxfield export -> Forge .dck, card checks, and variants.

A Forge Commander deck file looks like:
    [metadata]
    Name=zurgo-v0
    [Commander]
    1 Zurgo Stormrender
    [Main]
    1 Sol Ring
    ...
Card lines may carry "|SET" after the name; we leave the set off so Forge
picks any printing it has.

Command line:
    python -m forgesim.decks convert <export.txt> <out.dck> [--name LABEL] [--commander NAME ...]
    python -m forgesim.decks check <deck.dck>
    python -m forgesim.decks variant <base.dck> <swaps.json> <out.dck>
swaps.json: {"name": "zurgo-v1", "out": ["Card A", ...], "in": ["Card B", ...]}
"""

import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
CARD_LINE = re.compile(r"^(\d+)x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s+(\S+))?$")
MARKERS = re.compile(r"\s\*[A-Z]+\*")
SECTION = re.compile(
    r"^(commanders?|companions?|deck|main ?deck|mainboard|sideboard|maybeboard|considering|tokens?)$",
    re.I,
)
SIDE = re.compile(r"^(sideboard|maybeboard|considering|tokens?)$", re.I)
CMD_SECTION = re.compile(r"^commanders?$", re.I)
BASICS = {"plains", "island", "swamp", "mountain", "forest", "wastes"}


def name_key(name):
    """Front face, no accents, lowercase: matches Moxfield, Scryfall and Forge spellings."""
    front = re.split(r"\s+//?\s+", str(name))[0]
    s = unicodedata.normalize("NFD", front)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


_CARDS = None


def forge_cards():
    """{name_key: (forge name, ai_flag, can_be_commander)} from forge_cards.tsv."""
    global _CARDS
    if _CARDS is None:
        _CARDS = {}
        with open(os.path.join(HERE, "forge_cards.tsv"), encoding="utf-8") as fh:
            next(fh)
            for line in fh:
                parts = line.rstrip("\n").split("\t")
                name, faces, flag = parts[0], parts[1], parts[2]
                cmd = parts[3] == "1" if len(parts) > 3 else False
                _CARDS[name_key(name)] = (name, flag, cmd)
                for face in faces.split(" // ")[1:]:
                    _CARDS.setdefault(name_key(face), (name, flag, cmd))
    return _CARDS


def parse_export(text):
    """Moxfield Export text -> (commanders, main) as lists of (qty, name).

    The commander is the "Commander" section if there is one. Otherwise
    Moxfield puts the commander first, so the first card counts as the
    commander when Forge says it can be one. Sideboard / maybeboard /
    tokens sections are skipped.
    """
    commanders, main = [], []
    section = "main"
    for raw in text.lstrip(chr(0xFEFF)).splitlines():
        line = MARKERS.sub("", raw).strip()
        if not line or line.startswith("//"):
            continue
        m = CARD_LINE.match(line)
        if m:
            entry = (int(m.group(1)), m.group(2).strip())
            if section == "cmd":
                commanders.append(entry)
            elif section == "main":
                main.append(entry)
            continue
        bare = line.rstrip(":").strip()
        if line.endswith(":") or SECTION.match(bare):
            section = (
                "cmd"
                if CMD_SECTION.match(bare)
                else ("side" if SIDE.match(bare) else "main")
            )
    if not commanders and main:
        info = forge_cards().get(name_key(main[0][1]))
        if info and info[2]:
            commanders.append(main.pop(0))
    return commanders, main


def write_dck(path, name, commanders, main):
    lines = ["[metadata]", "Name=" + name, "[Commander]"]
    lines += ["%d %s" % (q, n) for q, n in commanders]
    lines.append("[Main]")
    lines += ["%d %s" % (q, n) for q, n in main]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")


def read_dck(path):
    """-> (name, commanders, main); card lines lose any |SET suffix."""
    name, commanders, main = "", [], []
    section = None
    with open(path, encoding="utf-8-sig") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1].lower()
                continue
            if section == "metadata":
                if line.lower().startswith("name="):
                    name = line[5:].strip()
                continue
            m = re.match(r"^(\d+)\s+(.+)$", line)
            if not m:
                continue
            entry = (int(m.group(1)), m.group(2).split("|")[0].strip())
            if section == "commander":
                commanders.append(entry)
            elif section == "main":
                main.append(entry)
    return name, commanders, main


def to_forge_names(entries):
    """Swap each name for Forge's spelling; returns (entries, missing names)."""
    cards = forge_cards()
    out, missing = [], []
    for q, n in entries:
        info = cards.get(name_key(n))
        if info is None:
            missing.append(n)
            out.append((q, n))
        else:
            out.append((q, info[0]))
    return out, missing


def check(commanders, main):
    """Problems Forge would hit, plus cards its AI is flagged as weak with."""
    cards = forge_cards()
    missing, weak = [], []
    for q, n in commanders + main:
        info = cards.get(name_key(n))
        if info is None:
            missing.append(n)
        elif info[1] in ("all", "random"):
            weak.append((n, info[1]))
    size = sum(q for q, _ in commanders + main)
    return {"size": size, "missing": missing, "ai_weak": weak}


def convert(text, name, commander_names=None):
    commanders, main = parse_export(text)
    if commander_names:
        keys = {name_key(c) for c in commander_names}
        pool = commanders + main
        commanders = [e for e in pool if name_key(e[1]) in keys]
        main = [e for e in pool if name_key(e[1]) not in keys]
    commanders, m1 = to_forge_names(commanders)
    main, m2 = to_forge_names(main)
    return commanders, main, m1 + m2


def apply_swaps(main, outs, ins):
    """Swap cards: the i-th card of `ins` takes the i-th card of `outs`'s place
    in the list (basic lands lose one copy and the new card goes last), extra
    `ins` go at the end. Keeping places matters: Forge replays a game from its
    seed, so a variant that keeps the list order draws the same cards in the
    same order except where a swapped card sits.
    Returns (new main, names in `outs` that weren't in the deck)."""
    main = list(main)
    not_found = []
    ins_forge, _missing = to_forge_names([(1, n) for n in ins])
    have = {name_key(n) for _, n in main}
    queue = []
    for q, n in ins_forge:
        k = name_key(n)
        if k in have and k not in BASICS:
            continue  # singleton: never add a second copy
        have.add(k)
        queue.append(n)
    tail = []
    for o in outs:
        k = name_key(o)
        for i, (q, n) in enumerate(main):
            if name_key(n) == k:
                new = queue.pop(0) if queue else None
                if q > 1:
                    main[i] = (q - 1, n)
                    if new:
                        tail.append((1, new))
                elif new:
                    main[i] = (1, new)
                else:
                    main.pop(i)
                break
        else:
            not_found.append(o)
    main += tail + [(1, n) for n in queue]
    return main, not_found


def main_cli(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "convert":
        src, out = argv[2], argv[3]
        label = os.path.splitext(os.path.basename(out))[0]
        cmdrs = []
        rest = argv[4:]
        i = 0
        while i < len(rest):
            if rest[i] == "--name":
                label = rest[i + 1]
                i += 2
            elif rest[i] == "--commander":
                cmdrs.append(rest[i + 1])
                i += 2
            else:
                i += 1
        with open(src, encoding="utf-8-sig") as fh:
            commanders, main, missing = convert(fh.read(), label, cmdrs)
        write_dck(out, label, commanders, main)
        rep = check(commanders, main)
        print(
            json.dumps(
                {"wrote": out, "commanders": [n for _, n in commanders], **rep},
                indent=1,
            )
        )
        return 1 if missing or not commanders else 0
    if cmd == "check":
        name, commanders, main = read_dck(argv[2])
        print(
            json.dumps(
                {
                    "name": name,
                    "commanders": [n for _, n in commanders],
                    **check(commanders, main),
                },
                indent=1,
            )
        )
        return 0
    if cmd == "variant":
        base, swaps_path, out = argv[2], argv[3], argv[4]
        name, commanders, main = read_dck(base)
        with open(swaps_path, encoding="utf-8") as fh:
            sw = json.load(fh)
        main2, not_found = apply_swaps(main, sw.get("out", []), sw.get("in", []))
        label = sw.get("name") or os.path.splitext(os.path.basename(out))[0]
        write_dck(out, label, commanders, main2)
        rep = check(commanders, main2)
        print(json.dumps({"wrote": out, "not_in_deck": not_found, **rep}, indent=1))
        return 1 if not_found or rep["missing"] else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main_cli(sys.argv))
