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
  assert.ok(all.every((c) => !("usd" in c)), "cycle 29: no price kept");
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

test("filters: Game Changers hidden by default, types; price never filters (cycle 29)", () => {
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
  assert.equal(CS.passesFilters(golem, { ...d, maxPrice: 10 }), true, "an old saved max price does nothing");
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
// Spellbook). Cycle 28: a fixed copy of the 2026-11-17 file, so refreshing
// the live combos/ files (as every benchmark now does) can't move the tests.
const comboFile = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "combos_zurgo_2026-11-17.json"), "utf8"),
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
  // cycle 15: 3 without EDHREC numbers (Reconnaissance feeds Zurgo's attacks)
  // cycle 23: 2 (Dark Prophecy draws on every death: an engine that ties in isn't spare card draw)
  // cycle 31: 1 (Reconnaissance makes Zurgo's attacks free: attack help, no longer a weak tie-in)
  assert.ok(ideas.length >= 1, ideas.length);
  assert.ok(!names.includes("Reconnaissance"), "cycle 31: Reconnaissance isn't a cut idea in a deck full of attack triggers");
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
  // cycle 31: one idea left in this deck, so protecting and cutting are checked one at a time
  const kept = CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, { protect: { [CS.nameKey(first)]: true } }).map((x) => x.name);
  const gone = CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, { cuts: { [first]: 1 } }).map((x) => x.name);
  assert.ok(!kept.includes(first) && !gone.includes(first));
  assert.equal(kept.length, ideas.length - 1);
  assert.equal(gone.length, ideas.length - 1);
  assert.deepEqual(
    CS.cutSuggestions({ cards: [], roleCount: {} }, null, [], null),
    [],
  );
});

