"""Read a job's results and write report.md + summary.json.

python -m forgesim.analyze <job.json>       (writes into results/<job>/)

What's in the report:
  * Each test deck: games, win rate with a 95% range (Wilson interval),
    draws/timeouts, and lower-noise stats: mulligans, missed land drops,
    lands by turn 5, "screw" (3 or fewer lands on turn 5), turn the
    commander first came down, damage dealt, how long the deck lived.
  * Each deck against the first (the baseline): the difference in win
    rate with a 95% range. If the range includes 0, the sims can't tell
    the two apart yet.
  * Per card, for the baseline and every variant: how often it was cast,
    when, and the deck's win rate in games where it was cast vs. not
    (17lands-style). Cards Forge flags as hard for its AI are marked.
  * Swapped cards: for variants, the cards that went in and came out.
  * A short "check by hand" list for Manafold or Forge GUI games.
"""

import glob
import json
import math
import os
import sys
import time

from . import decks as D
from . import runner as R

Z = 1.96


def wilson(wins, n):
    if n == 0:
        return (0.0, 0.0, 0.0)
    p = wins / n
    d = 1 + Z * Z / n
    c = (p + Z * Z / (2 * n)) / d
    h = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / d
    return (p, max(0.0, c - h), min(1.0, c + h))


def diff_ci(w1, n1, w2, n2):
    """Difference p2 - p1 with a normal-approximation 95% range."""
    if not n1 or not n2:
        return (0.0, 0.0, 0.0)
    p1, p2 = w1 / n1, w2 / n2
    se = math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)
    return (p2 - p1, p2 - p1 - Z * se, p2 - p1 + Z * se)


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def load_results(root, job):
    out = []
    for path in sorted(
        glob.glob(os.path.join(root, "results", R.slug(job["id"]), "*.json"))
    ):
        if path.endswith("summary.json"):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                out.append(json.load(fh))
        except (OSError, ValueError):
            pass
    return out


