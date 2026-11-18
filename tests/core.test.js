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
// Two more EDHREC copies (Zurgo's budget and Tokens pages), also kept out of the repo.
const readOptional = (f) =>
  fs.existsSync(path.join(FIX, f)) ? JSON.parse(read(f)) : null;
const edhrecBudget = readOptional("edhrec_zurgo_budget.json");
const edhrecTokens = readOptional("edhrec_zurgo_tokens.json");
const needsSubPages = {
  skip:
    edhrec && edhrecBudget && edhrecTokens
      ? false
      : "needs the EDHREC copies in tests/fixtures (not in the public repo)",
};
const searchAll1 = JSON.parse(read("scryfall_search_all_p1.json"));
const searchAll2 = JSON.parse(read("scryfall_search_all_p2.json"));
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
    // what the page's localStorage offers for listing keys
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
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
    "cs:deck2:" + deckId,
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
  mem.setItem("cs:deck:d", JSON.stringify({ v: 3, decisions: { a: "add" } }));
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
  // a v1 save (before cycle 8) comes back as v2: no card list, no cuts
  assert.deepEqual(CS.loadDeckState(store, "d", "Z"), {
    v: 2,
    commander: "Z",
    cards: null,
    decisions: { a: "add", c: "maybe" },
    history: ["a", "c"],
    cuts: {},
    removed: [],
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

// ------------------------------------------------------------- cycle 5: deeper data

test("role piles: 13 roles, unique keys, tutors leave lands out", () => {
  assert.equal(CS.ROLES.length, 13);
  assert.equal(new Set(CS.ROLES.map((r) => r.key)).size, 13);
  const tutors = CS.ROLES.find((r) => r.key === "tutors");
  assert.equal(
    CS.roleQuery(tutors.tag, ["R", "W", "B"], tutors.extra),
    "id<=rwb f:commander otag:tutor -t:land -otag:land-ramp order:edhrec",
  );
  const gy = CS.ROLES.find((r) => r.key === "gyhate");
  assert.equal(gy.label, "Graveyard hate");
  assert.equal(CS.roleQuery(gy.tag, ["G", "U"]), "id<=gu f:commander otag:graveyard-hate order:edhrec");
  // the first five are unchanged
  assert.deepEqual(
    CS.ROLES.slice(0, 5).map((r) => r.tag),
    ["removal", "ramp", "draw", "protection", "board-wipe"],
  );
});

test("everything query: colors, Commander-legal, no basics, most played first", () => {
  assert.equal(
    CS.everythingQuery(["R", "W", "B"]),
    "id<=rwb f:commander -t:basic order:edhrec",
  );
  assert.equal(CS.everythingQuery([]), "id<=c f:commander -t:basic order:edhrec");
  assert.equal(
    CS.searchUrl("a b"),
    "https://api.scryfall.com/cards/search?q=a%20b",
  );
});

test("next page: only Scryfall search links get through", () => {
  assert.equal(CS.safeNextPage(searchAll1), searchAll1.next_page);
  assert.equal(CS.safeNextPage({ has_more: false, next_page: searchAll1.next_page }), null);
  assert.equal(CS.safeNextPage({ has_more: true, next_page: "https://evil.example/cards/search?q=x" }), null);
  assert.equal(CS.safeNextPage({ has_more: true, next_page: "https://api.scryfall.com/cards/collection" }), null);
  assert.equal(CS.safeNextPage(null), null);
});

test("EDHREC page URLs: budget and themes; odd slugs refused", () => {
  assert.equal(
    CS.edhrecSubUrl("zurgo-stormrender", "budget"),
    "https://json.edhrec.com/pages/commanders/zurgo-stormrender/budget.json",
  );
  assert.equal(CS.edhrecSubUrl("zurgo-stormrender", "../x"), null);
  assert.equal(CS.edhrecSubUrl("zurgo-stormrender", "a/b"), null);
  assert.equal(CS.edhrecSubUrl("Zurgo", "tokens"), null);
  assert.equal(CS.edhrecSubUrl("zurgo-stormrender", ""), null);
});

test("EDHREC themes: most decks first, small and odd ones left out", needsEdhrec, () => {
  const themes = CS.edhrecThemes(edhrec);
  assert.ok(themes.length > 0 && themes.length <= 15);
  assert.equal(themes[0].slug, "tokens");
  assert.equal(themes[0].label, "Tokens");
  for (let i = 1; i < themes.length; i++)
    assert.ok(themes[i - 1].count >= themes[i].count);
  assert.ok(themes.every((t) => t.count >= 20));
  const made = CS.edhrecThemes({
    panels: {
      taglinks: [
        { slug: "ok", value: "OK", count: 50 },
        { slug: "../bad", value: "Bad", count: 99 },
        { slug: "budget", value: "Budget", count: 99 },
        { slug: "ok", value: "Twice", count: 40 },
        { slug: "few", value: "Few", count: 3 },
        { slug: "noname", count: 70 },
      ],
    },
  });
  assert.deepEqual(made, [{ slug: "ok", label: "OK", count: 50 }]);
  assert.deepEqual(CS.edhrecThemes({}), []);
  assert.deepEqual(CS.edhrecThemes(null), []);
});

test("theme and budget piles: no deck cards or basics, each card once, best first", needsSubPages, () => {
  for (const [key, page] of [["edhrec:budget", edhrecBudget], ["theme:tokens", edhrecTokens]]) {
    const pile = CS.buildEdhrecPagePile(key, "x", page, deckNames);
    assert.ok(pile.cards.length > 100, key + " has cards");
    assert.equal(new Set(pile.cards.map((c) => c.id)).size, pile.cards.length);
    for (const c of pile.cards) {
      assert.ok(!deckNames[CS.nameKey(c.name)], key + ": " + c.name + " is in the deck");
      assert.ok(!CS.isBasicLand(c.name));
      assert.equal(c.section, key);
      assert.equal(c.onEdhrec, true);
    }
  }
  // Top cards lead; New Cards (few decks yet) don't
  const top = CS.edhrecLists(edhrecBudget)
    .find((cl) => cl.tag === "topcards")
    .cardviews.find((cv) => !deckNames[CS.nameKey(cv.name)]);
  assert.equal(CS.buildEdhrecPagePile("b", "B", edhrecBudget, deckNames).cards[0].id, top.id);
  // the pages add cards the main page doesn't have
  const main = CS.edhrecById(edhrec);
  const budget = CS.buildEdhrecPagePile("b", "B", edhrecBudget, deckNames);
  assert.ok(budget.cards.filter((c) => !main[c.id]).length >= 10);
  assert.deepEqual(CS.buildEdhrecPagePile("k", "K", {}, deckNames).cards, []);
});

test("more search cards: only new ones, no deck cards, EDHREC numbers kept", needsEdhrec, () => {
  const edMap = CS.edhrecById(edhrec);
  const pile = { key: "all", cards: [] };
  pile.cards = CS.moreSearchCards(pile, searchAll1.data, edMap, deckNames);
  const n1 = pile.cards.length;
  assert.ok(n1 > 50);
  // page 1 again adds nothing
  assert.deepEqual(CS.moreSearchCards(pile, searchAll1.data, edMap, deckNames), []);
  const more = CS.moreSearchCards(pile, searchAll2.data, edMap, deckNames);
  assert.ok(more.length > 50);
  pile.cards = pile.cards.concat(more);
  assert.equal(new Set(pile.cards.map((c) => c.id)).size, pile.cards.length);
  for (const c of pile.cards) {
    assert.ok(!deckNames[CS.nameKey(c.name)], c.name + " is in the deck");
    assert.ok(!CS.isBasicLand(c.name));
    assert.equal(c.section, "all");
  }
  const onE = pile.cards.filter((c) => c.onEdhrec);
  assert.ok(onE.length > 0 && onE.every((c) => c.numDecks > 0));
  assert.ok(pile.cards.some((c) => !c.onEdhrec));
});

// ------------------------------------------------------------- synergy (Fit)

const deckSlims = deckScry.data.map(CS.slimCard);
const recSlims = recScry.data.map(CS.slimCard);
const byName = (list, n) => list.find((c) => c.name === n);
const zurgoProfile = CS.deckProfile(deckSlims, "Zurgo Stormrender");

test("synergy: reads what cards give and want", () => {
  const t = (n) => CS.cardTraits(byName(deckSlims, n) || byName(recSlims, n));
  const zurgo = t("Zurgo Stormrender");
  assert.ok(zurgo.gives.bodies && zurgo.gives.attacks && zurgo.gives.deaths, "mobilize tokens attack and die");
  assert.ok(zurgo.wants.deaths, "draws when an attacking token leaves");
  const seer = t("Viscera Seer");
  assert.ok(seer.wants.fodder && seer.gives.deaths, "sacrifice outlet");
  assert.ok(t("Blood Artist").wants.deaths, "'this creature or another creature dies'");
  assert.ok(t("Mahadi, Emporium Master").wants.deaths, "'each creature that died this turn'");
  assert.ok(t("The Masamune").wants.deaths, "'a creature dying'");
  assert.ok(t("Grim Hireling").wants.treasure && t("Grim Hireling").gives.treasure, "makes Treasure and sacrifices it");
  assert.ok(!t("Viscera Seer").gives.treasure, "no Treasure in its text");
  assert.ok(t("Pitiless Plunderer").gives.treasure);
  assert.ok(t("Skullclamp").gives.gear);
  assert.ok(t("Cathars' Crusade").wants.bodies && t("Cathars' Crusade").gives.counters);
  assert.ok(t("Sol Ring").roles.ramp);
  assert.ok(t("Swords to Plowshares").roles.removal);
  assert.ok(t("Ruinous Ultimatum").roles.wipes);
  assert.ok(t("Lightning Greaves").roles.protection);
  assert.ok(t("Emeritus of Woe // Demonic Tutor").roles.tutors, "both faces are read");
  const mesa = t("Arid Mesa");
  assert.ok(mesa.land && Object.keys(mesa.roles).length === 0, "lands get no roles");
  assert.ok(t("Stadium Headliner").tokenTypes.warrior, "mobilize makes Warriors");
});

test("synergy: the card's own name never counts as text", () => {
  const fake = { id: "x", name: "Soul Warden", text: "Whenever another creature enters, you gain 1 life." };
  assert.equal(CS.synText(fake), "whenever another creature enters, you gain 1 life.");
  const named = { id: "y", name: "Grim Hireling", text: "Grim Hireling attacks. This creature dies." };
  assert.equal(CS.synText(named), "~ attacks. ~ dies.");
});

test("synergy: deck profile finds the commander, skips basics, counts tribes and roles", () => {
  const p = zurgoProfile;
  assert.equal(p.commander.name, "Zurgo Stormrender");
  assert.ok(p.cards.every((c) => !CS.isBasicLand(c.name)));
  assert.equal(p.cards.length, deckSlims.filter((s) => !CS.isBasicLand(s.name)).length);
  assert.ok(p.typeCount.warrior >= 10, "Warrior creatures plus Warrior tokens, commander counted x3");
  assert.ok(p.roleCount.ramp >= 8 && p.roleCount.removal >= 1);
});

test("synergy: Fit is 0-100 with at most 3 reasons, for every recommendation", () => {
  for (const r of recSlims) {
    const f = CS.fitScore(r, zurgoProfile);
    assert.ok(Number.isInteger(f.score) && f.score >= 0 && f.score <= 100, r.name);
    assert.ok(Array.isArray(f.reasons) && f.reasons.length <= 3, r.name);
    if (f.score === 0) assert.equal(f.reasons.length, 0, r.name + ": no score, no reasons");
    for (const why of f.reasons) assert.ok(!/undefined|NaN/.test(why), r.name + ": " + why);
  }
});

test("synergy: Zurgo's real picks rank the way a player would expect", () => {
  const fit = (n) => CS.fitScore(byName(recSlims, n), zurgoProfile).score;
  // token makers that attack beat plain lands and plain removal
  assert.ok(fit("Legion Warboss") >= 75);
  assert.ok(fit("Legion Warboss") > fit("Path to Exile"));
  assert.equal(fit("Evolving Wilds"), 0);
  // a sacrifice outlet that makes its own fodder ties into the deck's sacrifice plan
  assert.ok(fit("Chittering Witch") >= 75);
  const w = CS.fitScore(byName(recSlims, "War Effort"), zurgoProfile);
  assert.match(w.reasons[0], /^Works with Zurgo Stormrender: /, "commander reason comes first");
  // a role the deck is short on is named
  const path = CS.fitScore(byName(recSlims, "Path to Exile"), zurgoProfile);
  assert.match(path.reasons.join(" "), /Removal: your deck has \d+ \(about 8 is typical\)/);
  // Warrior payoff: Kor names Warriors, and the deck has plenty
  const kor = CS.cardTraits(byName(recSlims, "Kor, Cause of Vengeance"));
  assert.ok(/warriors you control/.test(kor.text));
});

test("synergy: the commander counts three times; one card can be left out", () => {
  const cmd = { id: "c", name: "Test Commander", types: "Legendary Creature \u2014 Elf", text: "Whenever a creature you control dies, draw a card." };
  const other = { id: "o", name: "Other Payoff", types: "Enchantment", text: "Whenever a creature you control dies, you gain 1 life." };
  const outlet = { id: "s", name: "Altar", types: "Artifact", text: "Sacrifice a creature: Add {C}{C}." };
  const vanilla = { id: "v", name: "Bear", types: "Creature \u2014 Bear", text: "" };
  const withCmd = CS.deckProfile([cmd, other], "Test Commander");
  const noCmd = CS.deckProfile([cmd, other], "Nobody");
  const a = CS.fitScore(outlet, withCmd);
  const b = CS.fitScore(outlet, noCmd);
  assert.ok(a.raw > b.raw, "linking to the commander is worth more");
  assert.ok(Math.abs(a.raw - (Math.sqrt(4) + 1)) < 1e-9 || a.raw > b.raw);
  assert.match(a.reasons[0], /^Works with Test Commander: death triggers/);
  assert.equal(CS.fitScore(vanilla, withCmd).score, 0);
  // leaving the payoff out drops the link to it
  assert.ok(CS.fitScore(outlet, withCmd, "o").raw < a.raw);
  // the biggest tie-in is named first
  const payoffs = [1, 2, 3, 4].map((i) => ({ id: "p" + i, name: "Payoff " + i, types: "Enchantment", text: "Whenever a creature you control dies, you gain 1 life." }));
  const lifer = { id: "l", name: "Lifer", types: "Enchantment", text: "Whenever you gain life, draw a card." };
  const both = { id: "b", name: "Both", types: "Artifact", text: "Sacrifice a creature: You gain 1 life." };
  const r = CS.fitScore(both, CS.deckProfile(payoffs.concat([lifer]), "")).reasons;
  assert.match(r[0], /^Makes creatures die; 4 of your cards use that/);
  assert.match(r[1], /^Gains life; 1 of your cards uses that/);
  // empty or broken input doesn't throw
  assert.equal(CS.fitScore({ id: "z", name: "" }, CS.deckProfile([], "")).score, 0);
  assert.equal(CS.deckSynergy(CS.deckProfile([], ""), []).score, 0);
});

test("synergy: the deck's own score, plan, weakest links and staples", () => {
  const d = CS.deckSynergy(zurgoProfile, deckSlims);
  assert.ok(d.score >= 50 && d.score <= 95, "Zurgo deck score " + d.score);
  const top = d.plan.slice(0, 4).map((p) => p.label).sort();
  assert.deepEqual(top, ["attacks", "bodies", "deaths", "fodder"]);
  assert.ok(d.staples.includes("Sol Ring") && d.staples.includes("Swords to Plowshares"));
  const weakNames = d.weakest.map((w) => w.name);
  assert.ok(!weakNames.includes("Sol Ring"), "role cards aren't weak links");
  assert.ok(!weakNames.includes("Zurgo Stormrender"), "the commander isn't scored");
  for (let i = 1; i < d.weakest.length; i++)
    assert.ok(d.weakest[i - 1].score <= d.weakest[i].score, "weakest first");
  assert.ok(d.weakest.length <= 5 && d.scored > 30);
});

// ------------------------------------------------------------------ combos

// The combo file for Zurgo (made by tools/spellbook_combos.js from Commander
// Spellbook). It's in the public repo, since the page reads it.
const comboFile = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "combos", "zurgo-stormrender.json"), "utf8"),
);
const MARDU = ["R", "W", "B"];