test("swap ideas: same job first; a land pairs with a basic", () => {
  // cycle 18: protection is never surplus now, so the swap pool (CS.cutCandidates, as the page uses) supplies one
  // (role cards only: among cards with a job, the same job comes first)
  const sugg = CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, {}); // the land checks below use the cut ideas, as before
  const ideas = CS.cutCandidates(zurgoProfile, zurgoSyn, zurgoSlims, {}).filter((x) => x.roles.length);
  const protCut = ideas.find((x) => x.roles.includes("protection"));
  assert.ok(
    protCut,
    "the Zurgo deck has a protection card among its swap candidates",
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
  assert.ok(swaps.length >= 1 && swaps.length <= 5); // cycle 16: up to 5, so the prompt has other options
  assert.match(swaps[0].why, /same job \(protection\)/);
  const land = recScry.data
    .map(CS.slimCard)
    .find((c) => /^Land/.test(c.typeLine));
  // cycle 15: like for like; a land never pairs with a spell while the deck has its lands
  const landSwaps = CS.swapSuggestions(
    land,
    sugg,
    zurgoProfile,
    parsed.cards,
    {},
  );
  assert.ok(landSwaps.length >= 1);
  // cycle 26: the land target now weighs mana value and cheap ramp and draw (Karsten), so Zurgo's 32 lands at
  // its curve count as short: a new land takes a spell's place. A deck with its lands still swaps land for land.
  const zl = CS.landCount(zurgoProfile, parsed.cards, {}, zurgoSlims);
  if (zl.count >= zl.target - 4) assert.ok(landSwaps.every((x) => CS.isBasicLand(x.name) && x.id === null), JSON.stringify(landSwaps));
  else assert.ok(landSwaps[0].id !== null && !CS.isBasicLand(landSwaps[0].name), JSON.stringify(zl) + JSON.stringify(landSwaps));
  // with both Mountains cut the deck is down to 30 of its 32 lands (about 36 typical):
  // now the new land takes a spell's place, and no Mountain is offered
  const shortSwaps = CS.swapSuggestions(land, sugg, zurgoProfile, parsed.cards, { Mountain: 2 });
  assert.ok(!shortSwaps.some((x) => x.name === "Mountain"), "both Mountains are cut already");
  assert.ok(shortSwaps[0] && shortSwaps[0].id !== null && !CS.isBasicLand(shortSwaps[0].name), JSON.stringify(shortSwaps));
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
  // cycle 18: a search for any land card (Crop Rotation, Elvish Reclaimer find Dark Depths) is a tutor;
  // fetching a basic land type (fetch lands, Farseek) still isn't
  assert.deepEqual(
    zimoneProfile.cards.filter((c) => c.roles.tutors).map((c) => c.name).sort(),
    ["Crop Rotation", "Elvish Reclaimer"],
    "only any-land searches count as tutoring",
  );
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
  if (bsIdea) assert.ok(!bsIdea.reasons.some((r) => /isn't part of the deck's plan|\(tie-in \d+ of 100\)/.test(r)), bsIdea.reasons.join("; "));
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
  // cycle 23: putting a land from your hand onto the battlefield is ramp too (Sakura-Tribe Scout, Burgeoning)
  assert.ok(zimoneProfile.roleCount.ramp >= 17 && zimoneProfile.roleCount.ramp <= 19, "Zimone ramp " + zimoneProfile.roleCount.ramp);
  // other roles read the same with or without reminder text
  assert.equal(zurgoProfile.roleCount.draw, 14);
  assert.equal(zimoneProfile.roleCount.removal, 8); // cycle 19: Ulamog's cast trigger is a side job (Zimone puts it into play)
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
  if (guile && /\(tie-in \d+ of 100\)/.test(guile.reasons[0]))
    assert.ok(/Works with your commander but little else/.test(guile.reasons[0]), guile.reasons[0]);
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
  const cropC = CS.cutCandidates(zimoneProfile, zimoneSyn, zimoneSlims, {}).find((i) => i.name === "Crop Rotation");
  assert.ok(cropC && cropC.reasons.includes("Game Changer: the deck has 3 (any means bracket 3 or higher)"), cropC && cropC.reasons.join("; "));
  // cycle 15 (Nick: strong cards aren't held back): up to 3 Game Changers is
  // a note, not a reason to cut on its own
  const crop = CS.cutSuggestions(zimoneProfile, zimoneSyn, zimoneSlims, {}).find((i) => i.name === "Crop Rotation");
  assert.ok(!crop || crop.reasons.some((r) => !/^Game Changer/.test(r)), crop && crop.reasons.join("; "));
  // over three Game Changers: bracket 4
  // cycle 23: Zimone's rocks are no longer spare ramp (a lands deck makes lots of mana), so mark a card that is a cut idea
  const firstIdea = CS.cutSuggestions(zimoneProfile, zimoneSyn, zimoneSlims, {})[0];
  const gcSlims = zimoneSlims.map((s, i) => ((i > 0 && i < 5) || s.id === firstIdea.id ? Object.assign({}, s, { gameChanger: true }) : s));
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

// ---------------------------------------------------------------- cycle 12: five decks + the hold-out test
// Real cards from the cycle 12 benchmark (Sauron, Gishath, Queen Marchesa,
// The Emperor of Palamecia, Dionus) where the hand review and the app disagreed.
const c12 = JSON.parse(read("scryfall_c12_decks.json")).data.map(CS.slimCard);
const card12 = (n) => {
  const c = c12.find((x) => x.name === n || x.name.split(" // ")[0] === n || x.name.startsWith(n + ",") || x.name.startsWith(n));
  assert.ok(c, "fixture has " + n);
  return c;
};
const t12 = (n) => CS.cardTraits(card12(n));
const prof12 = (cmd, names) => CS.deckProfile([cmd].concat(names).map(card12), card12(cmd).name);

test("cycle 12: the Ring and Armies (Sauron)", () => {
  const sauron = t12("Sauron, the Dark Lord");
  assert.ok(sauron.wants.ring && sauron.gives.ring && sauron.wants.army && sauron.gives.army);
  const naz = t12("Nazg");
  assert.ok(naz.gives.ring && naz.wants.ring, "Nazgul tempts and pays it off");
  assert.ok(t12("Call of the Ring").gives.ring && t12("Ringsight").gives.ring);
  assert.ok(t12("March from the Black Gate").gives.army && t12("March from the Black Gate").wants.army);
  const fit = CS.fitScore(card12("Ringsight"), prof12("Sauron, the Dark Lord", ["Nazg", "Call of the Ring"]));
  assert.ok(fit.score >= 40 && /^Works with Sauron: the Ring/.test(fit.reasons[0]), fit.score + " " + fit.reasons.join("; "));
});

test("cycle 12: an opponent-cast trigger is a tax only with a cost or a punishment", () => {
  assert.ok(!t12("Sauron, the Dark Lord").gives.stax, "amassing on their spells isn't a tax");
  assert.ok(t12("Kambal").gives.stax, "Kambal still punishes noncreature spells");
});

test("cycle 12: the monarch and keeping attackers away (Queen Marchesa)", () => {
  const qm = t12("Queen Marchesa");
  assert.ok(qm.gives.monarch && qm.wants.monarch && qm.wants.deter);
  assert.ok(t12("Court of Grace").gives.monarch);
  ["Ghostly Prison", "Deflecting Palm", "Brash Taunter", "Selfless Squire", "Curse of Opulence", "Karazikar"].forEach((n) =>
    assert.ok(t12(n).gives.deter, n + " keeps attackers off you"),
  );
  assert.ok(t12("Karazikar").wants.deter, "pays off opponents attacking each other");
  assert.ok(t12("Deflecting Palm").gives.burn && t12("Brash Taunter").gives.burn, "reflected damage hits an opponent");
  assert.ok(t12("Loran of the Third Path").gives.oppdraw, "you and target opponent each draw");
  // Forced Fruition: "that player draws seven cards" (cycle 12 moved it off the tax label)
  assert.ok(CS.cardTraits({ name: "Forced Fruition", text: "Whenever an opponent casts a spell, that player draws seven cards.", types: "Enchantment" }).gives.oppdraw);
  const fit = CS.fitScore(card12("Ghostly Prison"), prof12("Queen Marchesa", ["Court of Grace", "Brash Taunter"]));
  assert.ok(fit.score >= 40 && /^Works with Queen Marchesa/.test(fit.reasons[0]), fit.score + " " + fit.reasons.join("; "));
});

test("cycle 12: noncreature spells with 4+ mana spent (The Emperor of Palamecia)", () => {
  assert.ok(t12("The Emperor of Palamecia").wants.bigspell && t12("Tellah").wants.bigspell);
  assert.ok(t12("Thran Dynamo").gives.bigspell && t12("Fact or Fiction").gives.bigspell, "4-mana noncreature cards");
  assert.ok(t12("Read the Runes").gives.bigspell, "an X spell can have 4 mana spent");
  assert.ok(!t12("Sol Ring").gives.bigspell && !t12("Tellah").gives.bigspell, "cheap spells and creatures don't");
  assert.ok(t12("Spellheart Chimera").wants.spells, "counts instants and sorceries in your graveyard");
  const fit = CS.fitScore(card12("Thran Dynamo"), prof12("The Emperor of Palamecia", ["Fact or Fiction", "Read the Runes"]));
  assert.ok(fit.score >= 30 && /^Works with The Emperor of Palamecia/.test(fit.reasons[0]), fit.score + " " + fit.reasons.join("; "));
});

test("cycle 12: tapping your creatures (Dionus)", () => {
  assert.ok(t12("Dionus").wants.tap);
  ["Smuggler's Copter", "Dawnsire", "Llanowar Elves", "Symbiotic Deployment"].forEach((n) => assert.ok(t12(n).gives.tap, n + " taps creatures"));
  assert.ok(!t12("Kinjalli's Sunwing").gives.tap, "a creature with no tap ability doesn't");
});

test("cycle 12: Gishath reveals the top; a Dinosaur isn't a cut idea for low Fit; costly commanders want more ramp", () => {
  assert.ok(t12("Gishath").wants.top && t12("Scroll Rack").gives.top);
  assert.ok(t12("Don't Move").roles.wipes, "destroy all tapped creatures");
  const ramp = ["Wood Elves", "Kodama's Reach", "Farseek", "Skyshroud Claim", "Three Visits", "Sakura-Tribe Elder", "Sol Ring", "Topiary Stomper", "Hulking Raptor", "Delighted Halfling", "Mirari's Wake", "Regal Behemoth", "Wayward Swordtooth", "Patchwork Banner", "Springbloom Druid"];
  const names = ramp.concat(["Kinjalli's Sunwing", "Agonasaur Rex", "Scroll Rack"]);
  const slims = ["Gishath, Sun's Avatar"].concat(names).map(card12);
  const prof = CS.deckProfile(slims, card12("Gishath").name);
  const syn = CS.deckSynergy(prof, slims);
  const ideas = CS.cutSuggestions(prof, syn, slims, {});
  assert.ok(!ideas.some((i) => i.reasons.some((r) => /^Ramp:/.test(r))), "15 ramp is right for an 8-mana commander");
  // a Dinosaur with an ordinary Fit below the deck's average gets no reasonless
  // "lower than most" idea (a weak-fit one still can, like Temple Altisaur)
  const kin = card12("Kinjalli's Sunwing");
  const syn2 = Object.assign({}, syn, { score: 70, fits: Object.assign({}, syn.fits, { [kin.id]: 45 }) });
  const ideas2 = CS.cutSuggestions(prof, syn2, slims, {});
  assert.ok(!ideas2.some((i) => i.name === kin.name), ideas2.map((i) => i.name + ": " + i.reasons.join("; ")).join(" | "));
});

test("cycle 12: roles and labels from the five-deck review", () => {
  assert.ok(t12("Ruby Medallion").roles.ramp, "cost reducers are ramp");
  assert.ok(t12("Chaos Warp").roles.removal && t12("Ol").roles.removal, "Chaos Warp; each opponent exiles a creature");
  assert.ok(t12("Springbloom Druid").roles.ramp && !t12("Crop Rotation").roles.ramp, "two lands for one is ramp; one for one isn't");
  assert.ok(t12("Rhythm of the Wild").gives.attacks, "riot");
  assert.ok(t12("Congregate").gives.lifegain, "target player gains life");
});

test("cycle 12: recScore orders the Best for your deck pile", () => {
  const e = (inc, syn) => ({ onEdhrec: true, inclusion: inc, synergy: syn });
  const s = card12("Sol Ring");
  assert.ok(CS.recScore(20, e(0.6, 0.1), s) > CS.recScore(95, e(0.2, 0.1), s), "how often it's played leads");
  assert.ok(CS.recScore(90, e(0.3, 0.2), s) > CS.recScore(10, e(0.3, 0.2), s), "Fit breaks near ties");
  assert.ok(CS.recScore(100, null, s) < CS.recScore(0, e(0.25, 0), s), "a card EDHREC doesn't list sits below one it lists at 25%");
  assert.ok(CS.recScore(80, null, { edhrecRank: 5 }) > CS.recScore(80, null, { edhrecRank: 20000 }), "off the page: more played overall first");
  assert.equal(CS.recScore(null, null, null), 0);
});

test("cycle 12: one cut idea per card name (nine Nazgul are one choice)", () => {
  const w = card12("Kinjalli's Sunwing");
  const slims = [card12("Sauron, the Dark Lord"), w, Object.assign({}, w, { id: w.id + "-2" }), Object.assign({}, w, { id: w.id + "-3" })];
  const prof = CS.deckProfile(slims, card12("Sauron, the Dark Lord").name);
  const ideas = CS.cutSuggestions(prof, CS.deckSynergy(prof, slims), slims, {});
  assert.equal(ideas.filter((i) => i.name === w.name).length, 1, ideas.map((i) => i.name).join(", "));
});

test("cycle 14: fillCuts gives enough cut ideas to get back to 100", () => {
  const ideas = CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, {});
  const need = ideas.length + 5;
  const all = CS.fillCuts(ideas, zurgoProfile, zurgoSyn, zurgoSlims, {}, need);
  assert.equal(all.length, need, "fills up to what's needed");
  assert.deepEqual(all.slice(0, ideas.length).map((x) => x.name), ideas.map((x) => x.name), "the real ideas come first, unchanged");
  const fill = all.slice(ideas.length);
  assert.ok(fill.every((x) => x.filler && x.score === 0 && x.reasons.length), "fillers are marked and have a reason");
  const cmd = zurgoProfile.cards.filter((c) => c.commander)[0].name;
  const lands = new Set(zurgoProfile.cards.filter((c) => c.land).map((c) => c.name));
  const every = CS.fillCuts(ideas, zurgoProfile, zurgoSyn, zurgoSlims, {}, 500); // asks for more than the deck has
  assert.ok(every.length > need && !every.some((x) => x.name === cmd || lands.has(x.name)), "never the commander or a land, even when asked for everything");
  assert.equal(new Set(all.map((x) => CS.nameKey(x.name))).size, all.length, "no card twice");
  const nonRole = fill.filter((x) => !x.roles.length);
  for (let i = 1; i < nonRole.length; i++)
    assert.ok((nonRole[i - 1].fit == null ? 101 : nonRole[i - 1].fit) <= (nonRole[i].fit == null ? 101 : nonRole[i].fit), "lowest Fit first");
  // protected combo pieces and cards already cut are left out
  const first = fill[0].name;
  const cut = CS.fillCuts(ideas, zurgoProfile, zurgoSyn, zurgoSlims, { cuts: { [first]: 1 } }, need);
  assert.ok(!cut.some((x) => x.name === first), "a card already cut isn't offered");
  const prot = CS.fillCuts(ideas, zurgoProfile, zurgoSyn, zurgoSlims, { protect: { [CS.nameKey(first)]: true } }, need);
  assert.ok(!prot.some((x) => x.name === first), "a protected combo piece isn't offered");
  // enough ideas already: unchanged
  assert.deepEqual(CS.fillCuts(ideas, zurgoProfile, zurgoSyn, zurgoSlims, {}, 1).map((x) => x.name), ideas.map((x) => x.name));
  assert.deepEqual(CS.fillCuts(ideas, zurgoProfile, zurgoSyn, zurgoSlims, {}, 0).length, ideas.length);
});

// ---------------------------------------------------------------- cycle 15: strength, one cut model, missed synergies
const fc = (name, type, text, cmc, extra) =>
  Object.assign(CS.slimCard({ id: "c15-" + name, name: name, type_line: type, oracle_text: text, cmc: cmc, color_identity: [] }), extra || {});

test("cycle 15: strength scores what the power sites score", () => {
  const sol = fc("Sol Ring", "Artifact", "{T}: Add {C}{C}.", 1, { edhrecRank: 1 });
  const signet = fc("Arcane Signet", "Artifact", "{T}: Add one mana of any color in your commander's color identity.", 2, { edhrecRank: 3 });
  const cult = fc("Cultivate", "Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.", 3, { edhrecRank: 30 });
  const swords = fc("Swords", "Instant", "Exile target creature. Its controller gains life equal to its power.", 1, { edhrecRank: 20 });
  const murder = fc("Murder", "Instant", "Destroy target creature.", 3, { edhrecRank: 400 });
  const chupa = fc("Chupacabra", "Creature \u2014 Horror", "When Chupacabra enters, destroy target creature an opponent controls.", 4, { edhrecRank: 400 });
  const vanilla = fc("Vanilla", "Creature \u2014 Bear", "", 2, { edhrecRank: 20000 });
  const st = (c) => CS.strength(c).score;
  assert.ok(st(sol) > st(signet) && st(signet) > st(cult), [st(sol), st(signet), st(cult)].join(" "));
  assert.ok(CS.strength(sol).reasons.includes("Fast mana"));
  assert.ok(st(swords) > st(murder), "cheap removal beats 3-mana removal");
  assert.match(CS.strength(swords).reasons[0], /^Cheap, flexible interaction at instant speed/);
  assert.ok(st(chupa) > st(murder), "removal with a body");
  assert.ok(st(vanilla) < 20, "a little-played card with no job is weak: " + st(vanilla));
  const gc = Object.assign({}, murder, { gameChanger: true });
  assert.ok(st(gc) > st(murder) && CS.strength(gc).reasons.includes("Game Changer"));
  assert.deepEqual(CS.strength(null), { score: 0, reasons: [] });
  for (const c of [sol, signet, cult, swords, murder, chupa, vanilla]) assert.ok(st(c) >= 0 && st(c) <= 100);
});

test("cycle 15: the shown Fit blends tie-in and strength; strength joins the Best for your deck order", () => {
  const f = { score: 80, reasons: ["a", "b", "c"], links: {} };
  const b = CS.blendFit(f, { score: 30, reasons: ["Cheap ramp"] });
  assert.equal(b.score, Math.round(0.6 * 80 + 0.4 * 30));
  assert.equal(b.tieIn, 80);
  assert.equal(b.strength, 30);
  assert.deepEqual(b.reasons, ["a", "b", "Cheap ramp"], "a strength reason takes the last slot");
  assert.deepEqual(CS.blendFit({ score: 10, reasons: [] }, { score: 0, reasons: [] }).reasons, []);
  assert.equal(f.reasons.length, 3, "the tie-in result isn't changed");
  const e = { onEdhrec: true, inclusion: 0.3, synergy: 0.1 };
  assert.ok(CS.recScore(50, e, null, 90) > CS.recScore(50, e, null, 20), "same EDHREC numbers: the stronger card first");
  assert.ok(CS.recScore(50, e, null, 0) > CS.recScore(100, null, null, 100), "a card EDHREC lists at 30% still beats one it doesn't list");
  const d = CS.deckSynergy(zurgoProfile, deckSlims);
  assert.ok(d.blend > 0 && d.blend <= 100 && Object.keys(d.strengths).length === Object.keys(d.fits).length);
});

test("cycle 15: what a land does", () => {
  const li = (n, t, ty) => CS.landInfo({ name: n, text: t, typeLine: ty || "Land" });
  const hollow = li("Jungle Hollow", "Jungle Hollow enters tapped.\nWhen Jungle Hollow enters, you gain 1 life.\n{T}: Add {B} or {G}.");
  assert.deepEqual([hollow.tapped, hollow.utility, !!hollow.colors.B, !!hollow.colors.G], ["always", false, true, true]);
  assert.equal(li("Blood Crypt", "({T}: Add {B} or {R}.)\nAs Blood Crypt enters, you may pay 2 life. If you don't, it enters tapped.", "Land \u2014 Swamp Mountain").tapped, "sometimes");
  assert.equal(li("Summit", "Summit enters tapped unless you control a Swamp or a Mountain.\n{T}: Add {B} or {R}.").tapped, "sometimes");
  assert.ok(li("Command Tower", "{T}: Add one mana of any color in your commander's color identity.").any);
  const mesa = li("Arid Mesa", "{T}, Pay 1 life, Sacrifice Arid Mesa: Search your library for a Mountain or Plains card, put it onto the battlefield, then shuffle.");
  assert.ok(mesa.colors.R && mesa.colors.W && !mesa.utility && !mesa.tapped);
  assert.ok(li("Bog", "Bog enters tapped.\nWhen Bog enters, exile target player's graveyard.\n{T}: Add {B}.").utility);
  assert.ok(li("Reliquary Tower", "You have no maximum hand size.\n{T}: Add {C}.").utility);
  const lc = CS.landCount(zurgoProfile, parsed.cards, {}, deckSlims);
  assert.equal(lc.count, 32);
  assert.ok(lc.target >= 34 && lc.target <= 38, lc.target);
  assert.equal(CS.landCount(zurgoProfile, parsed.cards, { Mountain: 2, "Command Tower": 1 }, deckSlims).count, 29);
});

// A small two-color deck for the cut model: 36 lands (one always tapped), removal and creatures.
function c15Deck() {
  const cards = [
    fc("Cmdr", "Legendary Creature \u2014 Elf", "Whenever Cmdr attacks, draw a card.", 3, { colorIdentity: ["B", "G"], manaCost: "{1}{B}{G}" }),
    fc("Gate", "Land", "Gate enters tapped.\n{T}: Add {B} or {G}.", 0, { edhrecRank: 3000 }),
    fc("Tower", "Land", "{T}: Add one mana of any color in your commander's color identity.", 0, { edhrecRank: 2 }),
    fc("Doom Blade", "Instant", "Destroy target creature.", 2, { edhrecRank: 300, manaCost: "{1}{B}" }),
    fc("Slow Removal", "Sorcery", "Destroy target creature.", 6, { edhrecRank: 9000, manaCost: "{5}{B}" }),
    fc("Off Plan", "Creature \u2014 Bird", "Flying", 4, { edhrecRank: 15000, manaCost: "{3}{G}" }),
    fc("Bear", "Creature \u2014 Bear", "", 2, { edhrecRank: 12000, manaCost: "{1}{G}" }),
  ];
  for (let i = 0; i < 9; i++) cards.push(fc("Removal " + i, "Instant", "Destroy target creature.", 2, { edhrecRank: 500, manaCost: "{1}{B}" }));
  for (let i = 0; i < 10; i++) cards.push(fc("Ramp " + i, "Artifact", "{T}: Add {B}.", 2, { edhrecRank: 800, manaCost: "{2}" }));
  for (let i = 0; i < 10; i++) cards.push(fc("Draw " + i, "Sorcery", "Draw two cards.", 2, { edhrecRank: 900, manaCost: "{1}{G}" }));
  const lines = cards.map((c) => ({ qty: 1, name: c.name }));
  lines.push({ qty: 17, name: "Swamp" }, { qty: 17, name: "Forest" }); // 11 black pips, 12 green
  const prof = CS.deckProfile(cards, "Cmdr");
  const syn = CS.deckSynergy(prof, cards);
  return { cards, lines, prof, syn, opts: { deckCards: lines, slims: cards } };
}

test("cycle 15: one cut model: like for like, the same job, the land count", () => {
  const d = c15Deck();
  const cands = CS.cutCandidates(d.prof, d.syn, d.cards, d.opts);
  assert.ok(!cands.some((x) => x.name === "Cmdr"), "never the commander");
  const gate = cands.find((x) => x.name === "Gate");
  const tower = cands.find((x) => x.name === "Tower");
  assert.ok(gate.land && gate.cut > tower.cut && gate.reasons.includes("Enters tapped every time"));
  const swap = (card, cuts) => CS.swapSuggestions(card, CS.cutCandidates(d.prof, d.syn, d.cards, Object.assign({}, d.opts, { cuts: cuts || {} })), d.prof, d.lines, cuts || {}, d.opts);
  // a dual land: the tapped land first, and only lands
  const dual = fc("Dual", "Land \u2014 Swamp Forest", "({T}: Add {B} or {G}.)", 0, { edhrecRank: 100 });
  const ls = swap(dual);
  assert.equal(ls[0].name, "Gate", JSON.stringify(ls));
  assert.ok(ls.every((x) => x.name === "Gate" || x.name === "Tower" || CS.isBasicLand(x.name)), JSON.stringify(ls));
  // with the tapped land gone, a basic
  const ls2 = swap(dual, { Gate: 1 });
  assert.ok(CS.isBasicLand(ls2[0].name) && ls2[0].id === null, JSON.stringify(ls2));
  // removal for removal: the slow one, and the new card costs less
  const bolt = fc("Quick Kill", "Instant", "Destroy target creature.", 1, { edhrecRank: 50, manaCost: "{B}" });
  const rs = swap(bolt);
  assert.equal(rs[0].name, "Slow Removal", JSON.stringify(rs));
  assert.match(rs[0].why, /^does the same job \(removal\), and Quick Kill costs less/);
  // the same job wins even when the new card isn't cheaper or stronger
  const big = swap(fc("Big Kill", "Sorcery", "Destroy target creature.", 6, { edhrecRank: 20000, manaCost: "{5}{B}" }));
  assert.equal(big[0].name, "Slow Removal", JSON.stringify(big));
  assert.match(big[0].why, /^does the same job \(removal\), and works less well with this deck$/);
  // a land is offered only lands, even when fewer than 3 are left to offer
  const few = CS.swapSuggestions(dual, CS.cutCandidates(d.prof, d.syn, d.cards, Object.assign({}, d.opts, { protect: { [CS.nameKey("Tower")]: true } })),
    d.prof, d.lines.filter((l) => l.name !== "Forest").concat([{ qty: 17, name: "Swamp" }]), {}, d.opts);
  assert.deepEqual(few.map((x) => x.name).sort(), ["Gate", "Swamp"], JSON.stringify(few));
  // EDHREC can vouch for a land, but a land missing or low on the page isn't marked down for it
  const keepOf = (edh) => CS.cutCandidates(d.prof, d.syn, d.cards, Object.assign({ edhrec: edh }, d.opts)).find((x) => x.name === "Tower").keep;
  const none = keepOf(undefined);
  assert.equal(keepOf({ [CS.nameKey("Tower")]: { inclusion: 0.02 } }), none);
  assert.equal(keepOf({}), none);
  assert.ok(keepOf({ [CS.nameKey("Tower")]: { inclusion: 0.9 } }) > none);
  // a spell never pairs with a land while the deck has its lands
  assert.ok(!swap(fc("Elf", "Creature \u2014 Elf", "", 1, { manaCost: "{G}" })).some((x) => x.id === null || x.name === "Gate"));
  // a deck short on lands: the new land takes a spell's place
  const short = swap(dual, { Swamp: 8 });
  assert.ok(short[0].id !== null && !cands.find((x) => x.name === short[0].name).land, JSON.stringify(short));
});

test("cycle 15: the back-to-100 list gives each pick its own cut, once each", () => {
  const d = c15Deck();
  const cands = CS.cutCandidates(d.prof, d.syn, d.cards, d.opts);
  const dual = fc("Dual", "Land \u2014 Swamp Forest", "({T}: Add {B} or {G}.)", 0);
  const dual2 = fc("Dual 2", "Land \u2014 Swamp Forest", "({T}: Add {B} or {G}.)", 0);
  const kill = fc("Quick Kill", "Instant", "Destroy target creature.", 1, { manaCost: "{B}" });
  const out = CS.cutsForPicks([dual, kill, dual2], cands, d.prof, d.lines, {}, 3, d.opts);
  assert.equal(out.length, 3);
  const by = {};
  out.forEach((x) => (by[x.forName] = x));
  assert.equal(by["Dual 2"].name, "Gate", "newest pick first gets the best match");
  assert.ok(CS.isBasicLand(by["Dual"].name) || by["Dual"].name === "Tower", JSON.stringify(by["Dual"]));
  assert.equal(by["Quick Kill"].name, "Slow Removal");
  assert.equal(by["Quick Kill"].forId, kill.id);
  assert.equal(CS.cutsForPicks([], cands, d.prof, d.lines, {}, 2, Object.assign({ ideas: [{ name: "X", id: "x", reasons: ["r"] }] }, d.opts)).length, 1, "no picks: cut ideas fill in");
});

test("cycle 15: cut ideas weigh EDHREC's numbers and strength, and don't hold strong cards back", () => {
  const d = c15Deck();
  const edh = {};
  edh[CS.nameKey("Doom Blade")] = { inclusion: 0.6 };
  const withE = CS.cutCandidates(d.prof, d.syn, d.cards, Object.assign({ edhrec: edh }, d.opts));
  const off = withE.find((x) => x.name === "Off Plan");
  assert.ok(off.inc === 0 && off.reasons.some((r) => /^Few decks with this commander run it/.test(r)), off.reasons.join("; "));
  assert.ok(withE.find((x) => x.name === "Doom Blade").keep > withE.find((x) => x.name === "Removal 0").keep, "an often-run card is kept over the same card EDHREC doesn't list");
  const ideas = CS.cutSuggestions(d.prof, d.syn, d.cards, Object.assign({ edhrec: edh }, d.opts));
  // cycle 26: 36 lands at a 2.1 curve with 20 cheap ramp and draw is more than Karsten's count, so a land can be a cut idea
  const dl = CS.landCount(d.prof, d.lines, {}, d.cards);
  assert.ok(ideas.length && ideas.every((x) => x.tie < 75 && !x.locked && !x.staple && (!x.land || dl.count > dl.target)), JSON.stringify(dl));
  assert.ok(!ideas.some((x) => x.reasons.length === 1 && /^Few decks with this commander run it/.test(x.reasons[0]) && x.roles.length), "a note alone doesn't make a role card a cut idea");
});

test("cycle 15: missed synergies: evasion, copying abilities, untapping", () => {
  const t = (n, ty, tx, c) => CS.cardTraits(fc(n, ty, tx, c));
  assert.ok(t("Soul", "Creature \u2014 Spirit", "Soul can't block and can't be blocked.", 1).gives.evasion);
  assert.ok(t("Thopter", "Artifact Creature \u2014 Thopter", "Flying", 0).gives.evasion);
  assert.ok(!t("Big", "Creature \u2014 Beast", "Trample", 5).gives.evasion);
  assert.ok(t("Ninja Lord", "Legendary Creature \u2014 Ninja", "Each creature card in your hand has ninjutsu {2}{U}{B}.", 4).wants.evasion);
  assert.ok(t("Spy", "Legendary Creature", "Whenever one or more creatures you control deal combat damage to a player, draw a card.", 3).wants.evasion);
  assert.ok(t("Resonator", "Artifact", "{2}, {T}: Copy target triggered ability you control.", 2).gives.copyab);
  assert.ok(t("Boots", "Legendary Creature", "If a creature you control dealing combat damage to a player causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.", 4).gives.copyab);
  assert.ok(t("Reversal", "Instant", "Untap all nonland permanents you control.", 2).gives.untap);
  assert.ok(t("Rock", "Artifact", "{T}: Add {C}{C}.", 1).wants.untap && !t("Elf", "Creature \u2014 Elf", "{T}: Add {G}.", 1).wants.untap);
  // a commander with a trigger wants it copied, but copying isn't listed as the deck's plan
  assert.ok(zurgoProfile.commander.wants.copyab);
  assert.ok(!CS.deckSynergy(zurgoProfile, deckSlims).plan.some((p) => p.label === "copyab"));
});

// ---------------------------------------------------------------- cycle 16: synergy audit (10 hand-mapped decks; Nelly Borca, Land Tax)
test("cycle 16: forced combat, opponents entering tapped, attack limits (Nick's Nelly Borca list)", () => {
  const t = (n, ty, tx, c) => CS.cardTraits(fc(n, ty, tx, c));
  const spy = t("Goblin Spymaster", "Creature \u2014 Goblin Rogue", 'First strike\nAt the beginning of each opponent\'s end step, that player creates a 1/1 red Goblin creature token with "Creatures you control attack each combat if able."', 3);
  assert.ok(spy.gives.forced, "a token handed to an opponent that must attack forces combat");
  assert.ok(!spy.gives.bodies, "that token still isn't a body for you");
  const nelly = t("Nelly Borca, Impulsive Accuser", "Legendary Creature \u2014 Human Detective", "Vigilance\nWhenever Nelly Borca attacks, suspect target creature. Then goad all suspected creatures.\nWhenever one or more creatures an opponent controls deal combat damage to one or more of your opponents, you and the controller of those creatures each draw a card.", 4);
  assert.ok(nelly.gives.forced && nelly.wants.forced);
  assert.ok(t("Grand Melee", "Enchantment", "All creatures attack each combat if able.\nAll creatures block each combat if able.", 4).gives.forced);
  assert.ok(!t("Brute", "Creature \u2014 Ogre", "Brute attacks each combat if able.", 2).gives.forced, "a drawback on your own creature isn't forced combat");
  const consuls = t("Authority of the Consuls", "Enchantment", "Creatures your opponents control enter tapped.\nWhenever a creature an opponent controls enters, you gain 1 life.", 1);
  assert.ok(consuls.gives.stax && !consuls.gives.deter && !consuls.gives.forced);
  assert.ok(t("Kismet", "Enchantment", "Artifacts, creatures, and lands your opponents control enter tapped.", 4).gives.stax);
  assert.ok(t("Crawlspace", "Artifact", "No more than two creatures can attack you each combat.", 3).gives.deter);
  const maze = t("Maze of Ith", "Land", "{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn.", 0);
  assert.ok(maze.gives.deter && !maze.wants.attacks, "Maze of Ith is defense, not an attack payoff");
});

test("cycle 16: death-trigger doublers, Skullclamp, recursion, catch-up lands", () => {
  const t = (n, ty, tx, c) => CS.cardTraits(fc(n, ty, tx, c));
  const teysa = t("Teysa Karlov", "Legendary Creature \u2014 Human Advisor", "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nCreature tokens you control have vigilance and lifelink.", 4);
  assert.ok(teysa.wants.dietrig);
  assert.ok(t("Opportunist", "Creature \u2014 Human Rogue", "Whenever one or more other creatures die, draw a card. This ability triggers only once each turn.", 3).gives.dietrig, "\"die\" counts as well as \"dies\"");
  assert.ok(t("Traveler", "Creature \u2014 Human Soldier", "When Traveler dies, create a 1/1 white Spirit creature token with flying.", 1).gives.dietrig);
  assert.ok(!t("Bear", "Creature \u2014 Bear", "Trample", 2).gives.dietrig);
  assert.ok(t("Clamp", "Artifact \u2014 Equipment", "Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}", 1).wants.fodder);
  assert.ok(t("Elder", "Creature \u2014 Snake Shaman", "Sacrifice Elder: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", 2).gives.deaths, "a creature that sacrifices itself dies");
  assert.ok(t("Pod", "Artifact", "{1}{G}, {T}, Sacrifice a creature: Search your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value, put that card onto the battlefield, then shuffle. Activate only as a sorcery.", 4).gives.blink);
  assert.ok(t("Order", "Sorcery", "As an additional cost to cast this spell, sacrifice a green creature.\nSearch your library for a green creature card, put it onto the battlefield, then shuffle.", 4).gives.deaths);
  assert.ok(t("Skeleton", "Creature \u2014 Skeleton Warrior", "{1}{B}: Return Skeleton from your graveyard to the battlefield tapped.", 2).gives.fodder);
  assert.ok(t("Pox", "Sorcery", "Each player loses 1 life, discards a card, sacrifices a creature, then sacrifices a land.", 4).wants.fodder);
  assert.ok(t("Dina", "Legendary Creature \u2014 Elf Warlock", "Whenever you sacrifice a creature, draw a card. This ability triggers only once each turn.", 2).wants.deaths);
  assert.ok(t("Mage", "Creature \u2014 Human Wizard", "Whenever a +1/+1 counter is put on Mage, you may draw a card.", 3).wants.counters);
  const tax = t("Land Tax", "Enchantment", "At the beginning of your upkeep, if an opponent controls more lands than you, you may search your library for up to three basic land cards, reveal them, put them into your hand, then shuffle.", 1);
  assert.ok(tax.roles.draw && tax.wants.lowlands, "Land Tax is repeatable card advantage that wants you behind on lands");
  assert.ok(t("Ranger", "Creature \u2014 Elf", "Return a Forest you control to its owner's hand: Untap target creature. Activate only once each turn.", 1).gives.lowlands);
});

test("cycle 16: untapping: creatures vs artifacts, mana creatures, self-untapping rocks", () => {
  const t = (n, ty, tx, c) => CS.cardTraits(fc(n, ty, tx, c));
  const retreat = t("Retreat", "Enchantment", "Landfall \u2014 Whenever a land you control enters, choose one \u2014\n\u2022 You may tap or untap target creature.\n\u2022 Scry 1.", 3);
  assert.ok(retreat.gives.untapc && !retreat.gives.untap, "untapping creatures doesn't help a mana rock");
  const key = t("Key", "Artifact", "{1}, {T}: Untap another target artifact.", 1);
  assert.ok(key.gives.untap && !key.gives.untapc);
  assert.ok(!t("Birds", "Creature \u2014 Bird", "Flying\n{T}: Add one mana of any color.", 1).wants.untapc, "a plain mana creature isn't a tap-ability creature");
  assert.ok(t("Priest", "Creature \u2014 Elf Druid", "{T}: Add {G} for each Elf on the battlefield.", 2).wants.untapc, "a mana creature that grows with the board is worth untapping");
  assert.ok(t("Monolith", "Artifact", "Monolith doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap Monolith.", 3).wants.copyab);
});

test("cycle 16: the Your deck panel's context: deck Fit words, role words, plan examples, grouped combos, other cut options", () => {
  assert.match(CS.deckFitWords(60), /^higher than all 57 /);
  assert.match(CS.deckFitWords(48), /^about the same as most/);
  assert.match(CS.deckFitWords(40), /^lower than most/);
  assert.equal(CS.roleWord(5, 8), "light");
  assert.equal(CS.roleWord(10, 10), "about right");
  assert.equal(CS.roleWord(14, 10), "heavy");
  const syn = CS.deckSynergy(zurgoProfile, deckSlims);
  syn.plan.slice(0, 4).forEach((p) => {
    assert.ok(p.giveNames.length && p.wantNames.length, p.label);
    assert.ok(!p.giveNames.concat(p.wantNames).includes("Zurgo Stormrender") || p.giveNames.length === 1 || p.wantNames.length === 1, "the commander only when it's the one card");
  });
  const g = CS.groupCombos([
    { id: "a", others: ["Crusade", "Altar"], needs: ["Persist Creature"], produces: ["Infinite counters"], bracketN: 1, bracketLabel: "Exhibition" },
    { id: "b", others: ["Crusade", "Seer"], needs: ["Persist Creature"], produces: ["Infinite counters"], bracketN: 2, bracketLabel: "Core" },
    { id: "c", others: ["Crusade", "Seer"], needs: [], produces: ["Infinite mana"], bracketN: 1, bracketLabel: "Exhibition" },
  ]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].common, ["Crusade"]);
  assert.deepEqual(g[0].oneOf.sort(), ["Altar", "Seer"]);
  assert.equal(g[0].bracketN, 2, "the group shows its highest bracket");
  const cands = CS.cutCandidates(zurgoProfile, syn, deckSlims, {});
  const alts = CS.cutAlternates([], cands, zurgoProfile, null, {}, [cands[cands.length - 1].name], 4, {});
  assert.equal(alts.length, 4);
  assert.ok(!alts.some((x) => x.name === cands[cands.length - 1].name), "never repeats a cut already listed");
  assert.equal(new Set(alts.map((x) => x.name)).size, 4);
});