def summarize(root, job):
    results = load_results(root, job)
    decks = {}
    for label in job["tests"]:
        decks[label] = {
            "games": 0,
            "wins": 0,
            "draws": 0,
            "timeouts": 0,
            "rows": [],
            "cards": {},
        }
    for res in results:
        t = res["test"]
        if t not in decks:
            continue
        d = decks[t]
        for g in res["games"]:
            pl = g["players"].get(t)
            if pl is None:
                continue
            d["games"] += 1
            if g["result"] == "timeout":
                d["timeouts"] += 1
            elif g["result"] == "draw":
                d["draws"] += 1
            won = 1 if g.get("winner") == t else 0
            d["wins"] += won
            d.setdefault("by_key", {})[(res["index"], g["index"])] = won
            row = dict(pl)
            row["won"] = won
            row["game_turns"] = g["turns"]
            d["rows"].append(row)
            for name, c in g["cards"].get(t, {}).items():
                cs = d["cards"].setdefault(
                    name,
                    {
                        "cast_games": 0,
                        "cast_wins": 0,
                        "casts": 0,
                        "first": [],
                        "land_games": 0,
                        "land_wins": 0,
                        "engine": 0,
                    },
                )
                if c["cast"]:
                    cs["cast_games"] += 1
                    cs["cast_wins"] += won
                    cs["casts"] += c["cast"]
                    cs["first"].append(c["first_cast_turn"])
                if c["land"]:
                    cs["land_games"] += 1
                    cs["land_wins"] += won
                cs["engine"] += c["activated"] + c["triggered"]
    summary = {
        "job": job["id"],
        "note": job.get("note", ""),
        "made": time.strftime("%Y-%m-%d %H:%M"),
        "batches_in": len(results),
        "batches_total": len(R.batches(job, root)),
        "decks": {},
    }
    for label, d in decks.items():
        rows = d["rows"]
        n = d["games"]
        p, lo, hi = wilson(d["wins"], n)
        stats = {
            "games": n,
            "wins": d["wins"],
            "win_rate": p,
            "win_lo": lo,
            "win_hi": hi,
            "draws": d["draws"],
            "timeouts": d["timeouts"],
            "mulligan_rate": mean([1 if r["mulligans"] else 0 for r in rows]),
            "missed_drops": mean([r["missed_drops"] for r in rows]),
            "lands_t5": mean([r["lands_t5"] for r in rows]),
            "screw_rate": mean(
                [
                    1 if (r["lands_t5"] is not None and r["lands_t5"] <= 3) else 0
                    for r in rows
                    if r["lands_t5"] is not None
                ]
            ),
            "cmd_first_turn": mean([r["cmd_first_turn"] for r in rows]),
            "cmd_never": mean([1 if r["cmd_first_turn"] is None else 0 for r in rows]),
            "spells_cast": mean([r["spells_cast"] for r in rows]),
            "dmg_to_players": mean([r["dmg_to_players"] for r in rows]),
            "cmd_damage": mean([r["cmd_damage"] for r in rows]),
            "own_turns": mean([r["own_turns"] for r in rows]),
            "died_rate": mean([1 if r["lost_reason"] else 0 for r in rows]),
        }
        # per card: deck's win rate when the card was cast vs. games it wasn't
        deck_path = os.path.join(root, R.test_path(job, label))
        cards = []
        flags = D.forge_cards()
        try:
            _n, cmdrs, main = D.read_dck(deck_path)
            names = [nm for _, nm in cmdrs + main]
        except OSError:
            names = list(d["cards"])
        for nm in names:
            cs = d["cards"].get(
                nm,
                {
                    "cast_games": 0,
                    "cast_wins": 0,
                    "casts": 0,
                    "first": [],
                    "land_games": 0,
                    "land_wins": 0,
                    "engine": 0,
                },
            )
            used = cs["cast_games"] or cs["land_games"]
            used_wins = cs["cast_wins"] if cs["cast_games"] else cs["land_wins"]
            not_games = n - used
            not_wins = d["wins"] - used_wins
            info = flags.get(D.name_key(nm))
            cards.append(
                {
                    "card": nm,
                    "used_rate": used / n if n else 0,
                    "wr_used": used_wins / used if used else None,
                    "wr_not": not_wins / not_games if not_games > 0 else None,
                    "first_turn": mean(cs["first"]),
                    "engine_per_game": cs["engine"] / n if n else 0,
                    "ai_flag": info[1] if info else "missing",
                }
            )
        stats["cards"] = cards
        summary["decks"][label] = stats
    # differences vs. the baseline
    labels = list(job["tests"])
    if labels:
        base = summary["decks"][labels[0]]
        for lab in labels[1:]:
            s = summary["decks"][lab]
            dd, lo, hi = diff_ci(base["wins"], base["games"], s["wins"], s["games"])
            s["vs_base"] = {"diff": dd, "lo": lo, "hi": hi, "pairs": 0}
            if job.get("paired", True):
                # Same seeds, so compare game by game: the spread of the
                # per-game differences is much smaller than two separate rates'.
                bk = decks[labels[0]].get("by_key", {})
                vk = decks[lab].get("by_key", {})
                keys = [k for k in bk if k in vk]
                if len(keys) >= 10:
                    diffs = [vk[k] - bk[k] for k in keys]
                    m = sum(diffs) / len(diffs)
                    var = sum((x - m) ** 2 for x in diffs) / (len(diffs) - 1)
                    se = math.sqrt(var / len(diffs))
                    s["vs_base"] = {
                        "diff": m, "lo": m - Z * se, "hi": m + Z * se, "pairs": len(keys),
                        "same_result": sum(1 for x in diffs if x == 0) / len(diffs),
                    }
    # swaps between baseline and each variant
    try:
        base_names = set(
            D.name_key(nm)
            for _, nm in D.read_dck(os.path.join(root, R.test_path(job, labels[0])))[2]
        )
        for lab in labels[1:]:
            v = D.read_dck(os.path.join(root, R.test_path(job, lab)))[2]
            vk = {D.name_key(nm): nm for _, nm in v}
            b = {
                D.name_key(nm): nm
                for _, nm in D.read_dck(os.path.join(root, R.test_path(job, labels[0])))[2]
            }
            summary["decks"][lab]["swaps"] = {
                "in": sorted(vk[k] for k in vk if k not in base_names),
                "out": sorted(b[k] for k in b if k not in vk),
            }
    except (OSError, IndexError, KeyError):
        pass
    return summary


def pct(x):
    return "-" if x is None else "%d%%" % round(100 * x)


def num(x, digits=1):
    return "-" if x is None else ("%." + str(digits) + "f") % x


