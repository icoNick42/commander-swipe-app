"""
update_scryfall.py - download or refresh a local copy of Scryfall's card database.

Scryfall publishes its whole database as free files, rebuilt every day:
https://scryfall.com/docs/api/bulk-data
This script asks Scryfall which files exist and downloads any that are newer
than the copy already in the "data" folder next to this script. Files that
haven't changed are skipped, so it's safe to run as often as you like.

Usage (from this folder):
    python update_scryfall.py                  # every file (~550 MB the first time)
    python update_scryfall.py oracle_cards     # just one file (names below)
    python update_scryfall.py --skip all_cards # everything except the big one

File types Scryfall offers:
    oracle_cards    one entry per unique card (the newest recognizable printing)
    default_cards   every printing, in English (or the only language it exists in)
    all_cards       every printing in every language (the big one)
    unique_artwork  one entry per unique piece of card art
    rulings         official rulings, matched to cards by oracle_id
    oracle_tags     Scryfall Tagger's function tags (removal, ramp, ...) by oracle_id
    art_tags        Tagger's art tags (what's in the picture) by illustration_id

Files are saved as data/<type>.jsonl.gz: gzip-compressed, one JSON card per line.
data/manifest.json records when each file was last updated by Scryfall.
Standard library only; needs Python 3.8 or newer.
"""

import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MANIFEST = os.path.join(DATA, "manifest.json")
API = "https://api.scryfall.com/bulk-data"
# Scryfall asks every client to send a User-Agent and an Accept header.
HEADERS = {"User-Agent": "NickLocalScryfall/1.0", "Accept": "application/json"}


def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_manifest(manifest):
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


def download(url, dest, expected_size=None):
    """Stream url to dest via a .part file, so a cut-off download never
    replaces a good file. Prints progress every ~10%."""
    part = dest + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": HEADERS["User-Agent"]})
    with urllib.request.urlopen(req, timeout=120) as resp, open(part, "wb") as out:
        total = expected_size or int(resp.headers.get("Content-Length") or 0)
        done, next_mark = 0, 0.1
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if total and done / total >= next_mark:
                print(f"    {done / total:4.0%}  ({done / 1e6:,.0f} MB)", flush=True)
                next_mark += 0.1
    if part.endswith(".gz.part"):
        check_gzip(part)  # a cut-off download fails here, before it can replace anything
    os.replace(part, dest)


def check_gzip(path):
    """Read the whole gzip file through once; raises if it's truncated or corrupt."""
    import gzip
    with gzip.open(path, "rb") as f:
        while f.read(8 * 1024 * 1024):
            pass


def main(argv):
    skip = set()
    wanted = []
    args = iter(argv)
    for a in args:
        if a == "--skip":
            skip.add(next(args, ""))
        else:
            wanted.append(a)

    os.makedirs(DATA, exist_ok=True)
    manifest = load_manifest()
    files = get_json(API)["data"]
    known = {f["type"] for f in files}
    for name in wanted + sorted(skip):
        if name not in known:
            sys.exit(f"Unknown file type '{name}'. Scryfall offers: {', '.join(sorted(known))}")

    failed = []
    for f in files:
        kind = f["type"]
        if (wanted and kind not in wanted) or kind in skip:
            continue
        # Scryfall now serves gzipped JSON Lines; fall back to the older plain JSON array.
        url = f.get("jsonl_download_uri") or f.get("download_uri")
        dest = os.path.join(DATA, kind + (".jsonl.gz" if url.endswith(".jsonl.gz") else ".json"))
        if manifest.get(kind, {}).get("updated_at") == f["updated_at"] and os.path.exists(dest):
            print(f"{kind}: already current ({f['updated_at'][:10]})")
            continue
        size = f.get("compressed_size") or f.get("size")
        print(f"{kind}: downloading {size / 1e6:,.0f} MB ...", flush=True)
        start = time.time()
        try:
            download(url, dest, size)
        except Exception as e:  # keep going; one bad file shouldn't stop the rest
            print(f"{kind}: FAILED - {e}")
            failed.append(kind)
            continue
        manifest[kind] = {
            "updated_at": f["updated_at"],
            "file": os.path.basename(dest),
            "source": url,
            "bytes": os.path.getsize(dest),
            "downloaded": time.strftime("%Y-%m-%d %H:%M"),
        }
        save_manifest(manifest)
        print(f"{kind}: done in {time.time() - start:,.0f} s")
        time.sleep(0.2)  # be polite between files

    print("Failed: " + ", ".join(failed) if failed else "All requested files are current.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