test("cycle 17: sortCards orders the open pile without touching it; cards without the number go last", () => {
  const cards = [
    { id: "a", name: "A", onEdhrec: true, inclusion: 0.2, synergy: 0.1 },
    { id: "b", name: "B", onEdhrec: false, inclusion: 0.9, synergy: 0.9 },
    { id: "c", name: "C", onEdhrec: true, inclusion: 0.6, synergy: -0.2 },
    { id: "d", name: "D", onEdhrec: true, inclusion: 0.6, synergy: 0.4 },
  ];
  const info = { a: { usd: 3, cmc: 4 }, b: { usd: null, cmc: 1 }, c: { usd: 0.25, cmc: 2 }, d: { usd: 1, cmc: 2 } };
  const fit = { a: 70, b: 90, c: null, d: 40 };
  const look = (c) => ({ rec: c, info: info[c.id], fit: fit[c.id] });
  const ids = (k) => CS.sortCards(cards, k, look).map((c) => c.id).join("");
  const before = cards.map((c) => c.id).join("");
  assert.equal(ids("rec"), "abcd", "Recommended keeps the pile's order");
  assert.equal(ids("nope"), "abcd", "an unknown sort keeps the pile's order");
  assert.equal(ids("fit"), "badc", "Fit high first; no Fit last");
  assert.equal(ids("played"), "cdab", "Most played high first, ties keep pile order; not on EDHREC last even with a number");
  assert.equal(ids("synergy"), "dacb");
  assert.equal(ids("cheap"), "abcd", "cycle 29: no Cheapest sort (an old key keeps the pile's order)");
  assert.equal(ids("cmc"), "bcda", "Mana value low first, ties keep pile order");
  assert.equal(cards.map((c) => c.id).join(""), before, "the pile itself is untouched");
  assert.deepEqual(CS.sortCards([], "fit", look), []);
  assert.equal(CS.sortCards(cards, "cmc", () => null).map((c) => c.id).join(""), "abcd", "no details: pile order");
  assert.deepEqual(CS.SORTS.map((x) => x.key), ["rec", "fit", "played", "synergy", "cmc"]);
});

