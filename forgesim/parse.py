"""Turn Forge's simulation output into rows of numbers.

Forge's `sim` mode (without -q) prints each game's full log, oldest line
first, then a "Game Result:" line. Log lines look like
    "<Caption>: <message>"
with captions such as Turn, Land, Add To Stack, Damage, Life, Mulligan,
Game Outcome (see forge-game GameLogFormatter and en-US.properties).
Players are named "Ai(<seat>)-<deck Name>", where <deck Name> is the
[metadata] Name= line of the .dck file. The runner sets that to a short
label, so a player name maps straight back to a test deck or opponent.

What the log does NOT show: draws and the cards left in hand. So per-card
stats are "cast", "land played", "activated", "triggered", "discarded";
a card that's never cast across many games is either dead or clunky.

parse_output(text) -> list of game dicts:
  {
    "index": 1, "result": "win" | "draw" | "timeout" | "error",
    "winner": label or None, "duration_ms": int,
    "turns": total turns, "start_seat": seat that took turn 1,
    "players": {label: {...per-player stats...}},
    "cards": {label: {card name: {...per-card counts...}}},
  }
"""

import re

LINE_RE = re.compile(
    r"^(Turn|Phase|Land|Add To Stack|Resolve Stack|Damage|Life|Mulligan|Game Outcome|Match Result|Zone Change|Combat|Mana|Discard|Replacement Effect|Player Control|Information|Ante|Sideboard|Draft): (.*)$"
)
TURN_RE = re.compile(r"^Turn (\d+) \(Ai\((\d+)\)-(.+)\)$")
LAND_RE = re.compile(r"^Ai\((\d+)\)-(.+) played (.+) \((\d+)\)$")
STACK_RE = re.compile(
    r"^Ai\((\d+)\)-(.+?) (cast|triggered|activated) (.+?)(?: targeting .*)?$"
)
LIFE_RE = re.compile(r"^Life: Ai\((\d+)\)-(.+) (-?\d+) > (-?\d+)$")
DMG_PLAYER_RE = re.compile(
    r"^(.+?) \((\d+)\) deals (\d+) (combat|non-combat) damage to Ai\((\d+)\)-(.+?)(?: \(as poison counters\))?\.$"
)
MULL_RE = re.compile(r"^Ai\((\d+)\)-(.+) has mulliganed down to (\d+) cards\.$")
KEEP_RE = re.compile(r"^Ai\((\d+)\)-(.+) has kept a hand of (\d+) cards$")
LOST_RE = re.compile(r"^Ai\((\d+)\)-(.+?) has lost because (.+)$")
WON_RE = re.compile(r"^Ai\((\d+)\)-(.+?) has won because (.+)$")
DISCARD_RE = re.compile(r"^Ai\((\d+)\)-(.+) discards (.+) \((\d+)\)\.$")
RESULT_RE = re.compile(
    r"^Game Result: Game (\d+) ended in (?:(\d+) ms\. (.+) has won!|a Draw! Took (\d+) ms\.)"
)
ATTACK_RE = re.compile(r"^Ai\((\d+)\)-(.+?) assigned (.+) to attack (.+)\.$")
ID_RE = re.compile(r"\((\d+)\)")

# A land drop is "missed" on a player's own turn n (n <= this) with no land played.
LAND_DROP_TURNS = 7


def _new_player(seat):
    return {
        "seat": seat,
        "won": 0,
        "lost_reason": "",
        "death_turn": None,  # game turn (all players counted) when life hit 0 or less
        "own_turns": 0,
        "mulligans": 0,
        "kept": None,
        "lands_t3": None,
        "lands_t5": None,
        "lands_t7": None,
        "missed_drops": 0,  # own turns 1..7 with no land
        "spells_cast": 0,
        "cmd_casts": 0,
        "cmd_first_turn": None,  # own turn number of the first commander cast
        "dmg_to_players": 0,
        "cmd_damage": 0,
        "life_end": None,
    }


