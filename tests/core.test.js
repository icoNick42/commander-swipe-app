// Tests for core.js. Run from the app folder: node tests/core.test.js
// Uses only Node's built-in test runner (Node 18+); no packages.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CS = require("../core.js");

const FIX = path.join(__dirname, "fixtures");
const read = (f) => fs.readFileSync(path.join(FIX, f), "utf8");
const exportText = read("zurgo_export.txt");
// edhrec_zurgo.json is a full copy of an EDHREC page, so it's kept out of the
// public repo (.gitignore). Tests that need it are skipped when it's missing.
const EDHREC_FILE = path.join(FIX, "edhrec_zurgo.json");
const edhrec = fs.existsSync(EDHREC_FILE)
  ? JSON.parse(fs.readFileSync(EDHREC_FILE, "utf8"))
  : null;
const needsEdhrec = {
  skip: edhrec ? false : "needs tests/fixtures/edhrec_zurgo.json (not in the public repo)",
};
const deckScry = JSON.parse(read("scryfall_deck.json"));
const recScry = JSON.parse(read("scryfall_recs.json"));
const removalSearch = JSON.parse(read("scryfall_search_removal.json"));

const parsed = CS.parseExport(exportText);
const deckNames = CS.deckNameSet(parsed.cards);
const matched = CS.matchCollection(parsed.cards, deckScry.data);

// A small in-memory stand-in for localStorage.
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    keys: () => [...m.keys()],
    raw: m,
  };
}

// ------------------------------------------------------------- the done-test

test("done-test: export reads 97 lines with none left over", () => {
  assert.equal(parsed.cards.length, 97);
  assert.equal(parsed.unread.length, 0);
  assert.equal(
    parsed.cards.reduce((s, c) => s + c.qty, 0),
    100,
  );
});

test("done-test: commander is Zurgo, slug zurgo-stormrender", () => {
  const cands = CS.commanderCandidates(matched);
  assert.equal(cands[0].name, "Zurgo Stormrender");
  assert.deepEqual(cands[0].colorIdentity.slice().sort(), ["B", "R", "W"]);
  assert.equal(CS.commanderSlug(cands[0].name), "zurgo-stormrender");
  assert.equal(
    CS.edhrecUrl(cands[0].name),
    "https://json.edhrec.com/pages/commanders/zurgo-stormrender.json",
  );
});

test("done-test: no deck card and no basic land in any pile", needsEdhrec, () => {
  const piles = CS.buildEdhrecPiles(edhrec, deckNames);
  const edMap = CS.edhrecById(edhrec);
  piles.push(
    CS.buildRolePile(CS.ROLES[0], removalSearch.data, edMap, deckNames),
  );
  assert.ok(piles.length >= 6);
  for (const p of piles) {
    for (const c of p.cards) {
      assert.ok(
        !deckNames[CS.nameKey(c.name)],
        `${c.name} is in the deck but showed up in ${p.key}`,
      );
      assert.ok(!CS.isBasicLand(c.name), `${c.name} is a basic land`);
    }
  }
  // The sample is a real test of this: EDHREC recommends cards the deck already runs.
  const raw = CS.edhrecLists(edhrec).flatMap((cl) => cl.cardviews);
  assert.ok(
    raw.some((cv) => deckNames[CS.nameKey(cv.name)]),
    "fixture should contain deck cards to remove",
  );
});

test('done-test: copy-out text is one "1 Card Name" per line, nothing else', () => {
  let s = CS.newDeckState("Zurgo Stormrender");
  s = CS.decide(s, "a", "add");
  s = CS.decide(s, "b", "maybe");
  s = CS.decide(s, "c", "add");
  const names = {
    a: "Swords to Plowshares",
    b: "Skullclamp",
    c: "Wear // Tear",
  };
  const text = CS.copyOutText(CS.idsWith(s, "add").map((id) => names[id]));
  assert.equal(text, "1 Swords to Plowshares\n1 Wear // Tear");
  assert.match(text, /^(1 [^\n]+)(\n1 [^\n]+)*$/);
});

// ------------------------------------------------------------- reading exports

test("export: set, number and markers", () => {
  const first = parsed.cards[0];
  assert.deepEqual(
    { qty: first.qty, name: first.name, set: first.set, number: first.number },
    { qty: 1, name: "Zurgo Stormrender", set: "tdc", number: "10" },
  );
  const anim = parsed.cards.find((c) => c.name.startsWith("Anim Pakal"));
  assert.equal(anim.name, "Anim Pakal, Thousandth Moon"); // *F* removed
  assert.equal(anim.number, "300");
});