test("cycle 29: Good in any deck leaves out the commander's EDHREC page, strongest first", needsEdhrec, () => {
  const edMap = CS.edhrecById(edhrec);
  const info = {};
  searchAll1.data.forEach((sc) => (info[sc.id] = CS.slimCard(sc)));
  const pile = { key: "any", cards: [] };
  const add = CS.anyDeckCards(pile, searchAll1.data, edMap, deckNames, info);
  assert.ok(add.length > 20, "plenty left after the page's cards: " + add.length);
  const onPage = searchAll1.data.filter((sc) => edMap[sc.id]).length;
  assert.ok(onPage > 20, "the fixture page has EDHREC cards to leave out: " + onPage);
  for (const c of add) {
    assert.ok(!CS.onEdhrecPage(c.id, edMap), c.name + " is on the commander's page");
    assert.ok(!deckNames[CS.nameKey(c.name)], c.name + " is in the deck");
    assert.equal(c.section, "any");
  }
  const st = add.map((c) => CS.strength(info[c.id]).score);
  assert.deepEqual(st, st.slice().sort((a, b) => b - a), "strongest first");
  // EDHREC down: the strongest popular cards in the colors
  const noEd = CS.anyDeckCards({ key: "any", cards: [] }, searchAll1.data, {}, deckNames, info);
  assert.ok(noEd.length > add.length);
  // page 1 again adds nothing
  pile.cards = add;
  assert.deepEqual(CS.anyDeckCards(pile, searchAll1.data, edMap, deckNames, info), []);
  assert.equal(CS.onEdhrecPage("x", { x: { onEdhrec: true } }), true);
  assert.equal(CS.onEdhrecPage("x", { x: { onEdhrec: false } }), false);
  assert.equal(CS.onEdhrecPage("x", null), false);
});

// cycle 18: Frumpmanfresh's decks (via Nick): "the machine is unable to grasp the concept of a gameplan"
const c18 = JSON.parse(read("scryfall_2026-11-20_decks.json"));
const c18card = (n) => CS.slimCard(c18.cards.concat(c18.arcades, c18.speed).find((c) => c.name === n));
const c18deck = (k, cmd) => {
  const slims = c18[k].map(CS.slimCard);
  const profile = CS.deckProfile(slims, cmd);
  return { slims, profile, syn: CS.deckSynergy(profile, slims) };
};

test("cycle 18: roles read from real cards (tutors with a land option, protection, removal, wipes)", () => {
  const roles = (n) => CS.cardTraits(c18card(n)).roles;
  for (const n of ["Starfield Shepherd", "Finale of Devastation", "Demonic Consultation", "Expedition Map", "Crop Rotation"])
    assert.ok(roles(n).tutors, n + " is a tutor");
  assert.ok(!roles("Misty Rainforest").tutors, "a fetch land (a basic land type) isn't a tutor");
  assert.ok(roles("Snuff Out").removal, "nonblack creature removal");
  for (const n of ["Deflecting Swat", "Imp's Mischief", "Sylvan Safekeeper", "Counterspell", "Reprieve"])
    assert.ok(roles(n).protection, n + " protects");
  assert.ok(roles("Archfiend of Depravity").wipes, "sacrifices the rest");
});

test("cycle 18: labels for copies, defenders, colorless and speed", () => {
  const t = (n) => CS.cardTraits(c18card(n));
  for (const n of ["The Jolly Balloon Man", "Kiki-Jiki, Mirror Breaker", "Splinter Twin", "Panharmonicon"])
    assert.ok(t(n).gives.blink, n + " re-uses enter triggers");
  assert.ok(t("Wall of Omens").gives.defender && t("Steel Wall").gives.defender);
  for (const n of ["Tetsuko Umezawa, Fugitive", "Meekstone", "Assault Formation", "High Alert"])
    assert.ok(t(n).wants.defender, n + " helps defenders or low-power creatures");
  assert.ok(t("Skittering Cicada").wants.colorless && t("Sol Ring").gives.colorless);
  assert.ok(!t("Swords to Plowshares").gives.colorless, "a white spell isn't colorless");
  const sd = t("The Speed Demon");
  assert.ok(sd.wants.drain, "speed rises when opponents lose life");
  assert.ok(sd.wants.lifegain, "it costs life every turn");
});

test("cycle 18: game kinds: engines and finishers", () => {
  const g = (n) => CS.gameKinds(CS.cardTraits(c18card(n)), c18card(n));
  assert.deepEqual(g("Nexus of Fate").win, ["takes extra turns"]);
  assert.deepEqual(g("Trouble in Pairs").win, [], "stopping an extra turn isn't taking one");
  assert.ok(g("Lurking Predators").engine.includes("creatures"));
  // cycle 19: a cast trigger repeats only on a commander (recast from the command zone)
  const koz = CS.cardTraits(c18card("Kozilek, the Great Distortion"));
  assert.ok(!CS.gameKinds(koz, c18card("Kozilek, the Great Distortion")).engine.includes("cards"), "in the 99, a cast trigger happens once");
  koz.commander = true;
  assert.ok(CS.gameKinds(koz, c18card("Kozilek, the Great Distortion")).engine.includes("cards"));
  assert.ok(g("Panharmonicon").engine.includes("doubling"));
  assert.ok(g("Walking Ballista").win.length && g("Lumra, Bellow of the Woods").win.length);
  assert.deepEqual(g("Counterspell").engine, [], "an instant is never an engine");
});

test("cycle 18: Arcades reads as defenders that attack using toughness, and keeps its plan cards", () => {
  const { slims, profile, syn } = c18deck("arcades", "Arcades, the Strategist");
  assert.equal(syn.plan[0].label, "defender", "defenders lead the themes");
  const winNames = syn.game.wins.map((w) => w.name);
  assert.ok(winNames.includes("Arcades, the Strategist") && winNames.includes("High Alert"), winNames.join(", "));
  const ideas = CS.cutSuggestions(profile, syn, slims, {});
  for (const n of ["Assault Formation", "Walking Bulwark", "Stalwart Shield-Bearers", "Crystal Barricade"])
    assert.ok(!ideas.some((x) => x.name === n), n + " isn't a cut idea");
  assert.ok(!ideas.some((x) => x.reasons.some((r) => /More (protection|ramp) than the deck needs/.test(r))), "protection is never surplus; mana engines make ramp the plan");
  assert.ok(syn.game.bigMana);
});