def _new_card():
    return {
        "cast": 0,
        "first_cast_turn": None,
        "land": 0,
        "activated": 0,
        "triggered": 0,
        "discarded": 0,
    }


class _Game:
    def __init__(self, index, commanders):
        self.index = index
        self.commanders = commanders  # label -> set of commander names
        self.players = {}
        self.cards = {}
        self.turn = 0
        self.turn_owner = None
        self.own_turn = {}
        self.lands_this_turn = {}
        self.lands_total = {}
        self.start_seat = None
        self.winner = None
        self.timeout = False
        self.lines = 0
        self.id_owner = {}  # card id -> label, learned from lands and attacks

    def p(self, seat, label):
        label = label.strip()
        if label not in self.players:
            self.players[label] = _new_player(int(seat))
            self.cards[label] = {}
            self.lands_total[label] = 0
            self.own_turn[label] = 0
        return self.players[label]

    def card(self, label, name):
        c = self.cards[label].get(name)
        if c is None:
            c = self.cards[label][name] = _new_card()
        return c

    def end_turn(self):
        """Book-keeping for the player whose turn just finished."""
        lab = self.turn_owner
        if lab is None:
            return
        n = self.own_turn[lab]
        pl = self.players[lab]
        if n <= LAND_DROP_TURNS and self.lands_this_turn.get(lab, 0) == 0:
            pl["missed_drops"] += 1
        for t in (3, 5, 7):
            if n == t:
                pl["lands_t%d" % t] = self.lands_total[lab]

    def line(self, cap, msg):
        self.lines += 1
        if cap == "Turn":
            m = TURN_RE.match(msg)
            if not m:
                return
            self.end_turn()
            self.turn = int(m.group(1))
            seat, lab = m.group(2), m.group(3)
            self.p(seat, lab)
            if self.start_seat is None:
                self.start_seat = int(seat)
            self.turn_owner = lab.strip()
            self.own_turn[self.turn_owner] += 1
            self.players[self.turn_owner]["own_turns"] = self.own_turn[self.turn_owner]
            self.lands_this_turn[self.turn_owner] = 0
        elif cap == "Land":
            m = LAND_RE.match(msg)
            if m:
                lab = m.group(2).strip()
                self.p(m.group(1), lab)
                self.lands_total[lab] += 1
                self.lands_this_turn[lab] = self.lands_this_turn.get(lab, 0) + 1
                self.card(lab, m.group(3))["land"] += 1
                self.id_owner[m.group(4)] = lab
        elif cap == "Add To Stack":
            m = STACK_RE.match(msg)
            if m:
                lab = m.group(2).strip()
                pl = self.p(m.group(1), lab)
                kind, name = m.group(3), m.group(4).strip()
                c = self.card(lab, name)
                if kind == "cast":
                    c["cast"] += 1
                    pl["spells_cast"] += 1
                    own = self.own_turn.get(lab, 0)
                    if c["first_cast_turn"] is None:
                        c["first_cast_turn"] = own
                    if name in self.commanders.get(lab, ()):
                        pl["cmd_casts"] += 1
                        if pl["cmd_first_turn"] is None:
                            pl["cmd_first_turn"] = own
                else:
                    c[kind] += 1
        elif cap == "Life":
            m = LIFE_RE.match("Life: " + msg)
            if m:
                lab = m.group(2).strip()
                pl = self.p(m.group(1), lab)
                new = int(m.group(4))
                pl["life_end"] = new
                if new <= 0 and pl["death_turn"] is None:
                    pl["death_turn"] = self.turn
        elif cap == "Damage":
            for part in msg.split("\n"):
                m = DMG_PLAYER_RE.match(part.strip())
                if not m:
                    continue
                src, amount, tlab = (
                    m.group(1).strip(),
                    int(m.group(3)),
                    m.group(6).strip(),
                )
                # Credit the damage to the source's controller: we only know it if the
                # source is a card that player cast or a commander; good enough for
                # commander damage, which is what matters most.
                for lab, names in self.commanders.items():
                    if src in names and lab != tlab and lab in self.players:
                        self.players[lab]["cmd_damage"] += amount
                owner = self.id_owner.get(m.group(2)) or self._owner_of(src)
                if owner and owner != tlab:
                    self.players[owner]["dmg_to_players"] += amount
        elif cap == "Mulligan":
            m = MULL_RE.match(msg)
            if m:
                pl = self.p(m.group(1), m.group(2))
                if int(m.group(3)) < 7:
                    pl["mulligans"] += 1
            else:
                m = KEEP_RE.match(msg)
                if m:
                    self.p(m.group(1), m.group(2))["kept"] = int(m.group(3))
        elif cap == "Game Outcome":
            m = LOST_RE.match(msg)
            if m:
                pl = self.p(m.group(1), m.group(2))
                pl["lost_reason"] = m.group(3).strip()
                if pl["death_turn"] is None:
                    pl["death_turn"] = self.turn
                return
            m = WON_RE.match(msg)
            if m:
                lab = m.group(2).strip()
                self.p(m.group(1), lab)["won"] = 1
                self.winner = lab
        elif cap == "Combat":
            for part in msg.split("\n"):
                m = ATTACK_RE.match(part.strip())
                if m:
                    lab = m.group(2).strip()
                    self.p(m.group(1), lab)
                    for cid in ID_RE.findall(m.group(3)):
                        self.id_owner[cid] = lab
        elif cap == "Discard":
            m = DISCARD_RE.match(msg)
            if m:
                lab = m.group(2).strip()
                self.p(m.group(1), lab)
                self.card(lab, m.group(3))["discarded"] += 1

    def _owner_of(self, src):
        for lab, cards in self.cards.items():
            if src in cards:
                return lab
        for lab, names in self.commanders.items():
            if src in names:
                return lab
        return None

    def finish(self, result, duration, named_winner=None):
        self.end_turn()
        if result == "win" and self.winner is None and named_winner:
            # no "has won because" line: take the winner from "Game Result"
            m = re.match(r"^Ai\(\d+\)-(.+)$", named_winner.strip())
            self.winner = m.group(1).strip() if m else None
        if result == "win" and self.winner is None:
            result = "error"
        for lab, pl in self.players.items():
            pl["won"] = 1 if lab == self.winner else 0
        return {
            "index": self.index,
            "result": result,
            "winner": self.winner,
            "duration_ms": duration,
            "turns": self.turn,
            "start_seat": self.start_seat,
            "log_lines": self.lines,
            "players": self.players,
            "cards": self.cards,
        }


