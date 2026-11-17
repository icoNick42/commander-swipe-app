// Checks data/synergy-taxonomy.json, the synergy research in data form.
// Run from the app folder: node tests/taxonomy.test.js
// Uses only Node's built-in test runner (Node 18+); no packages.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TAX = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "synergy-taxonomy.json"),
    "utf8",
  ),
);
const deck = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "scryfall_deck.json"),
    "utf8",
  ),
).data;

// Keys whose values are lists of patterns (strings or {all: [...]} items).
const PATTERN_KEYS = new Set(["regex", "producers", "consumers", "fallback"]);

/** Expands %MACROS%; %TYPE% gets a sample type so typal patterns compile. */
function expand(src) {
  const m = TAX.normalization.macros;
  return src.replace(/%[A-Z]+%/g, (name) => {
    if (name === "%TYPE%") return "(?<!non-)(?:elf|elves)\\b";
    const def = m[name];
    if (!def || def.runtime)
      throw new Error("unknown or runtime macro " + name + " in " + src);
    return def.pattern;
  });
}

/** Every pattern string in the file, with where it was found. */
function allPatterns() {
  const out = [];
  (function walk(node, where) {
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, where + "[" + i + "]"));
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (PATTERN_KEYS.has(k) && Array.isArray(v)) {
          v.forEach((item, i) => {
            const items =
              typeof item === "string" ? [item] : (item && item.all) || [];
            if (
              typeof item !== "string" &&
              !(item && Array.isArray(item.all))
            ) {
              out.push({ where: where + "." + k + "[" + i + "]", src: null });
            }
            items.forEach((s) =>
              out.push({ where: where + "." + k + "[" + i + "]", src: s }),
            );
          });
        } else {
          walk(v, where + "." + k);
        }
      }
    }
  })(TAX, "$");
  return out;
}

/** Card text the way the file asks: every face, own name and "this creature" as ~. */
function cardText(card) {
  let t =
    card.oracle_text != null
      ? card.oracle_text
      : (card.card_faces || []).map((f) => f.oracle_text || "").join("\n");
  const names = [];
  card.name.split(" // ").forEach((n) => {
    names.push(n);
    const short = n.split(",")[0];
    if (short !== n && short.length > 3) names.push(short);
  });
  names
    .sort((a, b) => b.length - a.length)
    .forEach((n) => (t = t.split(n).join("~")));
  return t
    .replace(/\(.*?\)/g, "") // reminder text
    .replace(
      /\bthis (creature|artifact|enchantment|land|planeswalker|saga|vehicle|equipment|aura|spacecraft|permanent|card|spell)\b/gi,
      "~",
    );
}

function matches(list, text) {
  return (list || []).some((item) =>
    typeof item === "string"
      ? new RegExp(expand(item), "iu").test(text)
      : item.all.every((s) => new RegExp(expand(s), "iu").test(text)),
  );
}

/** One theme side (enablers or payoffs) against a card, type filters included. */
function sideHits(side, card) {
  if (!side) return false;
  const tl = card.type_line || "";
  const has = (w) => new RegExp("\\b" + w + "\\b", "i").test(tl);
  if (side.only_type_line && !side.only_type_line.some(has)) return false;
  if (side.not_type_line && side.not_type_line.some(has)) return false;
  return matches(side.regex, cardText(card));
}

test("meta block names the schema version", () => {
  assert.equal(TAX.meta.schema_version, 1);
  assert.ok(TAX.meta.sources.length >= 3);
});

test("every pattern expands and compiles with flags iu", () => {
  const pats = allPatterns();
  assert.ok(
    pats.length > 200,
    "expected hundreds of patterns, got " + pats.length,
  );
  const bad = [];
  for (const p of pats) {
    if (p.src === null) {
      bad.push(p.where + ": not a string or {all: [...]}");
      continue;
    }
    try {
      new RegExp(expand(p.src), "iu");
    } catch (e) {
      bad.push(p.where + ": " + e.message);
    }
  }
  assert.deepEqual(bad, []);
});

test("no plain-English notes left inside pattern lists", () => {
  const notes = allPatterns().filter(
    (p) => p.src && /type_line|all_parts|produced_mana/.test(p.src),
  );
  assert.deepEqual(
    notes.map((p) => p.where),
    [],
  );
});

test("themes have unique ids and both sides", () => {
  const ids = TAX.themes.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate theme id");
  for (const t of TAX.themes) {
    assert.ok(t.id && t.name, "theme missing id or name");
    // "typal" is a template that points at the top-level typal block instead.
    assert.ok(
      t.enablers || t.payoffs || t.definition,
      t.id + " has neither enablers nor payoffs",
    );
  }
});

test("no theme matches a big share of popular cards", () => {
  // 350 of the most-played Commander cards. A theme that fires on more than
  // a fifth of them is too broad to say anything about a deck.
  const popular = [
    "scryfall_search_all_p1.json",
    "scryfall_search_all_p2.json",
  ].flatMap(
    (f) =>
      JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8"))
        .data,
  );
  const broad = [];
  for (const t of TAX.themes) {
    const n = popular.filter(
      (c) => sideHits(t.enablers, c) || sideHits(t.payoffs, c),
    ).length;
    if (n > popular.length / 5)
      broad.push(t.id + " " + n + "/" + popular.length);
  }
  assert.deepEqual(broad, []);
});

test("events and doublers are present", () => {
  assert.ok(TAX.events.length >= 10);
  assert.ok(TAX.doublers);
});

test("scoring settings exist for adds, cuts and swaps", () => {
  assert.ok(TAX.add_score && TAX.cut_score && TAX.swap_pairing);
  assert.ok(TAX.cut_score.weights && TAX.cut_score.protections);
});

test("Zurgo sample deck reads as tokens and aristocrats", () => {
  // Count deck cards that are an enabler or payoff for each theme.
  const counts = {};
  for (const t of TAX.themes) {
    counts[t.id] = deck.filter(
      (c) => sideHits(t.enablers, c) || sideHits(t.payoffs, c),
    ).length;
  }
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map((e) => e[0]);
  assert.ok(top.includes("tokens"), "tokens not in top 6: " + top.join(", "));
  assert.ok(
    top.includes("aristocrats"),
    "aristocrats not in top 6: " + top.join(", "),
  );
});