test("cycle 18: The Speed Demon's game plan: drain, find, protect", () => {
  const { slims, profile, syn } = c18deck("speed", "The Speed Demon");
  assert.ok(syn.plan.slice(0, 2).some((p) => p.label === "drain"), syn.plan.map((p) => p.label).join(", "));
  assert.ok(syn.game.wins.some((w) => w.name === "Gray Merchant of Asphodel"));
  assert.ok(syn.game.tutors.length >= 6);
  assert.ok(syn.game.notes.some((n) => /protect/.test(n)), "thin protection is noted");
  const ideas = CS.cutSuggestions(profile, syn, slims, {});
  for (const n of ["Imp's Mischief", "Demonic Consultation"]) assert.ok(!ideas.some((x) => x.name === n), n + " isn't a cut idea");
  // Snuff Out can be an idea only because the deck runs 13 removal, never as "works with almost nothing"
  const snuff = ideas.find((x) => x.name === "Snuff Out");
  assert.ok(!snuff || snuff.reasons.every((r) => /More removal than the deck needs/.test(r)), snuff && snuff.reasons.join("; "));
  const lines = CS.gamePlanLines(syn.game, 2);
  assert.match(lines[0], /^Plan: draining and burning opponents/); // cycle 20: the route line comes first
  assert.match(lines[1], /^Engine: \d+ cards keep making cards \(The Speed Demon/);
  assert.match(lines[lines.length - 1], /, or one of 2 combos in the deck\.$/);
});

test("cycle 18: game plan words", () => {
  const g = { engineCount: 1, kinds: { cards: ["A"], mana: [], creatures: [], doubling: [] }, protection: [], tutors: [], wins: [], ramp: 9, removal: 2, wipes: 0, notes: [] };
  const l = CS.gamePlanLines(g, 0);
  assert.equal(l[0], "Engine: 1 card keeps making cards (A).");
  assert.equal(l[1], "Protection: 0.");
  assert.equal(l[3], "Mana: 9 sources. Interaction: 2 removal, 0 board wipes.");
  assert.equal(l[4], "Wins with: no clear finisher found, so combat or the engine's advantage.");
  assert.equal(CS.gamePlanLines(g, 1)[4], "Wins with: the 1 combo in the deck.");
  assert.deepEqual(CS.gamePlanLines(null, 0), []);
});

test("cycle 18: cuts respect the game plan (a finisher, a protection card in a deck heavy on draw)", () => {
  const { slims, profile } = c18deck("arcades", "Arcades, the Strategist");
  const extra = [c18card("Nexus of Fate"), c18card("Reprieve")];
  for (let i = 1; i <= 5; i++)
    extra.push({ id: "c18-draw-" + i, name: "Test Draw " + i, typeLine: "Sorcery", frontType: "Sorcery", types: "Sorcery", oracle: "Draw two cards.", text: "Draw two cards.", manaCost: "{2}{U}", cmc: 3, colorIdentity: ["U"] });
  const all = slims.concat(extra);
  const p2 = CS.deckProfile(all, "Arcades, the Strategist");
  const s2 = CS.deckSynergy(p2, all);
  assert.ok(p2.roleCount.draw > 12.5, "draw is over a quarter past the typical count");
  const cands = CS.cutCandidates(p2, s2, all, {});
  const nexus = cands.find((x) => x.name === "Nexus of Fate");
  assert.equal(nexus.planJob, "win");
  // an honest reason: it's a finisher that ties in to little (not "works with almost nothing", not "isn't part of the plan")
  assert.ok(nexus.reasons.some((r) => /^A finisher, though it ties in to little else here/.test(r)), nexus.reasons.join("; "));
  assert.ok(!nexus.reasons.some((r) => /Works with almost nothing|isn't part of the deck's plan/.test(r)), nexus.reasons.join("; "));
  assert.ok(nexus.cut < 0.75, "a finisher's job softens the cut score (0.95 without it): " + nexus.cut);
  const rep = cands.find((x) => x.name === "Reprieve");
  assert.ok(!rep.reasons.some((r) => /More (card draw|protection) than the deck needs/.test(r)), rep.reasons.join("; "));
  const plain = cands.find((x) => x.name === "Test Draw 1");
  assert.ok(plain.reasons.some((r) => /More card draw than the deck needs/.test(r)), "a plain draw spell still is");
});

test("cycle 18 (held-back decks): clones, Spellskite, transmute, X mana, team finishers", () => {
  const t = (n) => CS.cardTraits(c18card(n));
  const g = (n) => CS.gameKinds(t(n), c18card(n));
  for (const n of ["Phantasmal Image", "Mockingbird", "Spark Double"]) {
    assert.ok(t(n).gives.blink && t(n).gives.copyab, n + " copies a creature");
    assert.ok(g(n).engine.includes("doubling"), n + " doubles an engine piece");
  }
  for (const n of ["Spellskite", "Mindbreak Trap"]) assert.ok(t(n).roles.protection, n + " protects");
  assert.ok(t("Drift of Phantasms").roles.tutors, "transmute is a tutor");
  for (const n of ["Carpet of Flowers", "Goblin Anarchomancer"]) assert.ok(t(n).roles.ramp, n + " is ramp");
  for (const n of ["Mirror Entity", "Jetmir, Nexus of Revels"]) assert.deepEqual(g(n).win, ["pumps your whole team"], n);
});

const DASH = String.fromCharCode(0x2014); // the type-line dash
test("cycle 18: finisher and engine edges (Craterhoof's wording, an off-plan engine)", () => {
  const hoof = { id: "c18-hoof", name: "Test Hoof", typeLine: "Creature " + DASH + " Beast", types: "Creature " + DASH + " Beast", frontType: "Creature " + DASH + " Beast", manaCost: "{5}{G}{G}{G}", cmc: 8, colorIdentity: ["G"],
    text: "Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control." };
  assert.deepEqual(CS.gameKinds(CS.cardTraits(hoof), hoof).win, ["pumps your whole team"]);
  // an engine piece that ties in to nothing isn't listed as this deck's engine
  const { slims } = c18deck("speed", "The Speed Demon");
  const lone = { id: "c18-lone", name: "Test Lone Engine", typeLine: "Enchantment", types: "Enchantment", frontType: "Enchantment", manaCost: "{2}{U}", cmc: 3, colorIdentity: ["U"],
    text: "Whenever you cast a Wizard spell, scry 1 and draw a card." };
  const all = slims.concat([lone]);
  const p = CS.deckProfile(all, "The Speed Demon");
  const syn = CS.deckSynergy(p, all);
  assert.ok(CS.gameKinds(CS.cardTraits(lone), lone).engine.includes("cards"));
  assert.ok(!syn.game.engine.some((e) => e.name === "Test Lone Engine"), "off-plan engine left out");
  assert.ok(syn.game.engine.some((e) => e.name === "The Speed Demon"), "the commander is always in");
});

// ---------------------------------------------------------------- cycle 19: the game plan in every part of the app
// Nick, on his own decks: Kozilek cut "as card draw" for They Came from the Pipes; Graduation Day cut because
// "few decks with this commander" run it; Rayami's Voltron plan missed.
const c19 = JSON.parse(read("scryfall_2026-11-21_decks.json"));
const c19card = (n) => CS.slimCard(c19.cards.concat(c19.zimone, c19.elsha, c19.rayami).find((c) => c.name === n));
const c19deck = (k, cmd) => {
  const slims = c19[k].map(CS.slimCard);
  const profile = CS.deckProfile(slims, cmd);
  return { slims, profile, syn: CS.deckSynergy(profile, slims) };
};

test("cycle 19: side jobs: a big card's cast trigger and a cantrip don't make a role", () => {
  const t = (n) => CS.cardTraits(c19card(n));
  // a big card's cast trigger: its job when you cast it, a side job in a deck that puts it into play for free
  assert.ok(t("Kozilek, Butcher of Truth").roles.draw && t("Kozilek, Butcher of Truth").castRoles.draw, "cast in a normal deck, it draws four");
  const zim = c19deck("zimone", "Zimone, Mystery Unraveler").profile;
  const zk = (n) => zim.cards.find((c) => c.name === n);
  assert.ok(!zk("Kozilek, Butcher of Truth").roles.draw && zk("Kozilek, Butcher of Truth").sideRoles.draw, "Zimone flips it for free: the draw is a side job");
  assert.ok(zk("Kozilek, Butcher of Truth").gives.drawing, "it still draws, for draw payoffs");
  assert.ok(!zk("Ulamog, the Infinite Gyre").roles.removal && zk("Ulamog, the Infinite Gyre").sideRoles.removal);
  assert.ok(!t("Leap").roles.draw && t("Psychotic Fury").sideRoles.draw, "a pump spell's cantrip");
  const denial = t("Arcane Denial");
  assert.ok(denial.roles.protection && denial.roles.removal && !denial.roles.draw);
  assert.ok(t("Brainstorm").roles.draw && t("Consider").roles.draw, "a card whose job is drawing still draws");
  assert.ok(t("Rhystic Study").roles.draw);
});

test("cycle 19: labels for borrowed keywords, heroic and big edicts", () => {
  const t = (n) => CS.cardTraits(c19card(n));
  const ray = t("Rayami, First of the Fallen");
  assert.ok(ray.wants.keywords && ray.wants.deaths, "Rayami borrows keywords from creatures that die");
  for (const n of ["Slippery Bogle", "Nightveil Predator", "Sire of Seven Deaths", "Rhonas the Indomitable", "Stonecoil Serpent"])
    assert.ok(t(n).gives.keywords, n + " lends keywords");
  assert.ok(!t("Swords to Plowshares").gives.keywords && !t("Sol Ring").gives.keywords);
  assert.ok(t("Graduation Day").wants.heroic, "Graduation Day pays off spells that target a creature");
  for (const n of ["Brute Force", "Infuriate", "Temur Battle Rage", "Leap"]) assert.ok(t(n).gives.heroic, n + " targets your creature");
  assert.ok(!t("Swords to Plowshares").gives.heroic, "removal on their creature isn't heroic");
  const edict = t("Blasphemous Edict");
  assert.ok(edict.gives.deaths && edict.roles.wipes, "each player sacrifices thirteen creatures");
});

test("cycle 19: Zimone: free-flipped titans are finishers, extra land drops are the engine", () => {
  const { slims, profile, syn } = c19deck("zimone", "Zimone, Mystery Unraveler");
  const wins = syn.game.wins.map((w) => w.name);
  for (const n of ["Kozilek, Butcher of Truth", "Ulamog, the Infinite Gyre", "It That Betrays"]) assert.ok(wins.includes(n), n + " wins: " + wins.join(", "));
  assert.equal(syn.game.ids[c19card("Kozilek, Butcher of Truth").id], "win");
  assert.ok(syn.game.kinds.fuel.length >= 10, "cards that feed Zimone");
  assert.match(CS.gamePlanLines(syn.game, 2)[0], /^Plan: lands and landfall/); // cycle 20
  assert.match(CS.gamePlanLines(syn.game, 2)[1], /feed the commander/);
  const ideas = CS.cutSuggestions(profile, syn, slims, {});
  for (const n of ["Exploration", "Dryad of the Ilysian Grove", "Burgeoning", "Lotus Cobra", "Kozilek, Butcher of Truth", "Ulamog, the Infinite Gyre"])
    assert.ok(!ideas.some((x) => x.name === n), n + " isn't a cut idea");
  // land fetching feeds Zimone's landfall: never "more ramp than the deck needs"
  for (const n of ["Farseek", "Rampant Growth", "Nature's Lore", "Three Visits", "Sakura-Tribe Elder"])
    assert.ok(!ideas.some((x) => x.name === n && x.reasons.some((r) => /^More ramp/.test(r))), n + " feeds Zimone");
  // the swap prompt after adding They Came from the Pipes (as the page builds it)
  const cands = CS.cutCandidates(profile, syn, slims, { slims });
  const swaps = CS.swapSuggestions(c19card("They Came from the Pipes"), cands, profile, CS.parseExport(c19.zimone.map((c) => "1 " + c.name).join("\n")).cards, {}, { slims });
  assert.ok(swaps.length >= 3);
  for (const n of ["Kozilek, Butcher of Truth", "Ulamog, the Infinite Gyre", "It That Betrays", "Blightsteel Colossus", "Darksteel Colossus", "Aesi, Tyrant of Gyre Strait", "Rhystic Study"])
    assert.ok(!swaps.some((x) => x.name === n), n + " isn't offered for the Pipes: " + JSON.stringify(swaps));
  assert.ok(swaps.every((x) => !/^few decks|^game Changer/i.test(x.why)), "a note is never the swap's reason: " + JSON.stringify(swaps));
  // with EDHREC numbers: Mirri's Guile isn't on Zimone's page, but the reason is its tie-in, not the note
  const edh = {};
  const withE = CS.swapSuggestions(c19card("They Came from the Pipes"), CS.cutCandidates(profile, syn, slims, { slims, edhrec: edh }), profile, [], {}, { slims, edhrec: edh });
  assert.ok(withE.every((x) => !/^few decks/i.test(x.why)), JSON.stringify(withE));
  // a staple that does the same job goes only for a card that does it better, even when it's the only one left
  const staple = CS.swapSuggestions(c19card("They Came from the Pipes"), cands.filter((x) => x.name === "Rhystic Study"), profile, [], {}, { slims });
  assert.deepEqual(staple, [], JSON.stringify(staple));
  // a finisher goes only for another finisher, even when it's the only card left to offer
  const lone = CS.swapSuggestions(c19card("They Came from the Pipes"), cands.filter((x) => x.name === "Kozilek, Butcher of Truth"), profile, [], {}, { slims });
  assert.deepEqual(lone, []);
  const titan = CS.swapSuggestions(c19card("Ulamog, the Infinite Gyre"), cands.filter((x) => x.name === "Kozilek, Butcher of Truth"), profile, [], {}, { slims });
  assert.match(titan[0].why, /same job in your game plan \(a finisher\)/);
});

test("cycle 19: Elsha: Graduation Day stays; popularity alone is never why a card goes", () => {
  const { slims, profile, syn } = c19deck("elsha", "Elsha, Threefold Master");
  const grad = c19card("Graduation Day");
  assert.ok(syn.fits[grad.id] >= syn.score, "Graduation Day ties in at or above the deck's average");
  // an engine that ties in above the average isn't told there are better cards for its job (Electro, a new card)
  const electro = CS.cutCandidates(profile, syn, slims, { slims, today: "2026-05-01" }).find((x) => x.name === "Electro, Assaulting Battery");
  assert.ok(CS.isNewCard(c19card("Electro, Assaulting Battery"), "2026-05-01"));
  assert.ok(electro && !electro.reasons.some((r) => /better cards for its job/.test(r)), electro && electro.reasons.join("; "));
  const edhrec = {}; // a page that lists nothing: every card is "missing from it"
  const ideas = CS.cutSuggestions(profile, syn, slims, { edhrec, slims });
  assert.ok(!ideas.some((x) => x.name === "Graduation Day"), JSON.stringify(ideas.map((x) => x.name)));
  assert.ok(!ideas.some((x) => x.reasons.length === 1 && /^Few decks with this commander run it/.test(x.reasons[0])), "a note alone is never the reason");
  // a card in its first year isn't marked down for EDHREC's silence or its low popularity
  const cand = (today) => CS.cutCandidates(profile, syn, slims, { edhrec, slims, today }).find((x) => x.name === "Graduation Day");
  assert.ok(CS.isNewCard(grad, "2026-11-21") && !CS.isNewCard(grad, "2027-06-01"));
  assert.ok(cand("2026-11-21").keep > cand("2027-06-01").keep, "new: neutral popularity");
  // and the Voltron-ish route: Elsha is suited up by pump spells
  assert.equal(profile.route && profile.route.kind, "voltron");
  // with a low deck average, a card missing from EDHREC still stays once it ties in at or above it
  const low = Object.assign({}, syn, { score: 30 });
  const lowIdeas = CS.cutSuggestions(profile, low, slims, { edhrec, slims });
  assert.ok(!lowIdeas.some((x) => x.tie >= 30 && !x.roles.length && x.reasons.every((r) => /^Tie-in \d+ and strength|^Few decks/.test(r))),
    lowIdeas.map((x) => x.name + " " + x.tie).join(", "));
});

test("cycle 19: Rayami: Voltron with borrowed keywords", () => {
  const { slims, profile, syn } = c19deck("rayami", "Rayami, First of the Fallen");
  assert.equal(profile.route.kind, "voltron");
  assert.ok(profile.route.gear >= 6, "gear " + profile.route.gear);
  assert.equal(syn.game.wins[0].name, "Rayami, First of the Fallen");
  assert.match(CS.gamePlanLines(syn.game, 0)[5], /^Wins with: Rayami \(attacking for commander damage, suited up by \d+ Equipment and Auras/);
  const ideas = CS.cutSuggestions(profile, syn, slims, {});
  for (const n of ["Sword of Feast and Famine", "Genji Glove", "Blade of the Bloodchief", "Helm of the Host", "Swiftfoot Boots", "Alpha Authority",
    "Slippery Bogle", "Rhonas the Indomitable", "Wilson, Refined Grizzly", "Venomthrope", "Sire of Seven Deaths", "Nightveil Predator", "Stonecoil Serpent"])
    assert.ok(!ideas.some((x) => x.name === n), n + " isn't a cut idea: " + ideas.map((x) => x.name).join(", "));
  assert.ok(syn.plan.some((p) => p.label === "keywords"), "borrowed keywords is one of the deck's themes");
  // a recommendation says what it does for the plan
  const spear = fc("Test Spear", "Artifact \u2014 Equipment", "Equipped creature gets +1/+1 and has trample and lifelink.\nEquip {2}", 1);
  assert.ok(CS.fitScore(spear, profile).reasons.some((r) => /^For the game plan: suits up Rayami for commander damage$/.test(r)));
});

test("cycle 19: routes only where the deck is built for one", () => {
  // cycle 20: every deck now gets an archetype route; Voltron still only where the deck is built for it
  assert.notEqual(zurgoProfile.route && zurgoProfile.route.kind, "voltron", "Zurgo's tokens deck isn't Voltron");
  const zr = [zurgoProfile.route.kind].concat(zurgoProfile.route.also); // tokens and sacrifice: go wide and aristocrats
  assert.ok(zr.includes("go-wide") && zr.includes("aristocrats"), zr.join(", "));
  assert.equal(c19deck("zimone", "Zimone, Mystery Unraveler").profile.route.kind, "lands");
  // a big body counts as a finisher only when the deck puts it into play for free
  const koz = c19card("Kozilek, Butcher of Truth");
  assert.ok(CS.isBigBody(CS.cardTraits(koz), koz) && !CS.isBigBody(CS.cardTraits(c19card("Sol Ring")), c19card("Sol Ring")));
  assert.notEqual(CS.planJobFor(CS.cardTraits(koz), koz, zurgoProfile), "win", "Zurgo doesn't cheat Kozilek in");
});

// ---- cycle 20: Scryfall Tagger tags, archetype routes, route finishers ----
const sc20 = (name, type, text, cmc, extra) =>
  CS.slimCard(Object.assign({ id: "c20-" + name, name: name, type_line: type, oracle_text: text, cmc: cmc || 0, mana_cost: "", color_identity: [], legalities: { commander: "legal" } }, extra || {}));
const TAGS20 = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "data", "card_tags.json"), "utf8"));