// A small find-my-combos reply, shaped like Spellbook's.
function spellbookVariant(id, names, extra) {
  return Object.assign(
    {
      id: id,
      uses: names.map((n) => ({ card: { name: n }, mustBeCommander: false })),
      identity: "B",
      produces: [1, 2, 3, 4].map((i) => ({ feature: { name: "Result " + i } })),
      bracketTag: "E",
      popularity: 10,
      requires: [],
      notablePrerequisites: "",
      description: "Long steps we don't keep.",
    },
    extra || {},
  );
}

test("combos: trimming a Spellbook reply", () => {
  const reply = {
    results: {
      identity: "RWB",
      included: [spellbookVariant("1-2", ["A Card", "B Card"], { popularity: 5 })],
      almostIncluded: [
        spellbookVariant("1-3", ["A Card", "C Card"], {
          popularity: 50,
          notablePrerequisites: "x".repeat(300),
          requires: [{ template: { name: "Persist Creature" } }],
        }),
        spellbookVariant("1-2", ["A Card", "B Card"]), // already seen
        spellbookVariant("9", ["Broken", null].map((n) => n)), // a use without a card
        { id: "8", uses: "nope" },
        null,
      ],
      almostIncludedByAddingColors: [spellbookVariant("7", ["Off Color"])],
    },
  };
  reply.results.almostIncluded[2].uses[1] = {};
  const t = CS.trimSpellbook(reply, "Test Commander", "2026-11-17");
  assert.equal(t.v, 1);
  assert.equal(t.identity, "RWB");
  assert.equal(t.commander, "Test Commander");
  assert.deepEqual(
    t.combos.map((c) => c.id),
    ["1-3", "1-2"],
    "most popular first; duplicates, broken and off-color combos left out",
  );
  const c = t.combos[0];
  assert.deepEqual(c.cards, ["A Card", "C Card"]);
  assert.equal(c.produces.length, 3);
  assert.deepEqual(c.needs, ["Persist Creature"]);
  assert.equal(c.note.length, 200);
  assert.ok(c.note.endsWith("..."));
  assert.equal(c.description, undefined, "Spellbook's steps aren't copied");
  assert.deepEqual(CS.trimSpellbook(null, "X", "").combos, []);
});

