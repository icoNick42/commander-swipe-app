"""
download_images.py - save card images to this PC so the search page works offline.

Downloads one image per unique card (the printing Scryfall's oracle_cards file
picks), plus the back face of double-faced cards. Run update_scryfall.py first.

    python download_images.py               # normal size (488 x 680), ~3-4 GB
    python download_images.py --size large  # 672 x 936, roughly twice the space

Images go to images/<size>/<card id>.jpg (back faces: <card id>-back.jpg).
It's safe to stop (Ctrl+C) and run again: files already saved are skipped.
Running it after a data refresh fetches only new cards and upgraded scans.
Scryfall's image rules: show images whole; don't crop or cover the artist
and copyright line.
"""

import gzip
import json
import os
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ORACLE = os.path.join(HERE, "data", "oracle_cards.jsonl.gz")
UA = {"User-Agent": "NickLocalScryfall/1.0"}
WORKERS = 4  # parallel downloads; modest on purpose
SKIP_LAYOUTS = {"art_series"}  # art cards aren't searchable cards


def wanted_images(size):
    """Yield (filename, url, image_status) for every image we should have."""
    with gzip.open(ORACLE, "rt", encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            if c.get("layout") in SKIP_LAYOUTS:
                continue
            status = c.get("image_status", "")
            if "image_uris" in c:
                yield c["id"] + ".jpg", c["image_uris"].get(size), status
            elif c.get("card_faces"):
                faces = [fc for fc in c["card_faces"] if "image_uris" in fc]
                for i, fc in enumerate(faces[:2]):
                    name = c["id"] + ("-back.jpg" if i else ".jpg")
                    yield name, fc["image_uris"].get(size), status


def fetch(url, dest):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(dest + ".part", "wb") as out:
                out.write(data)
            os.replace(dest + ".part", dest)
            return True
        except Exception:
            time.sleep(2 * (attempt + 1))
    return False


def main(argv):
    size = argv[argv.index("--size") + 1] if "--size" in argv else "normal"
    if size not in ("small", "normal", "large", "png"):
        sys.exit("--size must be small, normal, large or png")
    folder = os.path.join(HERE, "images", size)
    os.makedirs(folder, exist_ok=True)
    index_path = os.path.join(folder, "index.json")
    # index.json remembers each file's scan quality, so a low-res placeholder
    # gets replaced once Scryfall has a proper scan.
    index = json.load(open(index_path, encoding="utf-8")) if os.path.exists(index_path) else {}

    todo = []
    for name, url, status in wanted_images(size):
        dest = os.path.join(folder, name)
        if url and not (os.path.exists(dest) and index.get(name) == status):
            todo.append((name, url, status, dest))
    print(f"{len(todo):,} images to download into images/{size}", flush=True)

    lock = threading.Lock()
    counts = {"done": 0, "failed": 0}
    start = time.time()

    def work(item):
        name, url, status, dest = item
        ok = fetch(url, dest)
        with lock:
            counts["done" if ok else "failed"] += 1
            if ok:
                index[name] = status
            n = counts["done"] + counts["failed"]
            if n % 500 == 0 or n == len(todo):
                json.dump(index, open(index_path, "w", encoding="utf-8"))
                rate = n / max(time.time() - start, 1)
                left = (len(todo) - n) / max(rate, 0.1) / 60
                print(f"  {n:,}/{len(todo):,}  ({rate:.0f}/s, ~{left:.0f} min left)", flush=True)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(work, todo))
    json.dump(index, open(index_path, "w", encoding="utf-8"))
    print(f"Done: {counts['done']:,} saved, {counts['failed']:,} failed (run again to retry).")


if __name__ == "__main__":
    main(sys.argv[1:])