test("cycle 20: Tagger tags fill a reading the text rules miss, and the page works without them", () => {
  const prop = sc20("Propaganda", "Enchantment", "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.", 3);
  CS.setCardTags(null);
  const before = CS.cardTraits(prop);
  assert.ok(CS.setCardTags(TAGS20), "the built file loads");
  const after = CS.cardTraits(prop);
  CS.setCardTags(null);
  assert.ok(!before.gives.deter || after.gives.deter, "never loses a reading");
  assert.ok(after.gives.deter, "Propaganda keeps attackers away (pillow fort)");
  assert.ok(!CS.hasCardTags(), "and the page reads cards without the file");
  // the file only holds what the text rules miss, in short codes
  assert.ok(Object.keys(TAGS20.cards).length > 1000 && TAGS20.codes && TAGS20.v === 1);
});

test("cycle 20: a tag never turns a rider into a main role", () => {
  CS.setCardTags({ v: 1, codes: { a: "draw" }, cards: { "c20 pump": "ra" } });
  const pump = sc20("C20 Pump", "Instant", "Target creature gets +2/+2 until end of turn.\nDraw a card.", 1);
  const t = CS.cardTraits(pump);
  CS.setCardTags(null);
  assert.ok(!t.roles.draw, "a cantrip stays a side job: " + JSON.stringify(t.roles));
});

test("cycle 20: alternate wins from tags count as finishers", () => {
  CS.setCardTags({ v: 1, codes: { w: "win" }, cards: { "c20 odd win": "jw" } });
  const odd = sc20("C20 Odd Win", "Enchantment", "At the beginning of your upkeep, if you control seven or more Plains, something happens.", 4);
  const kinds = CS.gameKinds(CS.cardTraits(odd), odd);
  CS.setCardTags(null);
  assert.ok(kinds.win.length, "reads as a win");
});

test("cycle 20: route finishers follow the deck's archetype", () => {
  const artist = sc20("Blood Artist", "Creature \u2014 Vampire", "Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.", 2, { power: "0", toughness: "1" });
  const t = CS.cardTraits(artist);
  assert.match(String(CS.routeWin(t, artist, { kind: "aristocrats", also: [] })), /drains the table/);
  assert.equal(CS.routeWin(t, artist, { kind: "lands", also: [] }), null, "not a finisher in a lands deck");
  assert.ok(CS.ROUTE_WORDS.combo && CS.ROUTE_WORDS.lands);
});

test("cycle 20: a tag adds a reading the text doesn't have", () => {
  const bland = sc20("C20 Bland Wall", "Enchantment", "When this enchantment enters, scry 1.", 2);
  CS.setCardTags({ v: 1, codes: { d: "deter" }, cards: { "c20 bland wall": "gd" } });
  const t = CS.cardTraits(bland);
  CS.setCardTags(null);
  assert.ok(t.gives.deter, "the tag's label is read");
  assert.ok(!CS.cardTraits(bland).gives.deter, "and only while the tags are loaded");
});

test("cycle 20: a card's type is fuel when the commander pays off that type (Sagas for a Saga commander)", () => {
  const cmd = sc20("C20 Lorekeeper", "Legendary Creature \u2014 Human Wizard", "Whenever you cast a Saga spell, draw a card. Sagas you control have hexproof.", 3);
  const saga = sc20("C20 Old Tale", "Enchantment \u2014 Saga", "I \u2014 Scry 2.\nII \u2014 Draw a card.\nIII \u2014 You gain 3 life.", 2);
  const p = CS.deckProfile([cmd, saga], "C20 Lorekeeper");
  assert.equal(CS.planJobFor(CS.cardTraits(saga), saga, p), "fuel");
});

test("cycle 21: fit in words follows tie-in (strong from 70, some from 30)", () => {
  assert.equal(CS.fitTier(100).word, "Strong fit");
  assert.equal(CS.fitTier(70).key, "strong");
  assert.equal(CS.fitTier(69).key, "some");
  assert.equal(CS.fitTier(30).key, "some");
  assert.equal(CS.fitTier(29).word, "Little fit");
  assert.equal(CS.fitTier(0).key, "little");
  assert.equal(CS.fitTier(null), null, "no tie-in, no words");
  assert.equal(CS.fitTier(NaN), null);
  const f = CS.blendFit(CS.fitScore(byName(recSlims, "Will of the Mardu"), zurgoProfile), CS.strength(byName(recSlims, "Will of the Mardu")));
  assert.equal(CS.fitTier(f.tieIn).key, f.tieIn >= 70 ? "strong" : f.tieIn >= 30 ? "some" : "little", "the page reads tie-in, not the blend");
});

test("cycle 21: a commander's short name for the stats line", () => {
  assert.equal(CS.shortCommander("Zurgo Stormrender"), "Zurgo");
  assert.equal(CS.shortCommander("Kinnan, Bonder Prodigy"), "Kinnan");
  assert.equal(CS.shortCommander("The Wise Mothman"), "The Wise Mothman");
  assert.equal(CS.shortCommander("Tom Bombadil"), "Tom Bombadil");
  assert.equal(CS.shortCommander("Rin and Seri, Inseparable"), "Rin and Seri");
  assert.equal(CS.shortCommander(""), "");
  assert.equal(CS.shortCommander(null), "");
});

test("cycle 21: no Fit number in cut reasons or the sort menu", () => {
  const fitSort = CS.SORTS.filter((x) => x.key === "fit")[0];
  assert.equal(fitSort.label, "Fits your deck");
  const ideas = CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, {});
  const all = CS.fillCuts(ideas, zurgoProfile, zurgoSyn, zurgoSlims, {}, ideas.length + 5);
  assert.ok(all.some((x) => x.filler), "fillers are in the list");
  all.forEach((x) => assert.ok(!/\bFit (\d|unknown)/.test(x.reasons.join(" ")), x.reasons.join(" ")));
});

// ---- cycle 23: plan shapes from five Most Likes decks (Winota, K'rrik, Ovika, Wilhelt, Shroofus) ----
const c23 = JSON.parse(read("scryfall_2026-11-23_decks.json"));
const c23deck = (k, cmd) => {
  const slims = c23[k].map(CS.slimCard);
  const profile = CS.deckProfile(slims, cmd);
  return { slims, profile, syn: CS.deckSynergy(profile, slims) };
};
const c23find = (d, n) => d.profile.cards.find((c) => c.name === n);
const c23slim = (d, n) => d.slims.find((s) => s.name === n);