test("combos: brackets, colors and the file address", () => {
  assert.deepEqual(CS.comboBracket("E"), { n: 1, label: "Exhibition" });
  assert.equal(CS.comboBracket("R").n, 4);
  assert.equal(CS.comboBracket("?").n, 4, "unknown counts as bracket 4");
  assert.ok(CS.identityFits("RB", MARDU));
  assert.ok(CS.identityFits("C", MARDU));
  assert.ok(CS.identityFits("", MARDU));
  assert.ok(!CS.identityFits("G", MARDU));
  assert.ok(CS.identityFits("w", MARDU));
  assert.equal(CS.comboFileUrl("Zurgo Stormrender"), "combos/zurgo-stormrender.json");
  assert.equal(CS.comboFileUrl(""), null);
  assert.equal(CS.comboLink("2577-4050"), "https://commanderspellbook.com/combo/2577-4050/");
});

test("combos: what the deck has and what's one card away", () => {
  const file = {
    v: 1,
    combos: [
      { id: "a", cards: ["Altar", "Engine"], identity: "B", bracket: "E", popularity: 1, needs: [], commanderOnly: [] },
      { id: "b", cards: ["Altar", "Engine"], identity: "B", bracket: "E", popularity: 2, needs: ["Persist Creature"], commanderOnly: [] },
      { id: "c", cards: ["Altar", "Zombie"], identity: "B", bracket: "S", popularity: 99, needs: [], commanderOnly: [] },
      { id: "d", cards: ["Engine", "Loop"], identity: "B", bracket: "E", popularity: 3, needs: [], commanderOnly: [] },
      { id: "e", cards: ["Altar", "Loop"], identity: "RB", bracket: "C", popularity: 4, needs: [], commanderOnly: [] },
      { id: "f", cards: ["Altar", "Zombie"], identity: "B", bracket: "E", popularity: 5, needs: [], commanderOnly: [] },
      { id: "g", cards: ["Altar", "Elf"], identity: "G", bracket: "E", popularity: 50, needs: [], commanderOnly: [] },
      { id: "h", cards: ["Altar", "Boss"], identity: "B", bracket: "E", popularity: 50, needs: [], commanderOnly: ["Boss"] },
      { id: "i", cards: ["Two", "Away"], identity: "B", bracket: "E", popularity: 50, needs: [], commanderOnly: [] },
      { id: "j", cards: ["Altar", "Swamp"], identity: "B", bracket: "E", popularity: 50, needs: [], commanderOnly: [] },
      null,
      { id: "k", cards: [] },
    ],
  };
  const names = CS.deckNameSet([{ name: "Altar" }, { name: "Engine" }]);
  const d = CS.deckCombos(file, names, ["R", "B"]);
  assert.deepEqual(d.inDeck.map((c) => c.id), ["a"]);
  assert.deepEqual(d.needsPiece.map((c) => c.id), ["b"]);
  // Zombie and Loop each complete 2, best bracket 1; Zombie's bracket-1 combo is more popular
  assert.deepEqual(d.oneAway.map((g) => g.name), ["Zombie", "Loop"]);
  const loop = d.oneAway[1];
  assert.equal(loop.best, 1);
  assert.deepEqual(loop.combos.map((c) => c.id), ["d", "e"], "lowest bracket first");
  assert.deepEqual(loop.combos[0].others, ["Engine"]);
  assert.equal(loop.combos[1].bracketLabel, "Core");
  const zombie = d.oneAway[0];
  assert.deepEqual(zombie.combos.map((c) => c.id), ["f", "c"]);
  // nothing for the wrong file version or junk
  assert.deepEqual(CS.deckCombos({ v: 2, combos: file.combos }, names, MARDU).oneAway, []);
  assert.deepEqual(CS.deckCombos(null, names, MARDU).inDeck, []);
});

test("combos: the real Zurgo file against the sample deck", () => {
  assert.equal(comboFile.v, 1);
  assert.equal(comboFile.commander, "Zurgo Stormrender");
  const d = CS.deckCombos(comboFile, deckNames, MARDU);
  assert.equal(d.inDeck.length, 0);
  assert.equal(d.needsPiece.length, 6, "the Cathars' Crusade loops that need a persist creature");
  assert.ok(d.oneAway.length >= 30, "one card away: " + d.oneAway.length);
  assert.equal(d.oneAway[0].name, "Gravecrawler");
  d.oneAway.forEach((g) => {
    assert.ok(!deckNames[g.key], g.name + " is already in the deck");
    g.combos.forEach((c) => assert.ok(CS.identityFits(c.identity, MARDU)));
  });
  for (let i = 1; i < d.oneAway.length; i++)
    assert.ok(d.oneAway[i - 1].best <= d.oneAway[i].best, "lowest bracket first");
});

test("combos: the Combos pile", () => {
  const oneAway = [
    { name: "Loop", key: "loop" },
    { name: "Nowhere", key: "nowhere" },
    { name: "Zombie", key: "zombie" },
    { name: "Altar", key: "altar" },
  ];
  const scry = [
    { id: "s-loop", name: "Loop" },
    { id: "s-zombie", name: "Zombie" },
    { id: "s-altar", name: "Altar" },
  ];
  const edhrecMap = {
    "s-loop": { id: "s-loop", name: "Loop", synergy: 0.3, inclusion: 0.2, onEdhrec: true },
    "e-zombie": { id: "e-zombie", name: "Zombie", synergy: 0.1, inclusion: 0.1, onEdhrec: true },
  };
  const pile = CS.buildComboPile(oneAway, scry, edhrecMap, CS.deckNameSet([{ name: "Altar" }]));
  assert.equal(pile.key, "combos");
  assert.deepEqual(pile.cards.map((c) => c.id), ["s-loop", "e-zombie"], "EDHREC's id wins, even by name");
  assert.equal(pile.cards[0].synergy, 0.3);
  assert.ok(pile.cards.every((c) => c.section === "combos"));
  const plain = CS.buildComboPile(oneAway, scry, {}, {});
  assert.equal(plain.cards.length, 3);
  assert.equal(plain.cards[0].onEdhrec, false);
  assert.deepEqual(CS.buildComboPile(null, null, null, null).cards, []);
});

test("combos: the Zurgo Combos pile from real Scryfall cards", () => {
  const scry = JSON.parse(read("scryfall_combos.json")).data;
  const d = CS.deckCombos(comboFile, deckNames, MARDU);
  const pile = CS.buildComboPile(d.oneAway, scry, CS.edhrecById(edhrec || {}), deckNames);
  assert.equal(pile.cards.length, d.oneAway.length, "every one-away card found on Scryfall");
  assert.equal(pile.cards[0].name, "Gravecrawler");
  assert.equal(new Set(pile.cards.map((c) => c.id)).size, pile.cards.length);
});
// ------------------------------------------------------------- cycle 8: edited decks and cuts

const zurgoSlims = deckSlims; // zurgoProfile (above) is built from these
const zurgoSyn = CS.deckSynergy(zurgoProfile, zurgoSlims);
const BOM = String.fromCharCode(0xfeff);

/** The Zurgo export with some lines dropped and some added (an edited deck). */
function editedExport(drop, add) {
  const lines = exportText
    .split(/\r?\n/)
    .filter((l) => !drop.some((d) => l.startsWith("1 " + d + " ")));
  return lines.concat(add.map((n) => "1 " + n)).join("\n");
}

test("deck state v2: new state, migration from v1, cuts and removed cleaned", () => {
  const keys = CS.deckKeys(parsed.cards);
  assert.equal(keys.length, new Set(keys).size);
  assert.deepEqual(keys, keys.slice().sort());
  const fresh = CS.newDeckState("Zurgo Stormrender", 5, keys);
  assert.equal(fresh.v, 2);
  assert.deepEqual(fresh.cards, keys);
  assert.notEqual(fresh.cards, keys, "a copy, not the caller's array");
  assert.deepEqual(fresh.cuts, {});
  assert.deepEqual(fresh.removed, []);
  const m = CS.migrateDeckState({
    v: 2,
    commander: "Z",
    cards: ["a", 7, "b"],
    decisions: { x: "add" },
    history: ["x"],
    cuts: { "Sol Ring": 1, Bad: 0, Worse: 1.5, Huge: 500, Text: "1", "": 1 },
    removed: ["gone", 3],
    updated: 4,
  });
  assert.deepEqual(m.cards, ["a", "b"]);
  assert.deepEqual(m.cuts, { "Sol Ring": 1 });
  assert.deepEqual(m.removed, ["gone"]);
  const arr = CS.migrateDeckState({
    v: 2,
    commander: "Z",
    decisions: {},
    history: [],
    cuts: ["x"],
    removed: "x",
  });
  assert.deepEqual(arr.cuts, {});
  assert.deepEqual(arr.removed, []);
  assert.equal(arr.cards, null);
  // swipes keep cards and cuts; Undo is for swipes only
  const s = CS.decide(CS.cutOne(fresh, "Spirit Mantle", 1, 6), "id1", "add", 7);
  assert.deepEqual(s.cuts, { "Spirit Mantle": 1 });
  assert.deepEqual(s.cards, keys);
  assert.deepEqual(CS.undo(s, 8).state.cuts, { "Spirit Mantle": 1 });
});