test("export: Moxfield single-slash double-faced names", () => {
  const seph = parsed.cards.find((c) => c.name.startsWith("Sephiroth"));
  assert.equal(
    seph.name,
    "Sephiroth, Fabled SOLDIER / Sephiroth, One-Winged Angel",
  );
  assert.equal(CS.frontName(seph.name), "Sephiroth, Fabled SOLDIER");
  assert.equal(CS.nameKey("Indulge / Excess"), CS.nameKey("Indulge // Excess"));
});

test("export: headers, comments, blanks, names only, and junk", () => {
  const text = [
    "\uFEFFCommander",
    "1 Zurgo Stormrender",
    "",
    "// a comment",
    "SIDEBOARD:",
    "1x Sol Ring",
    "2 Plains (THB) 250 *F* *E*",
    "  1 Lightning Bolt (2X2) 117  ",
    "this is not a card",
    "Deck",
  ].join("\r\n");
  const r = CS.parseExport(text);
  assert.deepEqual(
    r.cards.map((c) => [c.qty, c.name, c.set, c.number]),
    [
      [1, "Zurgo Stormrender", null, null],
      [1, "Sol Ring", null, null],
      [2, "Plains", "thb", "250"],
      [1, "Lightning Bolt", "2x2", "117"],
    ],
  );
  assert.deepEqual(r.unread, [{ lineNo: 9, text: "this is not a card" }]);
  assert.deepEqual(CS.parseExport("").cards, []);
  assert.deepEqual(CS.parseExport(null).unread, []);
});

// ------------------------------------------------------------- names and slugs

test("slug matches EDHREC for every single-faced card in the sample", needsEdhrec, () => {
  let checked = 0;
  for (const cl of CS.edhrecLists(edhrec)) {
    for (const cv of cl.cardviews) {
      if (cv.name.includes("//")) continue; // split cards keep both halves on EDHREC
      assert.equal(CS.commanderSlug(cv.name), cv.sanitized, cv.name);
      checked++;
    }
  }
  assert.ok(checked > 200);
});

test("slug: accents, apostrophes, double-faced commanders", () => {
  assert.equal(
    CS.commanderSlug("Lim-Dûl the Necromancer"),
    "lim-dul-the-necromancer",
  );
  assert.equal(
    CS.commanderSlug("Caesar, Legion's Emperor"),
    "caesar-legions-emperor",
  );
  assert.equal(
    CS.commanderSlug(
      "Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel",
    ),
    "sephiroth-fabled-soldier",
  );
});

test("basic lands, snow included; nonbasics are not", () => {
  assert.ok(CS.isBasicLand("Mountain"));
  assert.ok(CS.isBasicLand("Snow-Covered Swamp"));
  assert.ok(!CS.isBasicLand("Command Tower"));
  assert.ok(!CS.isBasicLand("Plains of Despair"));
});

// ------------------------------------------------------------- Scryfall

test("deck identifiers: 97, in 2 requests of at most 75", () => {
  const ids = CS.deckIdentifiers(parsed.cards);
  assert.equal(ids.length, 97);
  assert.deepEqual(ids[0], { set: "tdc", collector_number: "10" });
  assert.deepEqual(
    CS.chunk(ids, 75).map((c) => c.length),
    [75, 22],
  );
  assert.deepEqual(CS.deckIdentifiers([{ name: "Indulge / Excess" }]), [
    { name: "Indulge" },
  ]);
});

test("every export line is matched to its Scryfall card", () => {
  assert.equal(matched.filter((m) => !m.card).length, 0);
  const seph = matched.find((m) => m.line.name.startsWith("Sephiroth"));
  assert.equal(
    seph.card.name,
    "Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel",
  );
  // name-only lines match by name, front face included
  const byName = CS.matchCollection(
    [{ name: "Indulge / Excess" }],
    deckScry.data,
  );
  assert.equal(byName[0].card.name, "Indulge // Excess");
});

test("commander candidates are legendary creatures, in deck order, no duplicates", () => {
  const names = CS.commanderCandidates(matched).map((c) => c.name);
  assert.equal(names[0], "Zurgo Stormrender");
  assert.ok(names.includes("Adeline, Resplendent Cathar"));
  assert.ok(
    names.includes("Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel"),
  );
  assert.ok(!names.includes("Sol Ring"));
  assert.equal(new Set(names).size, names.length);
  const text = CS.commanderCandidates([
    {
      card: {
        id: "x",
        name: "Teferi, Temporal Archmage",
        type_line: "Legendary Planeswalker — Teferi",
        oracle_text: "Teferi can be your commander.",
      },
    },
  ]);
  assert.equal(text.length, 1);
});