test("cycle 23: Winota: non-Humans attack to find Humans; both halves are the plan", () => {
  const d = c23deck("winota", "Winota, Joiner of Forces");
  assert.equal(d.profile.hooks.attackNot, "human");
  assert.ok(d.profile.commander.wants.attacks, "Winota pays off attacking");
  for (const n of ["Kitesail Scout", "Ornithopter", "Raise the Alarm"])
    assert.ok(c23find(d, n).gives.attacks, n + " attacks for Winota (a non-Human, or non-Human tokens)");
  assert.ok(!c23find(d, "Th\u00e9oden, King of Rohan").gives.attacks, "a Human is what she finds, not what triggers her");
  assert.equal(CS.planJobFor(c23find(d, "Kitesail Scout"), c23slim(d, "Kitesail Scout"), d.profile), "fuel");
  const ideas = CS.cutSuggestions(d.profile, d.syn, d.slims, {}).map((x) => x.name);
  for (const n of ["Kitesail Scout", "Raise the Alarm", "Hop to It", "Th\u00e9oden, King of Rohan", "Fallaji Vanguard"])
    assert.ok(!ideas.includes(n), n + " is part of the plan: " + ideas.join(", "));
  // the commander names Humans, so Humans count as its type even though Human is too common elsewhere
  const thc = CS.cutCandidates(d.profile, d.syn, d.slims, {}).find((x) => x.name === "Th\u00e9oden, King of Rohan");
  assert.ok(thc.engine, "a Human in Winota's deck is the commander's own type");
});

test("cycle 23: Shroofus: a commander whose own type has the combat-damage trigger is a Voltron plan", () => {
  const d = c23deck("shroofus", "Shroofus Sproutsire");
  assert.equal(d.profile.route.kind, "voltron");
  assert.ok(!d.profile.route.also.includes("combo"), "mana Elves and land droppers aren't the cEDH shape: " + d.profile.route.also);
  assert.ok(d.profile.commander.wants.heroic && d.profile.commander.wants.gear, "a Voltron commander wants what suits it up");
  const ideas = CS.cutSuggestions(d.profile, d.syn, d.slims, {}).map((x) => x.name);
  for (const n of ["Primal Bellow", "Invigorate", "Tyvar's Stand", "Overprotect"])
    assert.ok(!ideas.includes(n), n + " suits up Shroofus: " + ideas.join(", "));
  assert.ok(ideas.includes("Savage Summoning"), "a weak card still goes");
  for (const n of ["Sakura-Tribe Scout", "Elvish Pioneer", "Arboreal Grazer"])
    assert.ok(c23find(d, n).roles.ramp, n + " puts a land from your hand onto the battlefield: ramp");
  // but a land dropper doesn't make a deck "built to make a lot of mana": Zimone's rocks can still be spare ramp
  assert.ok(!zimoneSyn.game.bigMana, "Zimone: " + zimoneProfile.roleCount.ramp + " ramp, not a big-mana deck");
  assert.ok(CS.cutSuggestions(zimoneProfile, zimoneSyn, zimoneSlims, {}).some((x) => x.name === "Simic Signet"));
});

test("cycle 23: Ovika: noncreature spells feed it, and a rock that draws by sacrificing itself is ramp", () => {
  const d = c23deck("ovika", "Ovika, Enigma Goliath");
  assert.ok(d.profile.commander.wants.noncreature && d.profile.commander.wants.bigspell, "noncreature spells, more mana value = more Goblins");
  const mind = c23find(d, "Mind Stone");
  assert.ok(mind.roles.ramp && !mind.roles.draw && mind.sideRoles.draw, "Mind Stone: ramp, its draw a side job");
  assert.ok(c23find(d, "Coveted Jewel").roles.draw, "drawing three when it enters is still card draw");
  assert.ok(!c23find(d, "Dig Through Time").gives.noncreature, "instants link through spells, not twice");
  assert.equal(CS.planJobFor(mind, c23slim(d, "Mind Stone"), d.profile), "fuel");
  assert.ok(d.profile.roleCount.draw <= 16, "draw " + d.profile.roleCount.draw);
  const ideas = CS.cutSuggestions(d.profile, d.syn, d.slims, {});
  for (const n of ["Mind Stone", "Commander's Sphere", "Hedron Archive", "Izzet Locket", "Dreamstone Hedron", "Stonespeaker Crystal"])
    assert.ok(!ideas.some((x) => x.name === n && x.reasons.some((r) => /More card draw/.test(r))), n + " isn't spare card draw");
});

test("cycle 23: Wilhelt: Grave Pact is the engine; Gravecrawler is fodder that comes back", () => {
  const d = c23deck("wilhelt", "Wilhelt, the Rotcleaver");
  const gp = c23find(d, "Grave Pact");
  assert.ok(CS.gameKinds(gp, c23slim(d, "Grave Pact")).engine.includes("removal"));
  assert.equal(d.syn.game.ids[gp.id], "engine");
  assert.ok(!CS.cutSuggestions(d.profile, d.syn, d.slims, {}).some((x) => x.name === "Grave Pact"));
  assert.ok(c23find(d, "Gravecrawler").gives.fodder, "castable from the graveyard: fodder");
  assert.match(CS.gamePlanLines(d.syn.game, 0)[1], /opponents sacrifice \(Grave Pact\)/);
  // an engine piece that ties in is never "more X than the deck needs" (Dark Prophecy draws on every death in Zurgo)
  const dp = zurgoProfile.cards.find((c) => c.name === "Dark Prophecy");
  assert.equal(zurgoSyn.game.ids[dp.id], "engine");
  assert.ok(!CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, {}).some((x) => x.name === "Dark Prophecy"));
});

test("cycle 23: K'rrik: Necropotence and Asmodeus are draw engines; Necrotic Ooze uses graveyards", () => {
  const d = c23deck("krrik", "K'rrik, Son of Yawgmoth");
  for (const n of ["Necropotence", "Asmodeus the Archfiend"])
    assert.ok(CS.gameKinds(c23find(d, n), c23slim(d, n)).engine.includes("cards"), n);
  assert.ok(c23find(d, "Necrotic Ooze").wants.graveyard, "creature cards in all graveyards");
  assert.equal(d.profile.route.kind, "combo");
});

// ---------------------------------------------------------------- cycle 25: outcome check fixes
// Playgroup win methods for ~1,500 commanders (tools/benchmark/outcomes.js) showed three general misses.
const sc25 = (name, type, text, cmc, extra) =>
  CS.slimCard(Object.assign({ id: "c25-" + name, name: name, type_line: type, oracle_text: text, cmc: cmc || 0, mana_cost: "", color_identity: [], legalities: { commander: "legal" } }, extra || {}));
const c25filler = (n, type, text) => Array.from({ length: n }, (_, i) => sc25(type.split(" ")[0] + " Filler " + i, type, text, 3));

test("cycle 25: a legendary card's first name is its own name (Karlov of the Ghost Council)", () => {
  const karlov = sc25("Karlov of the Ghost Council", "Legendary Creature — Spirit Advisor", "Whenever you gain life, put two +1/+1 counters on Karlov.", 2, { power: 2, toughness: 2 });
  assert.match(CS.cardTraits(karlov).text, /counters on ~/);
  const lord = sc25("Lord of the Pit", "Creature — Demon", "At the beginning of your upkeep, sacrifice a creature other than Lord of the Pit.", 7);
  assert.ok(!/~ of the pit/.test(CS.cardTraits(lord).text), "nonlegendary names stay whole");
});