test("saved data: v2 saves use their own key; v1 saves are read, never changed", () => {
  const mem = memoryStorage();
  const store = CS.makeStore(mem);
  const id = CS.deckId("Zurgo Stormrender", parsed.cards);
  assert.equal(CS.deckKey(id), "deck2:" + id);
  assert.equal(CS.oldDeckKey(id), "deck:" + id);
  const v1 = JSON.stringify({
    v: 1,
    commander: "Zurgo Stormrender",
    decisions: { a: "add" },
    history: ["a"],
    updated: 2,
  });
  mem.setItem("cs:deck:" + id, v1);
  const loaded = CS.loadDeckState(store, id, "Zurgo Stormrender");
  assert.equal(loaded.v, 2);
  assert.deepEqual(loaded.decisions, { a: "add" });
  assert.equal(CS.readDeckState(store, id), null, "no v2 save yet");
  CS.saveDeckState(store, id, CS.decide(loaded, "b", "skip", 3));
  assert.equal(
    mem.getItem("cs:deck:" + id),
    v1,
    "the v1 save is left exactly as it was",
  );
  // a page from before cycle 8 writing its v1 key can't touch the v2 save
  mem.setItem(
    "cs:deck:" + id,
    JSON.stringify({
      v: 1,
      commander: "Zurgo Stormrender",
      decisions: { z: "skip" },
      history: ["z"],
      updated: 9,
    }),
  );
  assert.deepEqual(CS.loadDeckState(store, id, "Zurgo Stormrender").decisions, {
    a: "add",
    b: "skip",
  });
});

test("cuts: one copy at a time, capped, taken back, counted", () => {
  const s0 = CS.newDeckState("Z", 1, []);
  const s1 = CS.cutOne(s0, "Mountain", 2, 2);
  const s2 = CS.cutOne(s1, "Mountain", 2, 3);
  const s3 = CS.cutOne(s2, "Mountain", 2, 4);
  assert.deepEqual(s0.cuts, {}, "the old state is unchanged");
  assert.deepEqual(s2.cuts, { Mountain: 2 });
  assert.deepEqual(s3.cuts, { Mountain: 2 }, "no more cuts than copies");
  assert.equal(CS.cutCount(CS.cutOne(s3, "Sol Ring", 1).cuts), 3);
  const back = CS.uncutOne(s3, "Mountain", 5);
  assert.deepEqual(back.cuts, { Mountain: 1 });
  assert.deepEqual(CS.uncutOne(back, "Mountain").cuts, {});
  assert.deepEqual(
    CS.uncutOne(s0, "constructor").cuts,
    {},
    "unknown names do nothing",
  );
  assert.deepEqual(CS.cutOne(s0, "constructor", 1).cuts, { constructor: 1 });
});

test("cuts: liveCuts drops cards no longer in the main deck and caps at copies", () => {
  const cards = CS.parseExport(
    "1 Sol Ring (C21) 263\n2 Mountain (THB) 253 *F*\n1 Emeritus of Woe / Demonic Tutor (SOS) 324\n\nSIDEBOARD:\n1 Spirit Mantle",
  ).cards;
  const live = CS.liveCuts(
    {
      "Sol Ring": 1,
      Mountain: 5,
      "Spirit Mantle": 1,
      "Emeritus of Woe // Demonic Tutor": 1,
    },
    cards,
  );
  assert.deepEqual(
    live,
    { "Sol Ring": 1, Mountain: 2, "Emeritus of Woe / Demonic Tutor": 1 },
    "a sideboard card isn't in the deck",
  );
  assert.deepEqual(CS.liveCuts(null, cards), {});
});

test("export sections: sideboard and maybeboard cards are marked and not counted", () => {
  const p = CS.parseExport(
    "Commander:\n1 Zurgo Stormrender\nDeck:\n1 Sol Ring\n\nSIDEBOARD:\n2 Shock\nMaybeboard\n1 Bolt",
  );
  assert.deepEqual(
    p.cards.map((c) => c.side),
    [false, false, true, true],
  );
  assert.equal(CS.deckSize(p.cards), 2);
  assert.ok(parsed.cards.every((c) => c.side === false));
});

test("edited deck: the old save is found and carried over", () => {
  const oldKeys = CS.deckKeys(parsed.cards);
  const edited = CS.parseExport(
    editedExport(
      ["Spirit Mantle", "Dawn Charm"],
      ["Teysa Karlov", "Zulaport Cutthroat", "Mondrak, Glory Dominus"],
    ),
  );
  const newKeys = CS.deckKeys(edited.cards);
  assert.notEqual(
    CS.deckId("Zurgo Stormrender", edited.cards),
    CS.deckId("Zurgo Stormrender", parsed.cards),
  );
  let old = CS.newDeckState("Zurgo Stormrender", 1, oldKeys);
  old = CS.decide(old, "teysa", "add", 2);
  old = CS.decide(old, "x", "skip", 3);
  old = CS.cutOne(old, "Spirit Mantle", 1, 4);
  old = CS.cutOne(old, "Ashnod's Altar", 1, 5);
  const oldKey = CS.deckKey(CS.deckId("Zurgo Stormrender", parsed.cards));
  const found = CS.findCarrySource(
    [{ key: oldKey, state: old }],
    "zurgo-stormrender",
    newKeys,
  );
  assert.equal(found.key, oldKey);
  assert.ok(found.overlap > 0.9 && found.overlap < 1, found.overlap);
  const carried = CS.carryOver(found.state, newKeys, edited.cards, 9);
  assert.deepEqual(carried.decisions, old.decisions, "swipes come along");
  assert.deepEqual(carried.history, old.history);
  assert.deepEqual(carried.cards, newKeys);
  assert.deepEqual(
    carried.cuts,
    { "Ashnod's Altar": 1 },
    "Spirit Mantle was cut in Moxfield: done",
  );
  assert.deepEqual(carried.removed, ["dawn charm", "spirit mantle"]);
  assert.equal(carried.updated, 9);
  assert.equal(old.cuts["Spirit Mantle"], 1, "the old state is unchanged");
  // a card put back in the deck comes off `removed`
  const again = CS.carryOver(carried, oldKeys, parsed.cards, 10);
  // and the cards that left this time are added (Dawn Charm and Spirit Mantle are back)
  assert.deepEqual(again.removed, ["mondrak, glory dominus", "teysa karlov", "zulaport cutthroat"]);
});

test("edited deck: which saves can be carried over", () => {
  const keys = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const st = (cards, updated, swiped = true) => {
    let s = CS.newDeckState("Z", updated, cards);
    if (swiped) s = CS.decide(s, "id" + updated, "skip", updated);
    return s;
  };
  const k = (h) => "deck2:zurgo-stormrender-" + h;
  const v1 = CS.migrateDeckState({
    v: 1,
    commander: "Z",
    decisions: { a: "add" },
    history: ["a"],
    updated: 99,
  });
  // another commander, a commander whose slug only starts the same, an empty
  // save, too different, a v1 save (no card list), a v1 key name
  assert.equal(
    CS.findCarrySource(
      [
        {
          key: "deck2:adeline-resplendent-cathar-0000000a",
          state: st(keys, 1),
        },
        {
          key: "deck2:zurgo-stormrender-the-second-0000000b",
          state: st(keys, 2),
        },
        { key: k("0000000c"), state: st(keys, 3, false) },
        { key: k("0000000d"), state: st(["a", "b", "c", "x", "y", "z"], 4) },
        { key: k("0000000e"), state: v1 },
        { key: "deck:zurgo-stormrender-0000000f", state: st(keys, 5) },
      ],
      "zurgo-stormrender",
      keys,
    ),
    null,
  );
  // 60% shared is enough; more shared wins over more recent
  const six = keys.slice(0, 6).concat(["p", "q", "r", "s"]);
  const nine = keys.slice(0, 9).concat(["p"]);
  const r = CS.findCarrySource(
    [
      { key: k("00000002"), state: st(six, 50) },
      { key: k("00000003"), state: st(nine, 10) },
    ],
    "zurgo-stormrender",
    keys,
  );
  assert.equal(r.key, k("00000003"));
  assert.equal(r.overlap, 0.9);
  assert.equal(
    CS.findCarrySource(
      [{ key: k("00000002"), state: st(six, 50) }],
      "zurgo-stormrender",
      keys,
    ).overlap,
    0.6,
  );
  // same overlap: the most recent
  const tie = CS.findCarrySource(
    [
      { key: k("00000004"), state: st(nine, 10) },
      { key: k("00000005"), state: st(nine, 20) },
    ],
    "zurgo-stormrender",
    keys,
  );
  assert.equal(tie.key, k("00000005"));
  // a save with only cuts still counts
  const cutsOnly = CS.cutOne(CS.newDeckState("Z", 1, nine), "a", 1, 2);
  assert.ok(
    CS.findCarrySource(
      [{ key: k("00000006"), state: cutsOnly }],
      "zurgo-stormrender",
      keys,
    ),
  );
  assert.equal(CS.findCarrySource(null, "x", null), null);
});

test("store: keys() and savedDecksFor list v2 decks only, and survive broken storage", () => {
  const mem = memoryStorage();
  const store = CS.makeStore(mem);
  mem.setItem("tb:deck2:zurgo-stormrender-00000001", "{}");
  mem.setItem("cs:deck2:zurgo-stormrender-00000002", "not json{");
  mem.setItem(
    "cs:deck:zurgo-stormrender-00000007",
    JSON.stringify({ v: 1, commander: "Z", decisions: {}, history: [] }),
  );
  store.set("deck2:zurgo-stormrender-00000003", CS.newDeckState("Z", 1, ["a"]));
  store.set(
    "deck2:adeline-resplendent-cathar-00000004",
    CS.newDeckState("A", 1, ["a"]),
  );
  store.set("settings", CS.defaultSettings());
  assert.deepEqual(store.keys().sort(), [
    "deck2:adeline-resplendent-cathar-00000004",
    "deck2:zurgo-stormrender-00000002",
    "deck2:zurgo-stormrender-00000003",
    "deck:zurgo-stormrender-00000007",
    "settings",
  ]);
  const saved = CS.savedDecksFor(store, "zurgo-stormrender");
  assert.deepEqual(
    saved.map((e) => e.key),
    ["deck2:zurgo-stormrender-00000003"],
    "unreadable and v1 saves left out",
  );
  assert.deepEqual(CS.makeStore(null).keys(), []);
  const throwing = CS.makeStore({
    get length() {
      throw new Error("blocked");
    },
    getItem() {
      throw new Error("blocked");
    },
  });
  assert.deepEqual(throwing.keys(), []);
  assert.deepEqual(CS.savedDecksFor(throwing, "z"), []);
});

