"""Build forgesim/forge_cards.tsv from a Forge source or install folder.

Usage:
    python tools/build_cardlist.py <path to Forge's res/cardsfolder>

Forge stores one script per card in res/cardsfolder (plain .txt files in the
source tree; a cardsfolder.zip in some installs, which this also reads).
For each card we keep:
    name            the card's name (front face for multi-face cards)
    faces           every face name, joined with " // "
    ai_flag         Forge's own note on how well its AI plays the card:
                    "all"    = AI:RemoveDeck:All   (AI can't use it well at all)
                    "random" = AI:RemoveDeck:Random (AI is shaky with it)
                    "noncmd" = AI:RemoveDeck:NonCommander
                    ""       = no flag
    can_command     "1" if it's a legendary creature or says it can be your commander
The converter uses this list to catch cards Forge doesn't have, and the
analyzer uses ai_flag to mark per-card stats it shouldn't trust.
"""

import io
import os
import sys
import zipfile


def parse_script(text):
    names = []
    flag = ""
    cmd = "can be your commander" in text
    first_types = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("Name:"):
            names.append(line[5:].strip())
        elif line.startswith("Types:") and first_types is None:
            first_types = line[6:]
            if "Legendary" in first_types and "Creature" in first_types:
                cmd = True
        elif line.startswith("AI:RemoveDeck:"):
            kind = line.split(":", 2)[2].strip().lower()
            # keep the strongest flag seen on any face
            rank = {"all": 3, "random": 2, "noncommander": 1}
            short = {"all": "all", "random": "random", "noncommander": "noncmd"}
            if kind in rank and (
                not flag or rank[kind] > {"all": 3, "random": 2, "noncmd": 1}[flag]
            ):
                flag = short[kind]
    return names, flag, cmd


def iter_scripts(path):
    if os.path.isdir(path):
        for root, _dirs, files in os.walk(path):
            for f in files:
                if f.endswith(".txt"):
                    with open(
                        os.path.join(root, f), encoding="utf-8", errors="replace"
                    ) as fh:
                        yield fh.read()
                elif f.endswith(".zip"):
                    yield from iter_zip(os.path.join(root, f))
    elif path.endswith(".zip"):
        yield from iter_zip(path)


def iter_zip(path):
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            if n.endswith(".txt"):
                yield io.TextIOWrapper(
                    z.open(n), encoding="utf-8", errors="replace"
                ).read()


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    rows = {}
    for text in iter_scripts(argv[1]):
        names, flag, cmd = parse_script(text)
        if not names:
            continue
        rows[names[0]] = (" // ".join(names), flag, "1" if cmd else "")
    out = os.path.join(os.path.dirname(__file__), "..", "forgesim", "forge_cards.tsv")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("name\tfaces\tai_flag\tcan_command\n")
        for name in sorted(rows):
            faces, flag, cmd = rows[name]
            fh.write(f"{name}\t{faces}\t{flag}\t{cmd}\n")
    print(f"wrote {len(rows)} cards to {os.path.normpath(out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
