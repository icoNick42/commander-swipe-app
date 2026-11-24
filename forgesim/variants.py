"""Build "app variant" decks on the PC, with no one watching.

A job test can be a recipe instead of a deck file:
    "zurgo-app5": {"base": "decks/nick/zurgo.dck",
                   "export": "decks/nick/zurgo.txt",
                   "app_swaps": 5}
The board runs the app's own logic (core.js from the app's main branch,
via tools/app_swaps.js) on the export, takes its top picks and paired cuts,
and writes the variant to decks/variants/<job>/<label>.dck plus the swaps
it used (<label>.swaps.json) so the report can name them. Only the job's
first machine builds; the others wait for the file to arrive by git.
"""

import json
import os
import subprocess

from . import decks as D
from . import runner as R

APP_FILES = ["core.js", "data/card_tags.json"]


def fetch_app(root, dest):
    """Copy core.js and its data from the app's main branch (same repo)."""
    kw = {"creationflags": 0x08000000} if os.name == "nt" else {}
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="Never")
    f = subprocess.run(
        ["git", "-C", root, "fetch", "-q", "--depth", "1", "origin", "main"],
        capture_output=True, stdin=subprocess.DEVNULL, env=env, timeout=300, **kw
    )
    if f.returncode != 0:
        raise RuntimeError("couldn't fetch the app's main branch: %s" % f.stderr.decode("utf-8", "replace")[-300:])
    os.makedirs(os.path.join(dest, "data"), exist_ok=True)
    os.makedirs(os.path.join(dest, "combos"), exist_ok=True)
    for f in APP_FILES:
        p = subprocess.run(
            ["git", "-C", root, "show", "FETCH_HEAD:" + f], capture_output=True, **kw
        )
        if p.returncode != 0:
            raise RuntimeError("couldn't read %s from the app's main branch" % f)
        with open(os.path.join(dest, f), "wb") as fh:
            fh.write(p.stdout)
    p = subprocess.run(
        ["git", "-C", root, "ls-tree", "-z", "--name-only", "FETCH_HEAD", "combos/"],
        capture_output=True,
        **kw
    )
    for f in [x for x in p.stdout.decode("utf-8", "replace").split("\0") if x]:
        q = subprocess.run(
            ["git", "-C", root, "show", "FETCH_HEAD:" + f], capture_output=True, **kw
        )
        if q.returncode == 0:
            with open(os.path.join(dest, f), "wb") as fh:
                fh.write(q.stdout)
    rev = subprocess.run(
        ["git", "-C", root, "rev-parse", "--short", "FETCH_HEAD"],
        capture_output=True,
        text=True,
        **kw
    )
    return rev.stdout.strip()


def build(job, label, root, cfg, log=print):
    recipe = job["tests"][label]
    out = os.path.join(root, R.test_path(job, label))
    if os.path.exists(out):
        return out
    app = os.path.join(cfg["work_dir"], "app")
    rev = fetch_app(root, app)
    swaps = out[:-4] + ".swaps.json"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cmd = [
        cfg.get("node", "node"),
        os.path.join(root, "tools", "app_swaps.js"),
        os.path.join(app, "core.js"),
        os.path.join(root, recipe["export"]),
        swaps,
        "--n",
        str(recipe.get("app_swaps", 5)),
        "--name",
        label,
    ]
    if recipe.get("picks"):
        cmd += ["--picks", recipe["picks"]]
    if recipe.get("edhrec"):
        cmd += ["--edhrec", os.path.join(root, recipe["edhrec"])]
    kw = {"creationflags": 0x08000000} if os.name == "nt" else {}
    p = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace",
                       stdin=subprocess.DEVNULL, timeout=900, **kw)
    if p.returncode != 0:
        raise RuntimeError("app_swaps failed: " + (p.stderr or p.stdout)[-500:])
    with open(swaps, encoding="utf-8") as fh:
        sw = json.load(fh)
    sw["app_rev"] = rev
    with open(swaps, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(sw, fh, indent=1)
    _name, commanders, main = D.read_dck(os.path.join(root, recipe["base"]))
    main2, not_found = D.apply_swaps(main, sw["out"], sw["in"])
    D.write_dck(out, label, commanders, main2)
    # the same list as plain text, ready to paste into Manafold or Moxfield
    with open(out[:-4] + ".txt", "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join("%d %s" % (q, n) for q, n in commanders + main2) + "\n")
    log(
        "built %s (app %s, %s): in %s / out %s%s"
        % (
            label,
            rev,
            sw.get("source", ""),
            ", ".join(sw["in"]),
            ", ".join(sw["out"]),
            (" (not in deck: %s)" % ", ".join(not_found)) if not_found else "",
        )
    )
    return out


def prepare(job, root, cfg, log=print):
    """Build this job's missing variants if this machine is the builder.
    Returns True when every test deck exists."""
    first = (job["machines"] or ["any"])[0].lower()
    ready = True
    for label, t in job["tests"].items():
        if isinstance(t, str):
            continue
        path = os.path.join(root, R.test_path(job, label))
        if os.path.exists(path):
            continue
        if first in (cfg["name"], "any"):
            try:
                build(job, label, root, cfg, log)
                continue
            except Exception as e:
                log("variant %s/%s not built: %s" % (job["id"], label, e))
        ready = False
    return ready