test("Added list: picks in the deck now, and picks cut from it since, come off", () => {
  const names = {
    a: "Teysa Karlov",
    b: "Sol Ring",
    c: null,
    d: "Mondrak, Glory Dominus",
    e: "Zulaport Cutthroat",
  };
  const split = CS.splitAdded(
    ["a", "b", "c", "d", "e"],
    (id) => names[id],
    deckNames,
    ["zulaport cutthroat"],
  );
  assert.deepEqual(split.inDeck, ["b"]);
  assert.deepEqual(
    split.gone,
    ["e"],
    "added, put in the deck, cut later: not a pick again",
  );
  assert.deepEqual(
    split.pending,
    ["a", "c", "d"],
    "a name still loading counts as still to add",
  );
  assert.deepEqual(CS.splitAdded(["e"], (id) => names[id], deckNames).pending, [
    "e",
  ]);
});

test("whole-deck copy: cuts come off, printings and marks stay, picks after the main list", () => {
  assert.equal(CS.deckSize(parsed.cards), 100);
  const text = CS.updatedDeckText(
    exportText,
    { "Spirit Mantle": 1, Mountain: 1, "Emeritus of Woe // Demonic Tutor": 1 },
    ["Teysa Karlov", "Fell the Profane // Fell Mire"],
  );
  const lines = text.split("\n");
  assert.ok(!lines.some((l) => l.startsWith("1 Spirit Mantle")));
  assert.ok(
    !lines.some((l) => l.includes("Emeritus of Woe")),
    "a '/' card is matched by its front face",
  );
  assert.ok(
    lines.includes("1 Mountain (THB) 253 *F*"),
    "2 Mountains become 1, printing and foil kept",
  );
  assert.ok(
    lines.includes("1 Sol Ring (PFDN) 1 *F*"),
    "untouched lines stay as they were",
  );
  assert.deepEqual(lines.slice(-2), [
    "1 Teysa Karlov",
    "1 Fell the Profane // Fell Mire",
  ]);
  assert.equal(CS.deckSize(CS.parseExport(text).cards), 100 - 3 + 2);
  // section headers, comments and blank lines stay; a BOM is dropped
  const odd = CS.updatedDeckText(
    BOM +
      "// my deck\nCommander:\n1 Zurgo Stormrender\n\nDeck:\n3 Plains\n1 Sol Ring\n\n",
    { Plains: 5, "Sol Ring": 1 },
    [],
  );
  assert.equal(odd, "// my deck\nCommander:\n1 Zurgo Stormrender\n\nDeck:");
  assert.equal(
    CS.updatedDeckText(exportText, {}, []),
    exportText.replace(/\s+$/, ""),
  );
  // picks go before a sideboard; sideboard cards are never cut
  const sb = CS.updatedDeckText(
    "1 Zurgo Stormrender\n1 Sol Ring\n\nSIDEBOARD:\n1 Shock\n1 Sol Ring",
    { "Sol Ring": 2 },
    ["Bolt"],
  );
  assert.equal(
    sb,
    "1 Zurgo Stormrender\n1 Bolt\n\nSIDEBOARD:\n1 Shock\n1 Sol Ring",
  );
});

test("cut ideas: never the commander, lands, staples, role keepers or combo pieces", () => {
  const ideas = CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, {});
  const names = ideas.map((x) => x.name);
  // cycle 11: wider labels raised the deck's average Fit (Impact Tremors and
  // Warleader's Call now pay off creatures entering), so fewer weak-fit ideas
  assert.ok(ideas.length >= 4, ideas.length);
  assert.ok(!names.includes("Zurgo Stormrender"));
  assert.ok(
    !names.some((n) => /Badlands|Command Tower|Arid Mesa|Urza's Saga/.test(n)),
    "no lands",
  );
  assert.ok(
    !names.includes("Sol Ring") && !names.includes("Arcane Signet"),
    "staples are kept",
  );
  assert.ok(
    !names.includes("Swords to Plowshares"),
    "removal is under its typical count, so it's kept",
  );
  // not staples (EDHREC rank over 500), kept only because removal (4) and
  // board wipes (1) are under their typical counts
  assert.ok(
    !names.includes("Grim Hireling") && !names.includes("Ruinous Ultimatum"),
  );
  assert.ok(ideas.every((x) => x.reasons.length && x.fit < 75));
  for (let i = 1; i < ideas.length; i++)
    assert.ok(ideas[i - 1].score >= ideas[i].score);
  // what's protected or already cut drops out
  const first = ideas[0].name;
  const fewer = CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, {
    protect: { [CS.nameKey(first)]: true },
    cuts: { [ideas[1].name]: 1 },
  }).map((x) => x.name);
  assert.ok(!fewer.includes(first) && !fewer.includes(ideas[1].name));
  assert.equal(fewer.length, ideas.length - 2);
  assert.deepEqual(
    CS.cutSuggestions({ cards: [], roleCount: {} }, null, [], null),
    [],
  );
});

test("swap ideas: same job first; a land pairs with a basic", () => {
  const ideas = CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, {});
  const protCut = ideas.find((x) => x.roles.includes("protection"));
  assert.ok(
    protCut,
    "the Zurgo deck has a protection card among its cut ideas",
  );
  const shield = {
    id: "test-shield",
    name: "Test Shield",
    typeLine: "Instant",
    frontType: "Instant",
    types: "Instant",
    oracle: "Creatures you control gain indestructible until end of turn.",
    text: "Creatures you control gain indestructible until end of turn.",
    manaCost: "{1}{W}",
    cmc: 2,
  };
  const swaps = CS.swapSuggestions(
    shield,
    ideas,
    zurgoProfile,
    parsed.cards,
    {},
  );
  assert.ok(swaps.length >= 1 && swaps.length <= 3);
  assert.match(swaps[0].why, /same job \(protection\)/);
  const land = recScry.data
    .map(CS.slimCard)
    .find((c) => /^Land/.test(c.typeLine));
  const landSwaps = CS.swapSuggestions(
    land,
    ideas,
    zurgoProfile,
    parsed.cards,
    { Mountain: 2 },
  );
  assert.ok(landSwaps.length >= 1);
  assert.ok(landSwaps.every((x) => CS.isBasicLand(x.name) && x.id === null));
  assert.ok(
    !landSwaps.some((x) => x.name === "Mountain"),
    "both Mountains are cut already",
  );
  assert.deepEqual(
    CS.swapSuggestions(null, ideas, zurgoProfile, parsed.cards, {}),
    [],
  );
});

// ---------------------------------------------------------------- a second commander: Zimone
// Zimone, Mystery Unraveler puts cards face down (manifest dread) on the first
// land each turn and flips one up for free on the next. A deck built around her
// reads as nothing to a scorer that only knows tokens and sacrifice, so these
// tests pin down the face-down, top-of-library, free-cheat and landfall reading.
const zimoneParsed = CS.parseExport(read("zimone_export.txt"));
const zimoneSlims = CS.matchCollection(
  zimoneParsed.cards,
  JSON.parse(read("scryfall_deck_zimone.json")).data,
)
  .filter((m) => m.card)
  .map((m) => CS.slimCard(m.card));
const zimoneRecs = JSON.parse(read("scryfall_zimone_recs.json")).data.map(CS.slimCard);
const zimoneProfile = CS.deckProfile(zimoneSlims, "Zimone, Mystery Unraveler");
const zimoneSyn = CS.deckSynergy(zimoneProfile, zimoneSlims);