test("slimCard: front face of double-faced cards, prices, Game Changers", () => {
  const seph = CS.slimCard(
    deckScry.data.find((c) => c.name.startsWith("Sephiroth")),
  );
  assert.ok(seph.image && seph.image.startsWith("https://"));
  assert.equal(seph.front, "Sephiroth, Fabled SOLDIER");
  assert.match(seph.frontType, /^Legendary Creature/);
  const all = recScry.data.map(CS.slimCard);
  assert.ok(
    all.every((c) => c.image),
    "every recommendation has an image",
  );
  assert.ok(all.some((c) => c.gameChanger));
  assert.ok(all.every((c) => c.usd === null || typeof c.usd === "number"));
});

test("role query and URL", () => {
  assert.equal(
    CS.roleQuery("removal", ["R", "W", "B"]),
    "id<=rwb f:commander otag:removal order:edhrec",
  );
  assert.equal(
    CS.roleQuery("ramp", []),
    "id<=c f:commander otag:ramp order:edhrec",
  );
  assert.equal(
    CS.roleSearchUrl("removal", ["R"]),
    "https://api.scryfall.com/cards/search?q=id%3C%3Dr%20f%3Acommander%20otag%3Aremoval%20order%3Aedhrec",
  );
});

// ------------------------------------------------------------- piles