test("cycle 25: commanders that grow themselves read as a commander-damage threat", () => {
  const t = (name, text, power) => CS.cardTraits(sc25(name, "Legendary Creature — Test", text, 3, { power: power || 2, toughness: 2 }));
  assert.ok(CS.selfGrows(t("Karlov of the Ghost Council", "Whenever you gain life, put two +1/+1 counters on Karlov.")));
  assert.ok(CS.selfGrows(t("Tifa Lockhart", "Trample\nLandfall — Whenever a land you control enters, double Tifa Lockhart's power until end of turn.")));
  assert.ok(CS.selfGrows(t("Omnath, Locus of Mana", "Omnath gets +1/+1 for each unspent green mana you have.")));
  assert.ok(!CS.selfGrows(t("Grow Others", "Whenever you gain life, put a +1/+1 counter on target creature.")), "pumping others isn't growing itself");
  // a Karlov deck: life gain feeds the commander, so Voltron joins the plan with no Equipment
  const cmd = sc25("Karlov of the Ghost Council", "Legendary Creature — Spirit Advisor", "Whenever you gain life, put two +1/+1 counters on Karlov.", 2, { power: 2, toughness: 2 });
  const deck = [cmd].concat(c25filler(30, "Creature — Cleric", "Lifelink\nWhenever this creature attacks, you gain 1 life."), c25filler(5, "Instant", "Target creature you control gains hexproof and indestructible until end of turn."));
  const prof = CS.deckProfile(deck, cmd.name);
  assert.ok(prof.route.kind === "voltron" || prof.route.also.includes("voltron"), JSON.stringify(prof.route.scores));
  assert.ok(prof.route.grows);
  const syn = CS.deckSynergy(prof, deck);
  assert.match(syn.game.wins[0].why, /commander damage \(it grows itself/);
});

test("cycle 25: milling opponents is its own route, apart from filling your graveyard", () => {
  const opp = CS.cardTraits(sc25("Opp Mill", "Sorcery", "Each opponent mills four cards.", 2));
  assert.ok(opp.gives.oppmill && !opp.gives.graveyard, JSON.stringify(opp.gives));
  const self = CS.cardTraits(sc25("Self Mill", "Sorcery", "Mill four cards. Return a creature card from your graveyard to your hand.", 2));
  assert.ok(self.gives.graveyard && !self.gives.oppmill, JSON.stringify(self.gives));
  const either = CS.cardTraits(sc25("Either Mill", "Artifact", "{T}: Target player mills two cards.", 1));
  assert.ok(either.gives.graveyard && either.gives.oppmill, "target player: either");
  const bruvac = sc25("Bruvac the Grandiloquent", "Legendary Creature — Human Advisor", "If an opponent would mill one or more cards, they mill twice that many cards instead. (To mill a card, a player puts the top card of their library into their graveyard.)", 3, { power: 1, toughness: 5 });
  const bt = CS.cardTraits(bruvac);
  assert.ok(bt.wants.oppmill && !bt.gives.graveyard, "the reminder text isn't self-mill: " + JSON.stringify(bt.gives));
  const deck = [bruvac].concat(c25filler(20, "Sorcery", "Target opponent mills three cards."), c25filler(10, "Creature — Crab", "Whenever a land you control enters, target player mills three cards."));
  const prof = CS.deckProfile(deck, bruvac.name);
  assert.equal(prof.route.kind, "mill");
  assert.ok(CS.deckSynergy(prof, deck).game.wins.some((w) => /mills opponents/.test(w.why)));
});

test("cycle 25: one ping card is a backup finisher unless the deck is built to drain", () => {
  const cmd = sc25("Artifact Boss", "Legendary Creature — Artificer", "Whenever an artifact you control enters, draw a card.", 4, { power: 3, toughness: 3 });
  const tremors = sc25("Ping Tremors", "Enchantment", "Whenever a creature you control enters, this enchantment deals 1 damage to each opponent.", 2);
  const merchant = sc25("Devotion Drain", "Creature — Zombie", "When this creature enters, each opponent loses X life, where X is your devotion to black.", 5, { power: 2, toughness: 4 });
  const base = [cmd].concat(c25filler(30, "Artifact", "{T}: Add {C}. Artifacts you control have hexproof."));
  const winsOf = (extra) => {
    const deck = base.concat(extra);
    const prof = CS.deckProfile(deck, cmd.name);
    assert.ok(!["drain", "aristocrats", "lifegain", "spells", "wheels"].includes(prof.route.kind), prof.route.kind);
    const game = CS.deckSynergy(prof, deck).game;
    return { main: game.wins.filter((w) => !w.backup).map((w) => w.name), backup: game.wins.filter((w) => w.backup).map((w) => w.name), game };
  };
  const one = winsOf([tremors, merchant]);
  assert.ok(!one.main.includes("Ping Tremors") && one.backup.includes("Ping Tremors"), "one ping card: a backup finisher, not the plan");
  assert.ok(one.main.includes("Devotion Drain"), "a drain that scales still is");
  assert.equal(one.game.ids["c25-Ping Tremors"], "win", "still a finisher's job, so cut ideas keep it");
  assert.match(CS.gamePlanLines(one.game, 0).slice(-1)[0], /backup Ping Tremors/);
  const four = [0, 1, 2, 3].map((i) => sc25("Ping Tremors " + i, "Enchantment", "Whenever a creature you control enters, this enchantment deals 1 damage to each opponent.", 2));
  assert.equal(winsOf(four).main.filter((n) => /^Ping Tremors/.test(n)).length, 4, "four add up");
});

// ---------------------------------------------------------------- cycle 26: Nick's notes, fixed at the rule
test("cycle 26: a creature that borrows your creatures' activated abilities wants untappers (Marvin)", () => {
  const marvin = CS.cardTraits(sc25("Marvin, Murderous Mimic", "Legendary Artifact Creature — Toy", "Marvin has all activated abilities of creatures you control that don't have the same name as this creature.", 2, { power: 2, toughness: 2 }));
  assert.ok(marvin.wants.untapc && marvin.wants.tap, JSON.stringify(marvin.wants));
});

test("cycle 26: half a life loop isn't a finisher without the other half", () => {
  const cmd = sc25("Loop Boss", "Legendary Creature — Vampire", "Flying", 3, { power: 3, toughness: 3 });
  const half = sc25("Loss Half", "Creature — Vampire Knight", "Flying, deathtouch\nWhenever an opponent loses life, you gain that much life.", 4, { power: 3, toughness: 3 });
  const other = sc25("Gain Half", "Enchantment", "Whenever you gain life, target opponent loses that much life.", 6);
  const base = [cmd].concat(c25filler(30, "Creature — Vampire", "Lifelink"));
  const ids = (extra) => {
    const deck = base.concat(extra);
    const prof = CS.deckProfile(deck, cmd.name);
    return CS.deckSynergy(prof, deck).game.wins.map((w) => w.name);
  };
  assert.ok(!ids([half]).includes("Loss Half"), "alone it only gains life");
  const both = ids([half, other]);
  assert.ok(both.includes("Loss Half") && both.includes("Gain Half"), both.join(", "));
});

test("cycle 26: other cuts are offered only with a reason that's true of the card", () => {
  const cands = [
    { name: "Protect Spell", id: "a", cut: 0.6, tie: 30, roles: ["protection"], reasons: [], planJob: null },
    { name: "Big Finisher", id: "b", cut: 0.5, tie: 40, roles: [], reasons: [], planJob: "win" },
    { name: "Plain Low", id: "c", cut: 0.55, tie: 30, roles: [], reasons: [], planJob: null },
    { name: "Plain High", id: "d", cut: 0.5, tie: 80, roles: [], reasons: [], planJob: null },
    { name: "Extra Draw", id: "e", cut: 0.4, tie: 50, roles: ["draw"], reasons: ["More card draw than the deck needs: 13 cards, most decks run about 10"], planJob: null },
  ];
  const alts = CS.cutAlternates([], cands, zurgoProfile, null, {}, [], 10, { avgTie: 60 });
  const names = alts.map((a) => a.name);
  assert.deepEqual(names.sort(), ["Extra Draw", "Plain Low"], names.join(", "));
  assert.ok(alts.every((a) => !/weaker ties/.test(a.why)));
});

test("cycle 26: a card with no role isn't called weak; its cut reason says what strength means for it", () => {
  const ideas = CS.cutSuggestions(zimoneProfile, zimoneSyn, zimoneSlims, {}).concat(CS.cutSuggestions(zurgoProfile, zurgoSyn, zurgoSlims, {}));
  const plain = ideas.filter((x) => !x.roles.length && !x.land);
  assert.ok(plain.length, "some plain cut ideas");
  assert.ok(plain.every((x) => !/^Tie-in \d+ and strength/.test(x.reasons[0])), plain.map((x) => x.name + ": " + x.reasons[0]).join("; "));
});

test("cycle 26: the land count weighs the curve and cheap ramp and draw (Karsten)", () => {
  const mk = (n, cmc, text) => Array.from({ length: n }, (_, i) => fc("C26 " + cmc + " " + text.slice(0, 6) + i, "Creature \u2014 Elf", text, cmc));
  const cmd = fc("C26 Cmdr", "Legendary Creature \u2014 Elf", "Trample", 3);
  const elves = [cmd].concat(mk(20, 1, "{T}: Add {G}."), mk(20, 4, "Trample"));
  const fatties = [cmd].concat(mk(40, 4, "Trample"));
  const lines = (cards) => cards.map((c) => ({ qty: 1, name: c.name })).concat([{ qty: 35, name: "Forest" }]);
  const t = (cards) => CS.landCount(CS.deckProfile(cards, cmd.name), lines(cards), {}, cards);
  const a = t(elves), b = t(fatties);
  assert.equal(a.cheap, 20);
  assert.ok(a.target < b.target - 5, JSON.stringify([a, b]));
  assert.ok(a.target >= 31 && b.target <= 42);
});

// ---------------------------------------------------- start over (cycle 30)

test("cycle 30: Start over clears this deck and versions that would carry into it, not other decks", () => {
  const mem = memoryStorage();
  mem.setItem("tb:settings", '{"theme":"dark"}');
  mem.setItem("cs:settings", '{"v":1,"hideGameChangers":true,"maxPrice":null,"types":[]}');
  const store = CS.makeStore(mem);
  const slug = "zurgo-stormrender";
  const keys = CS.deckKeys(parsed.cards);
  const id = CS.deckId("Zurgo Stormrender", parsed.cards);
  let st = CS.newDeckState("Zurgo Stormrender", 1, keys);
  st = CS.decide(st, "a", "add", 2);
  st = CS.decide(st, "b", "add", 3);
  st = CS.decide(st, "c", "maybe", 4);
  st = CS.decide(st, "d", "skip", 5);
  st = CS.cutOne(st, "Spirit Mantle", 1, 6);
  CS.saveDeckState(store, id, st);
  store.set(CS.oldDeckKey(id), { v: 1, commander: "Zurgo Stormrender", decisions: { z: "add" }, history: ["z"] });
  // an earlier version of the same list (one card different): would carry over
  const edited = CS.parseExport(editedExport(["Dawn Charm"], ["Teysa Karlov"]));
  const oldId = CS.deckId("Zurgo Stormrender", edited.cards);
  let olds = CS.newDeckState("Zurgo Stormrender", 1, CS.deckKeys(edited.cards));
  olds = CS.decide(olds, "q", "add", 2);
  CS.saveDeckState(store, oldId, olds);
  // another Zurgo deck: shares few cards, stays
  const otherKeys = ["zurgo stormrender", "sol ring", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
  let other = CS.newDeckState("Zurgo Stormrender", 1, otherKeys);
  other = CS.decide(other, "w", "add", 2);
  store.set("deck2:zurgo-stormrender-00000000", other);
  // another commander whose slug starts the same: stays
  store.set("deck2:zurgo-stormrender-ii-11111111", st);
  const plan = CS.startOverPlan(store, slug, id, keys, st);
  assert.deepEqual(plan.counts, { add: 2, maybe: 1, skip: 1, cuts: 1 });
  assert.deepEqual(plan.keys.slice().sort(), [CS.oldDeckKey(id), CS.deckKey(id), CS.deckKey(oldId)].sort());
  const before = JSON.stringify(mem.keys().sort());
  const backup = CS.startOver(store, plan, id, 9);
  assert.equal(store.get(CS.deckKey(id), null), null);
  assert.equal(store.get(CS.oldDeckKey(id), null), null);
  assert.equal(store.get(CS.deckKey(oldId), null), null);
  assert.ok(store.get("deck2:zurgo-stormrender-00000000", null), "the other Zurgo deck stays");
  assert.ok(store.get("deck2:zurgo-stormrender-ii-11111111", null), "another commander stays");
  assert.ok(store.get("settings", null), "settings stay");
  assert.equal(mem.getItem("tb:settings"), '{"theme":"dark"}', "other apps' keys untouched");
  assert.equal(CS.findCarrySource(CS.savedDecksFor(store, slug), slug, keys), null, "nothing carries back in on the next paste");
  // the undo copy survives a JSON round trip (tab storage) and puts everything back
  const copy = JSON.parse(JSON.stringify(backup));
  assert.ok(CS.checkStartOverBackup(copy, id));
  assert.equal(CS.checkStartOverBackup(copy, oldId), null, "only for its own deck");
  assert.equal(CS.undoStartOver(store, copy), true);
  assert.deepEqual(CS.readDeckState(store, id).decisions, st.decisions);
  assert.ok(store.get(CS.oldDeckKey(id), null));
  assert.deepEqual(CS.readDeckState(store, oldId).decisions, { q: "add" });
  assert.equal(JSON.stringify(mem.keys().sort()), before);
  // review Should 1: a second Start over before Undo keeps the first copy's values,
  // so one Undo goes all the way back
  const first = CS.startOver(store, CS.startOverPlan(store, slug, id, keys, st), id, 10);
  let fresh = CS.decide(CS.newDeckState("Zurgo Stormrender", 11, keys), "n", "add", 12);
  CS.saveDeckState(store, id, fresh);
  const second = CS.startOver(store, CS.startOverPlan(store, slug, id, keys, fresh), id, 13, JSON.parse(JSON.stringify(first)));
  assert.equal(second.at, 10);
  assert.deepEqual(second.saves[CS.deckKey(id)].decisions, st.decisions, "the first copy's value wins");
  assert.ok(second.saves[CS.deckKey(oldId)], "the earlier version is still in the copy");
  assert.equal(CS.startOver(store, { deckId: id, keys: [], counts: {} }, id, 14, { v: 1, deckId: oldId, saves: {} }).at, 14, "another deck's copy is ignored");
  assert.equal(CS.undoStartOver(store, second), true);
  assert.deepEqual(CS.readDeckState(store, id).decisions, st.decisions);
});

test("cycle 30: Start over with nothing saved, odd undo copies, and storage that throws", () => {
  const store = CS.makeStore(memoryStorage());
  const keys = CS.deckKeys(parsed.cards);
  const id = CS.deckId("Zurgo Stormrender", parsed.cards);
  const plan = CS.startOverPlan(store, "zurgo-stormrender", id, keys, CS.newDeckState("Zurgo Stormrender", 1, keys));
  assert.deepEqual(plan, { deckId: id, keys: [], counts: { add: 0, maybe: 0, skip: 0, cuts: 0 } });
  for (const bad of [null, 5, { v: 2, deckId: id, saves: {} }, { v: 1, deckId: id, saves: [] }, { v: 1, deckId: id, saves: { "settings": {} } }])
    assert.equal(CS.checkStartOverBackup(bad, id), null, JSON.stringify(bad));
  assert.equal(CS.undoStartOver(store, { v: 1, deckId: id, saves: { settings: { v: 9 } } }), false, "never writes outside deck saves");
  assert.equal(store.get("settings", null), null);
  const throwing = CS.makeStore({
    getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); },
    removeItem() { throw new Error("no"); }, key() { throw new Error("no"); }, length: 0,
  });
  const p2 = CS.startOverPlan(throwing, "zurgo-stormrender", id, keys, null);
  assert.deepEqual(p2.keys, []);
  assert.deepEqual(CS.startOver(throwing, p2, id, 1).saves, {});
  // a remove that fails is reported (review Note)
  const mem3 = memoryStorage();
  const sticky = CS.makeStore({ ...mem3, getItem: mem3.getItem, setItem: mem3.setItem, key: (i) => mem3.keys()[i], get length() { return mem3.keys().length; }, removeItem() { throw new Error("no"); } });
  sticky.set(CS.deckKey(id), CS.decide(CS.newDeckState("Zurgo Stormrender", 1, keys), "a", "add", 2));
  const p3 = CS.startOverPlan(sticky, "zurgo-stormrender", id, keys, null);
  assert.deepEqual(CS.startOver(sticky, p3, id, 1).failed, [CS.deckKey(id)]);
  assert.equal(CS.undoStartOver(throwing, { v: 1, deckId: id, saves: { ["deck2:" + id]: {} } }), false);
});

test("cycle 31: making attacks free (Reconnaissance, vigilance for the team) rewards an attacking deck", () => {
  const recon = CS.cardTraits({ id: "r", name: "Reconnaissance", types: "Enchantment", text: "{0}: Remove target attacking creature you control from combat and untap it. (If you activate during end of combat, the creature will untap after it deals combat damage.)" });
  assert.ok(recon.gives.attacks, "Reconnaissance helps attacking");
  const gust = CS.cardTraits({ id: "g", name: "Gustcloak Savior", types: "Creature \u2014 Bird Soldier", text: "Flying\nWhenever a creature you control becomes blocked, you may untap that creature and remove it from combat." });
  assert.ok(gust.gives.attacks, "untap that creature and remove it from combat");
  const brave = CS.cardTraits({ id: "b", name: "Brave the Sands", types: "Enchantment", text: "Creatures you control have vigilance.\nEach creature you control can block an additional creature each combat." });
  assert.ok(brave.gives.attacks, "vigilance for the team");
  const maze = CS.cardTraits({ id: "m", name: "Maze of Ith", types: "Land", text: "{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn." });
  assert.ok(!maze.gives.attacks && maze.gives.deter, "Maze of Ith stays defense");
  const own = CS.cardTraits({ id: "o", name: "Lone Guard", types: "Creature \u2014 Human", text: "Vigilance" });
  assert.ok(!own.gives.attacks, "a creature with vigilance itself isn't team attack help");
});

test("cycle 31: a word for card strength, shown beside a low fit", () => {
  assert.equal(CS.strengthWord(75), "strong in most decks");
  assert.equal(CS.strengthWord(CS.STRONG_CARD), "strong in most decks");
  assert.equal(CS.strengthWord(59), null);
  assert.equal(CS.strengthWord(undefined), null);
});