def report_md(summary, job):
    L = []
    L.append("# Sim report: %s" % job["id"])
    L.append("")
    if job.get("note"):
        L.append(job["note"])
        L.append("")
    L.append(
        "Made %s. %d of %d batches in. Forge AI pilots every deck; read the numbers as "
        '"played by a mediocre bot": best for mana, curve and version-vs-version tests.'
        % (summary["made"], summary["batches_in"], summary["batches_total"])
    )
    L.append("")
    L.append("## Decks")
    L.append("")
    L.append(
        "| Deck | Games | Win rate (95% range) | vs. baseline | Mulligan | Missed land drops | Lands t5 | Screw | Cmdr turn | Cmdr never | Damage dealt |"
    )
    L.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for lab, s in summary["decks"].items():
        vb = s.get("vs_base")
        vbs = (
            "baseline"
            if vb is None
            else "%+d pts (%+d to %+d)"
            % (round(100 * vb["diff"]), round(100 * vb["lo"]), round(100 * vb["hi"]))
        )
        L.append(
            "| %s | %d | %s (%s-%s) | %s | %s | %s | %s | %s | %s | %s | %s |"
            % (
                lab,
                s["games"],
                pct(s["win_rate"]),
                pct(s["win_lo"]),
                pct(s["win_hi"]),
                vbs,
                pct(s["mulligan_rate"]),
                num(s["missed_drops"]),
                num(s["lands_t5"]),
                pct(s["screw_rate"]),
                num(s["cmd_first_turn"]),
                pct(s["cmd_never"]),
                num(s["dmg_to_players"], 0),
            )
        )
    L.append("")
    L.append(
        "A difference whose range includes 0 isn't one the sims can see yet. Draws and timeouts count as games not won. "
        "Paired jobs compare game by game (same seeds, opponents and seats)."
    )
    L.append("")
    for lab, s in summary["decks"].items():
        sw = s.get("swaps")
        if sw and (sw["in"] or sw["out"]):
            L.append("## %s: the swapped cards" % lab)
            L.append("")
            by = {c["card"]: c for c in s["cards"]}
            L.append(
                "| In | Used | Win rate when used | when not | First turn | AI flag |"
            )
            L.append("|---|---|---|---|---|---|")
            for nm in sw["in"]:
                c = by.get(nm, {})
                L.append(
                    "| %s | %s | %s | %s | %s | %s |"
                    % (
                        nm,
                        pct(c.get("used_rate")),
                        pct(c.get("wr_used")),
                        pct(c.get("wr_not")),
                        num(c.get("first_turn")),
                        c.get("ai_flag", ""),
                    )
                )
            L.append("")
            L.append("Out: " + (", ".join(sw["out"]) or "none"))
            L.append("")
    for lab, s in summary["decks"].items():
        n = s["games"]
        if not n:
            continue
        cards = [c for c in s["cards"] if not D.name_key(c["card"]) in D.BASICS]
        L.append("## %s: cards" % lab)
        L.append("")
        L.append(
            "Sorted by the gap between the deck's win rate with the card used and without. "
            "Small samples swing a lot; finishers look good because they're cast when already winning."
        )
        L.append("")
        L.append("| Card | Used | WR used | WR not | Gap | First turn | AI flag |")
        L.append("|---|---|---|---|---|---|---|")

        def gap(c):
            if c["wr_used"] is None or c["wr_not"] is None:
                return -9
            return c["wr_used"] - c["wr_not"]

        for c in sorted(cards, key=gap, reverse=True):
            g = gap(c)
            L.append(
                "| %s | %s | %s | %s | %s | %s | %s |"
                % (
                    c["card"],
                    pct(c["used_rate"]),
                    pct(c["wr_used"]),
                    pct(c["wr_not"]),
                    "-" if g == -9 else "%+d" % round(100 * g),
                    num(c["first_turn"]),
                    c["ai_flag"],
                )
            )
        never = [c["card"] for c in cards if c["used_rate"] == 0]
        if never:
            L.append("")
            L.append("Never cast or played: " + ", ".join(never))
        L.append("")
    L.append("## Check by hand (Manafold or the Forge window)")
    L.append("")
    L.append(
        "Bots can be wrong about a card. Before acting on a finding, play or watch a few games and check:"
    )
    for lab, s in summary["decks"].items():
        weak = [c["card"] for c in s["cards"] if c["ai_flag"] in ("all", "random")]
        never = [
            c["card"]
            for c in s["cards"]
            if s["games"]
            and c["used_rate"] < 0.1
            and not D.name_key(c["card"]) in D.BASICS
        ]
        if weak:
            L.append(
                "- %s: Forge's AI is flagged as weak with %s. A person would play these better."
                % (lab, ", ".join(weak[:12]))
            )
        if never:
            L.append(
                "- %s: rarely or never used by the bot: %s. Clunky, or just misplayed?"
                % (lab, ", ".join(never[:12]))
            )
    L.append(
        "- Record hand-played games in results/<job>/manual.csv (columns: date, platform, deck, seat, won, turns, notes)."
    )
    L.append("")
    return "\n".join(L)


def write_report(root, job):
    summary = summarize(root, job)
    outdir = os.path.join(root, "results", R.slug(job["id"]))
    os.makedirs(outdir, exist_ok=True)
    slim = json.loads(json.dumps(summary))
    for s in slim["decks"].values():
        # summary.json keeps cards that were used (up to 200); report.md has them all
        s["cards"] = [c for c in s["cards"] if c["used_rate"] > 0][:200]
    with open(
        os.path.join(outdir, "summary.json"), "w", encoding="utf-8", newline="\n"
    ) as fh:
        json.dump(slim, fh, indent=1)
    with open(
        os.path.join(outdir, "report.md"), "w", encoding="utf-8", newline="\n"
    ) as fh:
        fh.write(report_md(summary, job))
    return summary


def main(argv):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for p in argv[1:]:
        job = R.load_job(p)
        s = write_report(root, job)
        for lab, d in s["decks"].items():
            print(
                "%-24s games %4d  win %s (%s-%s)"
                % (
                    lab,
                    d["games"],
                    pct(d["win_rate"]),
                    pct(d["win_lo"]),
                    pct(d["win_hi"]),
                )
            )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