test("EDHREC piles: expected piles, each card once per pile, ids match Scryfall", needsEdhrec, () => {
  const piles = CS.buildEdhrecPiles(edhrec, deckNames);
  assert.deepEqual(
    piles.map((p) => p.key),
    ["best", "creatures", "spells", "artifacts", "enchantments", "lands"],
  );
  const recIds = new Set(recScry.data.map((c) => c.id));
  for (const p of piles) {
    const ids = p.cards.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate in ${p.key}`);
    for (const c of p.cards) {
      assert.ok(recIds.has(c.id), `${c.name} has no Scryfall card`);
      assert.ok(c.inclusion >= 0 && c.inclusion <= 1);
    }
  }
  assert.equal(CS.edhrecIdentifiers(edhrec).length, recScry.data.length);
});

test("EDHREC piles: unknown sections go to Other; broken pages give no piles", () => {
  const page = {
    container: {
      json_dict: {
        cardlists: [
          {
            tag: "creatures",
            cardviews: [
              {
                id: "1",
                name: "Grizzly Bears",
                num_decks: 1,
                potential_decks: 2,
              },
            ],
          },
          {
            tag: "somethingnew",
            cardviews: [
              { id: "2", name: "Shock" },
              { id: "3", name: "Island" },
            ],
          },
        ],
      },
    },
  };
  const piles = CS.buildEdhrecPiles(page, {});
  assert.deepEqual(
    piles.map((p) => [p.key, p.cards.map((c) => c.name)]),
    [
      ["creatures", ["Grizzly Bears"]],
      ["other", ["Shock"]],
    ],
  );
  assert.equal(piles[0].cards[0].inclusion, 0.5);
  assert.deepEqual(CS.buildEdhrecPiles(null, {}), []);
  assert.deepEqual(CS.buildEdhrecPiles({ container: {} }, {}), []);
  assert.deepEqual(
    CS.buildEdhrecPiles(
      { container: { json_dict: { cardlists: [{ tag: "lands" }] } } },
      {},
    ),
    [],
  );
});

test("role pile: EDHREC cards first by synergy, then up to 25 Scryfall-only", needsEdhrec, () => {
  const edMap = CS.edhrecById(edhrec);
  const pile = CS.buildRolePile(
    CS.ROLES[0],
    removalSearch.data,
    edMap,
    deckNames,
  );
  const onE = pile.cards.filter((c) => c.onEdhrec);
  const offE = pile.cards.filter((c) => !c.onEdhrec);
  assert.ok(onE.length > 0);
  assert.equal(offE.length, 25);
  assert.equal(
    pile.cards.indexOf(offE[0]),
    onE.length,
    "EDHREC cards come first",
  );
  for (let i = 1; i < onE.length; i++)
    assert.ok(onE[i - 1].synergy >= onE[i].synergy);
  assert.equal(new Set(pile.cards.map((c) => c.id)).size, pile.cards.length);
});

test("role pile works with EDHREC missing", () => {
  const pile = CS.buildRolePile(
    CS.ROLES[0],
    removalSearch.data,
    {},
    deckNames,
    10,
  );
  assert.equal(pile.cards.length, 10);
  assert.ok(pile.cards.every((c) => !c.onEdhrec));
});

// ------------------------------------------------------------- filters

test("filters: Game Changers hidden by default, price, types", () => {
  const d = CS.defaultSettings();
  const gc = { gameChanger: true, usd: 1, frontType: "Artifact" };
  const bolt = { gameChanger: false, usd: 0.5, frontType: "Instant" };
  const golem = {
    gameChanger: false,
    usd: 30,
    frontType: "Artifact Creature — Golem",
  };
  const noPrice = { gameChanger: false, usd: null, frontType: "Land" };
  assert.equal(CS.passesFilters(gc, d), false);
  assert.equal(CS.passesFilters(gc, { ...d, hideGameChangers: false }), true);
  assert.equal(CS.passesFilters(golem, { ...d, maxPrice: 10 }), false);
  assert.equal(CS.passesFilters(noPrice, { ...d, maxPrice: 10 }), true);
  assert.deepEqual(CS.cardTypes(golem), ["creature", "artifact"]);
  assert.equal(CS.passesFilters(golem, { ...d, types: ["creature"] }), true);
  assert.equal(
    CS.passesFilters(bolt, { ...d, types: ["creature", "land"] }),
    false,
  );
  assert.equal(CS.passesFilters(undefined, d), false);
});

test("nextCards skips decided, missing details, and filtered cards; filters lose no swipes", () => {
  const pile = {
    cards: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }],
  };
  const info = {
    a: { gameChanger: false, frontType: "Instant" },
    b: { gameChanger: true, frontType: "Instant" },
    c: { gameChanger: false, frontType: "Land" },
    e: { gameChanger: false, frontType: "Creature" }, // d has no details
  };
  let s = CS.decide(CS.newDeckState("X"), "a", "skip");
  const d = CS.defaultSettings();
  assert.deepEqual(
    CS.nextCards(pile, s, d, info, 3).map((c) => c.id),
    ["c", "e"],
  );
  assert.deepEqual(
    CS.nextCards(pile, s, { ...d, hideGameChangers: false }, info, 2).map(
      (c) => c.id,
    ),
    ["b", "c"],
  );
  assert.equal(s.decisions.a, "skip", "changing filters kept the swipe");
});

test("real data: Game Changers in the recommendations are hidden by default", needsEdhrec, () => {
  const info = Object.fromEntries(
    recScry.data.map((c) => [c.id, CS.slimCard(c)]),
  );
  const piles = CS.buildEdhrecPiles(edhrec, deckNames);
  const shown = piles.flatMap((p) =>
    CS.nextCards(p, CS.newDeckState("Z"), CS.defaultSettings(), info, 999),
  );
  assert.ok(shown.length > 100);
  assert.ok(shown.every((c) => !info[c.id].gameChanger));
});

// ------------------------------------------------------------- swipes and undo

test("decide, undo, clear, and lists in swipe order", () => {
  let s = CS.newDeckState("Zurgo Stormrender", 1);
  const before = JSON.stringify(s);
  s = CS.decide(s, "a", "add", 2);
  assert.equal(JSON.stringify(CS.newDeckState("Zurgo Stormrender", 1)), before);
  s = CS.decide(s, "b", "skip", 3);
  s = CS.decide(s, "c", "maybe", 4);
  s = CS.decide(s, "d", "add", 5);
  assert.deepEqual(CS.idsWith(s, "add"), ["a", "d"]);
  assert.deepEqual(CS.idsWith(s, "maybe"), ["c"]);
  let u = CS.undo(s, 6);
  assert.equal(u.id, "d");
  assert.deepEqual(CS.idsWith(u.state, "add"), ["a"]);
  assert.equal(s.decisions.d, "add", "undo did not change the old state");
  u = CS.undo(CS.undo(CS.undo(u.state).state).state);
  assert.equal(u.id, "a");
  assert.equal(CS.undo(u.state).id, null);
  const cleared = CS.clearDecision(s, "a");
  assert.equal(cleared.decisions.a, undefined);
  assert.ok(!cleared.history.includes("a"));
  // re-deciding a card moves it to the end and keeps one history entry
  const again = CS.decide(s, "a", "maybe");
  assert.deepEqual(again.history, ["b", "c", "d", "a"]);
  assert.throws(() => CS.decide(s, "x", "love"));
});

test("deck id: same deck gives the same id, in any order; a changed deck does not", () => {
  const id = CS.deckId("Zurgo Stormrender", parsed.cards);
  assert.match(id, /^zurgo-stormrender-[0-9a-f]{8}$/);
  assert.equal(
    CS.deckId("Zurgo Stormrender", parsed.cards.slice().reverse()),
    id,
  );
  assert.notEqual(CS.deckId("Zurgo Stormrender", parsed.cards.slice(1)), id);
});

// ------------------------------------------------------------- saved data

test("store: cs: prefix only, round trip, and other apps' keys untouched", () => {
  const mem = memoryStorage();
  mem.setItem("tb:settings", '{"theme":"dark"}');
  const store = CS.makeStore(mem);
  const deckId = CS.deckId("Zurgo Stormrender", parsed.cards);
  let s = CS.decide(CS.newDeckState("Zurgo Stormrender"), "a", "add", 9);
  assert.ok(CS.saveDeckState(store, deckId, s));
  assert.ok(CS.saveSettings(store, { ...CS.defaultSettings(), maxPrice: 5 }));
  assert.deepEqual(mem.keys().sort(), [
    "cs:deck:" + deckId,
    "cs:settings",
    "tb:settings",
  ]);
  assert.equal(mem.getItem("tb:settings"), '{"theme":"dark"}');
  assert.deepEqual(CS.loadDeckState(store, deckId, "Zurgo Stormrender"), s);
  assert.equal(CS.loadSettings(store).maxPrice, 5);
  assert.ok(store.remove("settings"));
  assert.deepEqual(CS.loadSettings(store), CS.defaultSettings());
});

test("store: keeps working when storage is missing or throws", () => {
  const missing = CS.makeStore(null);
  assert.equal(missing.ok, false);
  assert.equal(missing.get("x", "fallback"), "fallback");
  assert.equal(missing.set("x", 1), false);
  const throwing = CS.makeStore({
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("blocked");
    },
  });
  assert.equal(throwing.get("x", 7), 7);
  assert.equal(throwing.set("x", 1), false);
  assert.equal(throwing.ok, false);
  assert.equal(throwing.remove("x"), false);
  assert.deepEqual(CS.loadDeckState(throwing, "d", "Z"), CS.newDeckState("Z"));
  assert.deepEqual(CS.loadSettings(throwing), CS.defaultSettings());
  // a page with no localStorage at all (Node has none)
  const auto = CS.makeStore();
  assert.equal(typeof auto.get("x", 1), "number");
});

test("saved data: broken or unknown saves start fresh; bad entries are dropped", () => {
  const mem = memoryStorage();
  const store = CS.makeStore(mem);
  mem.setItem("cs:deck:d", "not json{");
  assert.deepEqual(CS.loadDeckState(store, "d", "Z"), CS.newDeckState("Z"));
  mem.setItem("cs:deck:d", JSON.stringify({ v: 2, decisions: { a: "add" } }));
  assert.deepEqual(CS.loadDeckState(store, "d", "Z"), CS.newDeckState("Z"));
  mem.setItem(
    "cs:deck:d",
    JSON.stringify({
      v: 1,
      commander: "Z",
      decisions: { a: "add", b: "love", c: "maybe" },
      history: ["a", "b", "c", 5, "zz"],
      updated: 3,
    }),
  );
  assert.deepEqual(CS.loadDeckState(store, "d", "Z"), {
    v: 1,
    commander: "Z",
    decisions: { a: "add", c: "maybe" },
    history: ["a", "c"],
    updated: 3,
  });
  mem.setItem(
    "cs:settings",
    JSON.stringify({
      v: 1,
      hideGameChangers: "yes",
      maxPrice: -4,
      types: ["land", "dragon"],
    }),
  );
  assert.deepEqual(CS.loadSettings(store), {
    v: 1,
    hideGameChangers: true,
    maxPrice: null,
    types: ["land"],
  });
});

test("saved state: junk history ids named like built-in properties are dropped", () => {
  const s = CS.migrateDeckState({
    v: 1,
    commander: "Zurgo Stormrender",
    decisions: { abc: "add" },
    history: ["constructor", "abc", "toString", "__proto__"],
    updated: 1,
  });
  assert.deepEqual(s.history, ["abc"]);
  assert.deepEqual(Object.keys(s.decisions), ["abc"]);
});