def parse_output(text, commanders=None):
    """Parse one Forge `sim` run's stdout (any number of games).

    commanders: {player label: [commander names]} so commander casts and
    commander damage can be counted. Labels are the deck Name= values.
    """
    commanders = {k: set(v) for k, v in (commanders or {}).items()}
    games = []
    g = None
    timeout = False
    for raw in text.splitlines():
        line = raw.rstrip("\r")
        if line.startswith("Stopping slow match as draw"):
            timeout = True
            continue
        m = RESULT_RE.match(line)
        if m:
            if g is None:
                g = _Game(int(m.group(1)), commanders)
            if m.group(2) is not None:
                res = g.finish("win", int(m.group(2)), m.group(3))
            else:
                res = g.finish("timeout" if timeout else "draw", int(m.group(4)))
                res["winner"] = None
                for pl in res["players"].values():
                    pl["won"] = 0
            res["index"] = int(m.group(1))
            games.append(res)
            g = None
            timeout = False
            continue
        m = LINE_RE.match(line)
        if not m:
            continue
        cap, msg = m.group(1), m.group(2)
        if g is None:
            if cap in ("Mulligan", "Turn"):
                g = _Game(len(games) + 1, commanders)
            else:
                continue
        # The "Life" caption's own message starts with "Life: " again.
        if cap == "Life" and msg.startswith("Life: "):
            msg = msg[6:]
        g.line(cap, msg)
    return games