test("synergy (Zimone): face-down, top of library, free cheats and landfall are read", () => {
  const t = (n) => CS.cardTraits(byName(zimoneSlims, n) || byName(zimoneRecs, n));
  const z = t("Zimone, Mystery Unraveler");
  assert.ok(z.gives.facedown && z.wants.facedown, "manifests dread and turns cards face up");
  assert.ok(z.wants.landfall && z.wants.top && z.wants.big, "landfall, looks at the top, flips for free");
  assert.ok(t("Misty Rainforest").gives.landfall, "a fetch land that names land types");
  assert.ok(t("Quirion Ranger").gives.landfall, "returns a Forest to replay it");
  assert.ok(t("Azusa, Lost but Seeking").gives.landfall && t("Azusa, Lost but Seeking").roles.ramp, "up to two additional lands");
  assert.ok(t("Ancient Greenwarden").wants.landfall, "'a land entering' doubles landfall");
  assert.ok(t("Farseek").roles.ramp && !t("Farseek").roles.tutors, "fetching a Mountain card is ramp, not a tutor");
  assert.ok(t("Counterspell").roles.removal && t("Snap").roles.removal, "counters and bounce count as removal");
  assert.ok(!CS.cardTraits({ id: "s", name: "Self", types: "Instant", text: "Return target creature you control to its owner's hand." }).roles.removal, "bouncing your own creature isn't removal");
  assert.ok(t("Scroll Rack").gives.top && t("Sensei's Divining Top").gives.top);
  assert.ok(t("The Reality Chip").wants.top);
  assert.ok(t("Blightsteel Colossus").gives.big && t("Omniscience").gives.big && t("Omniscience").wants.big);
  assert.ok(!t("Koma, World-Eater").gives.big || byName(zimoneSlims, "Koma, World-Eater").cmc >= 7);
  assert.ok(t("Scroll of Fate").gives.facedown && t("Vannifar, Evolved Enigma").gives.facedown, "manifest and cloak from hand");
  // reminder text alone doesn't make a card a payoff
  const plainMorph = CS.cardTraits({ id: "m", name: "Plain Morph", types: "Creature \u2014 Beast", text: "Morph {2}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
  assert.ok(plainMorph.gives.facedown && !plainMorph.wants.facedown);
  const scryLand = CS.cardTraits({ id: "l", name: "Scry Land", types: "Land", text: "When this land enters, scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });
  assert.ok(scryLand.gives.top && !scryLand.wants.top);
  const payoff = CS.cardTraits({ id: "p", name: "Payoff", types: "Enchantment", text: "Whenever you manifest dread, draw a card." });
  assert.ok(payoff.wants.facedown && !payoff.gives.facedown, "a manifest payoff doesn't manifest");
});

test("synergy (Zimone): the deck's plan and score reflect the engine", () => {
  const plan = zimoneSyn.plan.map((p) => p.label);
  for (const l of ["landfall", "facedown", "top", "big"]) assert.ok(plan.includes(l), "plan has " + l);
  // blink now counts as flipping face-down cards, so the two swap places
  assert.deepEqual(plan.slice(0, 2).sort(), ["facedown", "landfall"]);
  assert.ok(zimoneSyn.score >= 40, "Zimone deck score " + zimoneSyn.score);
  assert.ok(zimoneProfile.roleCount.removal >= 8, "counters and bounce counted");
  assert.ok(!zimoneProfile.roleCount.tutors, "land fetching isn't tutoring");
});

test("synergy (Zimone): big cards she flips for free aren't cut ideas", () => {
  const bs = zimoneProfile.cards.find((c) => c.name === "Blightsteel Colossus");
  assert.ok(CS.isCheatPayload(bs, zimoneProfile));
  // without a card that cheats, a big card is just expensive
  const alone = CS.deckProfile([byName(zimoneSlims, "Blightsteel Colossus")], "");
  assert.ok(!CS.isCheatPayload(alone.cards[0], alone));
  // a payload is a staple, or (since the commander bonus) scores 50+ as a commander card
  for (const n of ["Blightsteel Colossus", "Omniscience"]) {
    const c = zimoneProfile.cards.find((x) => x.name === n);
    assert.ok(zimoneSyn.staples.includes(n) || zimoneSyn.fits[c.id] >= 50, n);
  }
  const ideas = CS.cutSuggestions(zimoneProfile, zimoneSyn, zimoneSlims, {});
  const top = ideas.slice(0, 8).map((i) => i.name);
  for (const n of ["Blightsteel Colossus", "Darksteel Colossus", "Omniscience", "Quirion Ranger"])
    assert.ok(!top.includes(n), n + " isn't a top cut idea: " + top.join(", "));
  const bsIdea = ideas.find((i) => i.name === "Blightsteel Colossus");
  if (bsIdea) assert.ok(!bsIdea.reasons.some((r) => /isn't part of the deck's plan|Weak fit/.test(r)), bsIdea.reasons.join("; "));
});

test("synergy (Zimone): recommendations that feed the engine beat generic good cards", () => {
  const fit = (n) => CS.fitScore(byName(zimoneRecs, n), zimoneProfile);
  assert.ok(fit("Ancient Greenwarden").score >= 60, "Greenwarden " + fit("Ancient Greenwarden").score);
  assert.ok(fit("Ugin's Mastery").score > fit("Displacer Kitten").score);
  assert.ok(fit("Ancient Greenwarden").score > fit("Displacer Kitten").score);
  assert.match(fit("Ugin's Mastery").reasons[0], /^Works with Zimone: face-down cards/);
  assert.ok(fit("Cryptic Coat").score > 30 && fit("Azusa, Lost but Seeking").score > 30);
  assert.ok(fit("Craterhoof Behemoth").reasons.some((r) => /big cards for free|Big card/.test(r)));
});

// ------------------------------------------------------------- cycle 9

const fakeCard = (name, type, text, cmc) =>
  CS.slimCard({ id: "fake-" + name, name: name, type_line: type, oracle_text: text, cmc: cmc, color_identity: [] });

test("cycle 9: ramp counts steady mana, not every Treasure", () => {
  const roles = (n) => CS.cardTraits(byName(deckSlims, n) || byName(zimoneSlims, n)).roles;
  // a Treasure's reminder text says "add one mana"; that alone isn't ramp
  for (const n of ["Pitiless Plunderer", "Professional Face-Breaker", "Grim Hireling", "Deadly Dispute"])
    assert.ok(!roles(n).ramp, n + " isn't ramp");
  // altars are sacrifice outlets
  assert.ok(!roles("Phyrexian Altar").ramp && !roles("Ashnod's Altar").ramp);
  // Treasure every turn, or with each land, still counts
  for (const n of ["Generous Plunderer", "Black Market Connections", "Tireless Provisioner", "Sol Ring", "Talisman of Conviction"])
    assert.ok(roles(n).ramp, n + " is ramp");
  // Treasure for an opponent, and a land swap, aren't ramp
  assert.ok(!roles("An Offer You Can't Refuse").ramp && !roles("Crop Rotation").ramp);
  assert.ok(roles("An Offer You Can't Refuse").removal, "still a counterspell");
  assert.equal(zurgoProfile.roleCount.ramp, 10);
  assert.ok(zimoneProfile.roleCount.ramp >= 14 && zimoneProfile.roleCount.ramp <= 16, "Zimone ramp " + zimoneProfile.roleCount.ramp);
  // other roles read the same with or without reminder text
  assert.equal(zurgoProfile.roleCount.draw, 14);
  assert.equal(zimoneProfile.roleCount.removal, 9);
});

test("cycle 9: land creatures are lands", () => {
  const arbor = CS.cardTraits(fakeCard("Dryad Arbor", "Land Creature \u2014 Forest Dryad", "", 0));
  assert.ok(arbor.land);
  assert.deepEqual(arbor.roles, {});
  const elf = CS.cardTraits(fakeCard("Llanowar Elves", "Creature \u2014 Elf Druid", "{T}: Add {G}.", 1));
  assert.ok(!elf.land && elf.roles.ramp);
});

test("cycle 9: blink flips face-down cards", () => {
  const t = (n) => CS.cardTraits(byName(zimoneSlims, n));
  assert.ok(t("Deadeye Navigator").wants.facedown, "exile ~, then return it");
  assert.ok(t("Essence Flux").wants.facedown);
  assert.ok(!t("Sol Ring").wants.facedown);
});

test("cycle 9: cut ideas don't call plan cards off the plan", () => {
  const ideas = CS.cutSuggestions(zimoneProfile, zimoneSyn, zimoneSlims, {});
  for (const n of ["Roil Elemental", "Deadeye Navigator", "Brine Elemental"]) {
    const i = ideas.find((x) => x.name === n);
    if (i) assert.ok(!i.reasons.some((r) => /isn't part of the deck's plan/.test(r)), n + ": " + i.reasons.join("; "));
  }
  // a 6+ drop with none of the plan's labels still gets the reason
  const zIdeas = CS.cutSuggestions(zurgoProfile, CS.deckSynergy(zurgoProfile, deckSlims), deckSlims, {});
  assert.ok(!zIdeas.some((i) => /^Ramp: 19/.test(i.reasons.join(" "))), "ramp no longer reads 19");
  // one-plan engine cards: gentler words
  const guile = ideas.find((x) => x.name === "Mirri's Guile");
  if (guile && /Weak fit/.test(guile.reasons[0]))
    assert.ok(/ties in to your commander, little else/.test(guile.reasons[0]), guile.reasons[0]);
  // land bouncers and other cards that feed the commander rank below a surplus role card
  const top3 = ideas.slice(0, 3).map((i) => i.name);
  assert.ok(!top3.includes("Quirion Ranger") && !top3.includes("Burgeoning"), top3.join(", "));
});

// ---------------------------------------------------------------- cycle 10: five-deck check
// Real cards from five decks (Zimone, Hamza, Borborygmos Enraged,
// Eight-and-a-Half-Tails, Henzie) where the app and a hand review disagreed.
const five = JSON.parse(read("scryfall_five_decks.json")).data;
const fiveSlims = five.map(CS.slimCard);
const card5 = (n) => {
  const c = byName(fiveSlims, n);
  assert.ok(c, "fixture has " + n);
  return c;
};
const traits5 = (n) => CS.cardTraits(card5(n));
const profile5 = (cmd, names) => CS.deckProfile([cmd].concat(names).map(card5), cmd);

test("cycle 10: a flavor-name printing counts under its real name", () => {
  const p = CS.parseExport("1 Henzie \"Toolbox\" Torre (NCC) 102\n1 Ya viene el coco (SLD) 7027");
  const raw = five.find((c) => c.name === "Tibalt's Trickery");
  const m = CS.matchCollection(p.cards, [raw]);
  const names = CS.matchedNameSet(p.cards, m);
  assert.ok(names[CS.nameKey("Tibalt's Trickery")], "Scryfall's name is in the set");
  assert.ok(names[CS.nameKey("Ya viene el coco")], "the export's name stays too");
  const page = { container: { json_dict: { cardlists: [{ tag: "instants", cardviews: [{ id: raw.id, name: "Tibalt's Trickery", num_decks: 5, potential_decks: 10 }] }] } } };
  assert.equal(CS.buildEdhrecPiles(page, names).length, 0, "not recommended back");
});

test("cycle 10: printings Scryfall can't find by number get a name retry", () => {
  const p = CS.parseExport("1 Tireless Provisioner (PLIST) 789\n1 Sol Ring (2ED) 270\n1 Forest");
  const sol = { set: "2ed", collector_number: "270", name: "Sol Ring", id: "x" };
  assert.deepEqual(CS.retryIdentifiers(p.cards, [sol]), [{ name: "Tireless Provisioner" }]);
  assert.deepEqual(CS.retryIdentifiers(p.cards, [sol, { set: "plist", collector_number: "789" }]), []);
});

test("cycle 10: roles the regexes missed", () => {
  for (const n of ["Utopia Sprawl", "Wild Growth"]) {
    const t = traits5(n);
    assert.ok(t.roles.ramp, n + " is ramp");
    assert.ok(!t.gives.gear, n + " isn't Equipment or an Aura worth carrying");
  }
  assert.ok(traits5("Sylvan Library").roles.draw, "draw two additional cards");
  assert.ok(traits5("Wheel of Fortune").roles.draw && traits5("Wheel of Fortune").gives.graveyard);
  assert.ok(traits5("Council's Judgment").roles.removal);
  assert.ok(traits5("Glare of Heresy").roles.removal, "exile target white permanent");
  assert.ok(traits5("Hapatra, the Desert Fang").roles.removal, "-1/-1 counters on a target creature");
  assert.ok(traits5("Wasteland Raider").roles.removal, "each player sacrifices a creature");
  assert.ok(traits5("Avatar's Wrath").roles.wipes && traits5("Living Death").roles.wipes);
  assert.ok(traits5("Living Death").gives.deaths && traits5("Living Death").wants.deaths);
});

test("cycle 10: +1/+1 counter doublers, movers and 'a counter on it'", () => {
  for (const n of ["Hardened Scales", "Conclave Mentor", "Ozolith, the Shattered Spire"])
    assert.ok(traits5(n).gives.counters && traits5(n).wants.counters, n);
  assert.ok(traits5("The Ozolith").gives.counters && traits5("The Ozolith").wants.counters);
  assert.ok(traits5("Rishkar, Peema Renegade").wants.counters, "with a counter on it");
  // counting creatures that have counters isn't going wide
  assert.ok(!traits5("Inspiring Call").wants.bodies);
  assert.ok(!traits5("Hamza, Guardian of Arashin").wants.bodies);
});

test("cycle 10: lands in the graveyard and lands in hand", () => {
  assert.ok(traits5("Wooded Foothills").gives.landyard, "a fetch land ends in the graveyard");
  assert.ok(traits5("Tranquil Thicket").gives.landyard, "a cycling land");
  for (const n of ["Zuran Orb", "Sylvan Safekeeper", "Orcish Lumberjack"]) assert.ok(traits5(n).gives.landyard, n);
  for (const n of ["Crucible of Worlds", "Ramunap Excavator", "Life from the Loam", "Marwyn, the Preserver"])
    assert.ok(traits5(n).wants.landyard, n);
  const b = traits5("Borborygmos Enraged");
  assert.ok(b.gives.landyard && b.wants.landhand && b.gives.landhand);
  assert.ok(traits5("Life from the Loam").gives.landhand);
  assert.ok(b.gives.discard && traits5("Tranquil Thicket").gives.discard && traits5("Wheel of Fortune").gives.discard, "discarding");
  const prof = profile5("Borborygmos Enraged", ["Life from the Loam", "Crucible of Worlds", "Zuran Orb", "Wooded Foothills"]);
  assert.ok(CS.fitScore(card5("Ramunap Excavator"), prof).score >= 50, "Ramunap ties in");
});

test("cycle 10: color tricks and taxes", () => {
  assert.ok(traits5("Eight-and-a-Half-Tails").gives.color && traits5("Painter's Servant").gives.color);
  for (const n of ["Glare of Heresy", "Gideon's Defeat", "Circle of Protection: White", "Earnest Fellowship", "Mother of Runes"])
    assert.ok(traits5(n).wants.color, n);
  assert.ok(!traits5("Endurance").wants.color, "exiling a green card to evoke isn't a color payoff");
  for (const n of ["Thalia, Guardian of Thraben", "Esper Sentinel", "Ghostly Prison", "Aven Mindcensor"])
    assert.ok(traits5(n).gives.stax && traits5(n).wants.stax, n);
  const prof = profile5("Eight-and-a-Half-Tails", ["Painter's Servant", "Glare of Heresy", "Thalia, Guardian of Thraben", "Esper Sentinel"]);
  assert.ok(CS.fitScore(card5("Circle of Protection: White"), prof).score >= 30);
  const kit = CS.fitScore(card5("Pious Kitsune"), prof);
  assert.ok(kit.reasons.some((r) => /^Names Eight-and-a-Half-Tails/.test(r)), kit.reasons.join("; "));
});

test("cycle 10: Equipment, tutors for it, and what keeps one creature alive", () => {
  assert.ok(traits5("Stoneforge Mystic").wants.gear, "searches for an Equipment card");
  assert.ok(traits5("Sword of Fire and Ice").wants.protect && traits5("Worship").wants.protect);
  assert.ok(traits5("Mother of Runes").gives.protect);
  assert.ok(traits5("Martyr of Sands").gives.lifegain && traits5("Serra Ascendant").wants.lifegain);
  assert.ok(traits5("Prehistoric Pet").gives.blink, "bouncing your own creature re-uses its enter trigger");
});

test("cycle 10: commanders that help cast big creatures", () => {
  assert.deepEqual(CS.commanderHooks(card5("Henzie \"Toolbox\" Torre")), { castMin: 4, oneTurn: true });
  assert.deepEqual(CS.commanderHooks(card5("Hamza, Guardian of Arashin")), { castMin: 4 });
  assert.deepEqual(CS.commanderHooks(card5("Eight-and-a-Half-Tails")), {});
  const prof = profile5("Henzie \"Toolbox\" Torre", ["Gray Merchant of Asphodel", "Massacre Wurm", "Greater Good", "Llanowar Elves"]);
  const gray = prof.cards.find((c) => c.name === "Gray Merchant of Asphodel");
  assert.ok(gray.gives.cast && gray.gives.oneturn, "a 5-drop with an enter trigger");
  const elf = prof.cards.find((c) => c.name === "Llanowar Elves");
  assert.ok(!elf.gives.cast, "a 1-drop isn't");
  const chupa = CS.fitScore(card5("Ravenous Chupacabra"), prof);
  assert.ok(chupa.score >= 40 && /^Works with Henzie/.test(chupa.reasons[0]), chupa.score + " " + chupa.reasons.join("; "));
  const hz = profile5("Hamza, Guardian of Arashin", ["Rishkar, Peema Renegade", "Good-Fortune Unicorn"]);
  assert.ok(CS.fitScore(card5("Ghalta, Primal Hunger"), hz).links.cast, "Hamza makes Ghalta cheaper");
});

test("cycle 10: cut ideas", () => {
  // the Game Changer reason says how many and what that means
  const bor = ["Borborygmos Enraged", "Life from the Loam", "Crucible of Worlds", "Zuran Orb", "Wheel of Fortune", "Endurance", "Tireless Provisioner"];
  const slims = bor.map(card5);
  const prof = CS.deckProfile(slims, "Borborygmos Enraged");
  const syn = CS.deckSynergy(prof, slims);
  CS.cutSuggestions(prof, syn, slims, {}).forEach((i) =>
    i.reasons.filter((r) => /Game Changer/.test(r)).forEach((r) => assert.match(r, /the deck has \d+/)));
  const crop = CS.cutSuggestions(zimoneProfile, zimoneSyn, zimoneSlims, {}).find((i) => i.name === "Crop Rotation");
  assert.ok(crop && crop.reasons.includes("Game Changer: the deck has 3 (any means bracket 3 or higher)"), crop && crop.reasons.join("; "));
  // over three Game Changers: bracket 4
  const gcSlims = zimoneSlims.map((s, i) => (i > 0 && i < 6 ? Object.assign({}, s, { gameChanger: true }) : s));
  const gcIdeas = CS.cutSuggestions(zimoneProfile, zimoneSyn, gcSlims, {});
  assert.ok(gcIdeas.some((i) => i.reasons.some((r) => /^Game Changer: the deck has \d+ \(over 3 means bracket 4\)$/.test(r))));
  // a role card a little over the usual count isn't a surplus; a strong-fit one isn't cut for it
  const zIdeas = CS.cutSuggestions(zimoneProfile, zimoneSyn, zimoneSlims, {});
  assert.ok(!zIdeas.some((i) => /^Removal: 9/.test(i.reasons.join(" "))), "9 removal (8 typical) isn't a surplus");
  for (const n of ["Burgeoning", "Quirion Ranger", "Sylvan Library"])
    assert.ok(!zIdeas.some((i) => i.name === n), n + " feeds Zimone (or is card draw)");
  assert.ok(zIdeas.every((i) => i.fit < zimoneSyn.score || !/lower than most/.test(i.reasons[0])));
});

// ---------------------------------------------------------------- cycle 11: 20 strategies, 47 decks
// Real cards from the cycle 11 benchmark where the hand review and the app disagreed.
const c11 = JSON.parse(read("scryfall_c11_strategies.json")).data.map(CS.slimCard);
const card11 = (n) => {
  const c = c11.find((x) => x.name === n || x.name.startsWith(n + ",") || x.name.split(" // ")[0] === n);
  assert.ok(c, "fixture has " + n);
  return c;
};
const t11 = (n) => CS.cardTraits(card11(n));
const prof11 = (cmd, names) => CS.deckProfile([cmd].concat(names).map(card11), card11(cmd).name);

test("cycle 11: death payoffs, tokens you make, self-mill", () => {
  assert.ok(t11("Zulaport Cutthroat").wants.deaths, "~ or another creature you control dies");
  assert.ok(t11("Massacre Wurm").wants.deaths, "a creature an opponent controls dies");
  assert.ok(t11("Plague of Vermin").gives.bodies, "each player creates");
  assert.ok(!t11("Beast Within").gives.fodder, "its controller creates: not your token");
  assert.ok(t11("Grisly Salvage").gives.graveyard && t11("Mesmeric Orb").gives.graveyard);
});

test("cycle 11: opponents drawing, drawing, draining", () => {
  const sh = t11("Sheoldred, the Apocalypse");
  assert.ok(sh.wants.drawing && sh.wants.oppdraw && sh.gives.drain);
  assert.ok(t11("Howling Mine").gives.oppdraw && t11("Nekusar, the Mindrazer").gives.oppdraw);
  assert.ok(t11("Exquisite Blood").wants.drain && t11("Bloodchief Ascension").wants.drain);
  // card draw is Sheoldred's plan, so a pile of draw isn't a surplus
  const names = ["Howling Mine", "Bloodchief Ascension", "Exquisite Blood", "Sol Ring", "Mesmeric Orb"];
  const slims = ["Sheoldred, the Apocalypse"].concat(names).map(card11);
  const prof = CS.deckProfile(slims, "Sheoldred, the Apocalypse");
  prof.roleCount.draw = 30;
  const ideas = CS.cutSuggestions(prof, CS.deckSynergy(prof, slims), slims, {});
  assert.ok(!ideas.some((i) => i.reasons.some((r) => /^Card draw:/.test(r))), "no draw surplus");
});

test("cycle 11: opponents sacrificing or discarding (Tergrid)", () => {
  assert.ok(t11("Tergrid").wants.oppsac);
  assert.ok(t11("Smallpox").gives.oppsac && t11("Divest").gives.oppsac);
  const fit = CS.fitScore(card11("Smallpox"), prof11("Tergrid", ["Divest"]));
  assert.ok(fit.score >= 30 && /^Works with Tergrid/.test(fit.reasons[0]), fit.score + " " + fit.reasons.join("; "));
});

test("cycle 11: commander hooks for big artifacts and enchantments (Bello)", () => {
  assert.deepEqual(CS.commanderHooks(card11("Bello")), { permMin: 4, permTypes: "both" });
  const p = prof11("Bello", ["Chimil, the Inner Sun", "Sol Ring"]);
  assert.ok(p.commander.wants.animate);
  assert.ok(p.cards.find((c) => c.name === "Chimil, the Inner Sun").gives.animate, "MV 6 artifact");
  assert.ok(!p.cards.find((c) => c.name === "Sol Ring").gives.animate, "MV 1 artifact");
});

test("cycle 11: spells, targeting, X spells, dungeons, Sagas, planeswalker-type labels", () => {
  assert.ok(t11("Ms. Bumbleflower").wants.spells, "whenever you cast a spell");
  assert.ok(t11("Ms. Bumbleflower").gives.targets && t11("Willbreaker").wants.targets && t11("Kros, Defense Contractor").wants.targets);
  assert.ok(t11("Zaxara, the Exemplary").wants.xspells && t11("Torment of Hailfire").gives.xspells);
  assert.ok(t11("Hama Pashar, Ruin Seeker").wants.dungeon && t11("Nadaar, Selfless Paladin").gives.dungeon);
  const saga = t11("The Eldest Reborn");
  assert.ok(saga.gives.sagas && !saga.wants.sagas, "a Saga's own chapters aren't a payoff");
  assert.ok(t11("Tom Bombadil").wants.sagas);
});

test("cycle 11: card types count (artifacts), but not on the commander", () => {
  assert.ok(t11("Sol Ring").gives.artifacts, "an artifact card is an artifact");
  assert.ok(t11("Chiss-Goria, Forge Tyrant").wants.artifacts);
  const g = prof11("Giada, Font of Hope", ["Cathars' Crusade"]);
  assert.ok(!g.commander.gives.etb, "the commander being a creature doesn't feed 'creatures entering'");
  assert.ok(t11("Panharmonicon").wants.blink && t11("Panharmonicon").wants.etb);
});

test("cycle 11: noncombat damage, evasion, attack triggers", () => {
  assert.ok(t11("Ojer Axonil").wants.burn && t11("Firebrand Archer").gives.burn);
  assert.ok(t11("Slither Blade").gives.attacks, "can't be blocked");
  const rv = t11("Rottenmouth Viper");
  assert.ok(rv.gives.attacks && rv.wants.attacks, "whenever ~ enters or attacks");
  assert.ok(t11("Satoru Umezawa").wants.attacks && t11("Satoru Umezawa").wants.big, "grants ninjutsu");
  assert.ok(t11("Reyav, Master Smith").wants.gear && t11("Reyav, Master Smith").wants.attacks);
  assert.ok(t11("Isshin, Two Heavens as One").wants.attacks, "a creature attacking causes");
});

test("cycle 11: kindred: land types, changelings, choose-a-type, cut ideas", () => {
  const hz = prof11("Hazezon, Shaper of Sand", ["Sol Ring"]);
  assert.ok(CS.fitScore(card11("Mirage Mesa"), hz).score > 0, "a Desert for a Desert commander");
  const rin = prof11("Rin and Seri, Inseparable", ["Elvish Mystic"]);
  const me = CS.fitScore(card11("Mirror Entity"), rin);
  assert.ok(me.reasons.some((r) => /your deck cares about (Cats|Dogs)/.test(r)), "a changeling is a Cat and a Dog: " + me.reasons.join("; "));
  const elves = ["Elvish Mystic", "Elvish Archdruid", "Llanowar Elves", "Wood Elves"].filter((n) => c11.some((x) => x.name === n));
  const lp = CS.deckProfile(["Lathril, Blade of the Elves"].concat(elves).map(card11), "Lathril, Blade of the Elves");
  for (let i = 0; i < 6; i++) lp.typeCount.elf = (lp.typeCount.elf || 0) + 1; // stand in for a full elf deck
  const vb = CS.fitScore(card11("Vanquisher's Banner"), lp);
  assert.ok(vb.reasons.some((r) => /^Cares about El/.test(r)), "choose a creature type: " + vb.reasons.join("; "));
  // a Dragon in a Dragon commander's deck isn't "off the plan" for costing 6
  const ms = ["Miirym, Sentinel Wyrm", "Lathliss, Dragon Queen", "Dragon Tempest", "Scourge of Valkas", "Sol Ring"].map(card11);
  const mp = CS.deckProfile(ms, "Miirym, Sentinel Wyrm");
  const lath = CS.cutSuggestions(mp, CS.deckSynergy(mp, ms), ms, {}).find((i) => i.name === "Lathliss, Dragon Queen");
  assert.ok(!lath || !lath.reasons.some((r) => /isn't part of the deck's plan/.test(r)), lath && lath.reasons.join("; "));
});

test("cycle 11: token doublers, lands from hand, protection wordings", () => {
  assert.ok(t11("Parallel Lives").wants.bodies);
  assert.ok(t11("Burgeoning").wants.landhand && t11("Hakbal of the Surging Soul").gives.landhand, "explore puts lands in hand");
  assert.ok(t11("Loran's Escape").roles.protection, "target artifact or creature gains hexproof");
  assert.ok(t11("Meren of Clan Nel Toth").gives.blink, "returning a creature card re-uses its enter trigger");
});

test("cycle 11: the deck panel lists the commander's own plan first", () => {
  const names = ["Smallpox", "Divest", "Plague of Vermin", "Zulaport Cutthroat", "Massacre Wurm", "Grisly Salvage"];
  const slims = ["Tergrid, God of Fright // Tergrid's Lantern"].concat(names).map(card11);
  const prof = CS.deckProfile(slims, slims[0].name);
  const plan = CS.deckSynergy(prof, slims).plan.map((p) => p.label);
  assert.ok(plan.indexOf("oppsac") !== -1, plan.join(","));
  const firstOther = plan.findIndex((l) => !prof.commander.wants[l]);
  assert.ok(firstOther === -1 || plan.indexOf("oppsac") < firstOther, plan.join(","));
  // a smaller plan the commander wants still comes before a bigger one it doesn't
  // a bigger plan the commander doesn't want (attacking, 4 and 4) still comes after it
  prof.cards.filter((c) => !c.commander).slice(0, 4).forEach((c) => {
    c.gives.attacks = true;
    c.wants.attacks = true;
  });
  const plan2 = CS.deckSynergy(prof, slims).plan.map((p) => p.label);
  assert.ok(plan2.indexOf("oppsac") < plan2.indexOf("attacks"), plan2.join(","));
});
