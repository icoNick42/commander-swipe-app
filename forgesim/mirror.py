"""Keep each PC's offline tools in step, with no one at the keyboard.

sync/mirrors.json lists folders in this branch to copy onto a PC:

  {"scryfall-local": {
      "src": "sync/scryfall-local",
      "dest": {"desktop": "D:\\\\Claude\\\\Scryfall Local"},
      "first_run": {"unless": "data/manifest.json",
                    "steps": ["update_scryfall.py", "download_images.py"]}}}

Each round the board copies any file that's missing or different into the
PC's folder. It only adds and updates: it never deletes anything there.
"first_run": if the "unless" file isn't there yet, the board starts the
steps once (Python, in that folder, at low priority, in the background) and
leaves a marker so it doesn't start them again. Their output goes to
first_run.log in that folder.
"""

import filecmp
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = os.path.join(ROOT, "sync", "mirrors.json")
MARKER = ".cs-first-run-started"


def sync(cfg, log):
    try:
        with open(CONF, encoding="utf-8") as fh:
            mirrors = json.load(fh)
    except (OSError, ValueError):
        return
    me = cfg["name"].lower()
    for name, m in mirrors.items():
        if name.startswith("_"):
            continue
        dest = (m.get("dest") or {}).get(me)
        if not dest:
            continue
        src = os.path.join(ROOT, m["src"])
        if not os.path.isdir(src):
            continue
        drive = os.path.splitdrive(dest)[0]
        if drive and not os.path.exists(drive + os.sep):
            log("mirror %s: %s isn't there; skipped" % (name, drive))
            continue
        copied = 0
        for base, _dirs, files in os.walk(src):
            rel = os.path.relpath(base, src)
            out_dir = os.path.normpath(os.path.join(dest, rel))
            for f in files:
                a = os.path.join(base, f)
                b = os.path.join(out_dir, f)
                if os.path.exists(b) and filecmp.cmp(a, b, shallow=False):
                    continue
                os.makedirs(out_dir, exist_ok=True)
                shutil.copyfile(a, b)
                copied += 1
        if copied:
            log("mirror %s: %d file(s) copied to %s" % (name, copied, dest))
        first = m.get("first_run")
        if first and not os.path.exists(os.path.join(dest, first["unless"])):
            marker = os.path.join(dest, MARKER)
            if os.path.exists(marker):
                continue
            with open(marker, "w", encoding="utf-8") as fh:
                fh.write("started by the sims board\n")
            py = sys.executable
            if py.lower().endswith("pythonw.exe"):
                py = py[:-5] + ".exe"  # python.exe, so the steps' output can be logged
            cmd = " && ".join('"%s" -u %s' % (py, step) for step in first["steps"])
            logf = open(os.path.join(dest, "first_run.log"), "a", encoding="utf-8")
            kw = {}
            if os.name == "nt":
                # below normal priority, no window, not tied to the board's life
                kw["creationflags"] = 0x00004000 | 0x08000000 | 0x00000200
            subprocess.Popen(
                cmd,
                shell=True,
                cwd=dest,
                stdout=logf,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                **kw
            )
            log(
                "mirror %s: first run started in %s (%s)"
                % (name, dest, ", ".join(first["steps"]))
            )
