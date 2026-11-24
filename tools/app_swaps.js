#!/usr/bin/env node
/*
 * app_swaps.js: ask Commander Swipe's own logic (core.js) for a deck's
 * top recommendations and the cuts to pair with them, the way the page
 * does it, and write a swaps file the sim tools can turn into a variant.
 *
 *   node tools/app_swaps.js <core.js> <export.txt> <out swaps.json> [options]
 *     --n N            how many swaps (default 5)
 *     --name LABEL     label for the variant deck (default "<deck>-appN")
 *     --edhrec FILE    a saved EDHREC commander page (JSON); otherwise it is
 *                      fetched from json.edhrec.com (works on the PC, not in
 *                      Claude's cloud workspace) and, if that fails, the
 *                      Scryfall-only piles are used, as the page does
 *     --tags FILE      the app's data/card_tags.json (default: next to core.js)
 *     --combos FILE    the app's combos/<commander>.json (default: next to core.js)
 *     --picks staples  control: picks are the colors' most-played cards instead
 *                      of the app's ranking (cuts stay the app's)
 *
 * Mirrors index.html: loadDeck (Scryfall collection), selectCommander
 * (deckProfile, deckSynergy), rebuildFitPile ("Best for your deck":
 * CS.recScore over EDHREC's cards) and cutIdeas (CS.cutSuggestions plus
 * CS.fillCuts, with combo pieces protected). Picks come from "Best for your
 * deck" in order; cuts are the app's cut ideas, as many as there are picks.
 * Card price never counts (the app ignores it).
 */
"use strict";
const fs = require("fs");
const path = require("path");

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
}

const [corePath, exportPath, outPath] = process.argv.slice(2, 5);
if (!corePath || !exportPath || !outPath) {
  console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
  process.exit(2);
}
const CS = require(path.resolve(corePath));
const appDir = path.dirname(path.resolve(corePath));
const N = parseInt(arg("--n", "5"), 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastScry = 0;
async function scryfall(p, body) {
  const wait = lastScry + 120 - Date.now(); // AGENTS.md: at least 100 ms apart
  if (wait > 0) await sleep(wait);
  lastScry = Date.now();
  const res = await fetch("https://api.scryfall.com" + p, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "CommanderSwipeSims/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404)
    throw new Error("Scryfall answered " + res.status);
  return res.json();
}

async function collection(identifiers) {
  const out = { data: [], notFound: [] };
  for (const part of CS.chunk(identifiers, 75)) {
    const r = await scryfall("/cards/collection", { identifiers: part });
    out.data = out.data.concat(r.data || []);
    out.notFound = out.notFound.concat(r.not_found || []);
  }
  return out;
}

async function edhrecPage(name) {
  const file = arg("--edhrec", null);
  if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
  const get = async (url) => {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("EDHREC answered " + res.status);
    return res.json();
  };
  const j = await get(CS.edhrecUrl(name));
  if (
    j &&
    typeof j.redirect === "string" &&
    /^\/commanders\/[a-z0-9-]+$/.test(j.redirect) &&
    !CS.edhrecLists(j).length
  ) {
    return get("https://json.edhrec.com/pages" + j.redirect + ".json");
  }
  return j;
}

async function searchAll(query, pages) {
  let url = CS.searchUrl(query).replace("https://api.scryfall.com", "");
  const cards = [];
  for (let i = 0; i < pages && url; i++) {
    const r = await scryfall(url);
    if (!r || r.object === "error") break;
    (r.data || []).forEach((c) => cards.push(c));
    const next = CS.safeNextPage(r);
    url = next ? next.replace("https://api.scryfall.com", "") : null;
  }
  return cards;
}

(async function main() {
  const tagsPath = arg("--tags", path.join(appDir, "data", "card_tags.json"));
  if (fs.existsSync(tagsPath))
    CS.setCardTags(JSON.parse(fs.readFileSync(tagsPath, "utf8")));

  const text = fs.readFileSync(exportPath, "utf8");
  const parsed = CS.parseExport(text);
  let r = await collection(CS.deckIdentifiers(parsed.cards));
  const retry = CS.retryIdentifiers(parsed.cards, r.data);
  if (retry.length) {
    const r2 = await collection(retry);
    r = { data: r.data.concat(r2.data), notFound: r2.notFound };
  }
  const matched = CS.matchCollection(parsed.cards, r.data);
  const candidates = CS.commanderCandidates(matched);
  if (!candidates.length) throw new Error("no commander found in the export");
  const cmd = candidates[0]; // the page asks when there are several; Moxfield lists the commander first
  const cardInfo = {};
  r.data.forEach((sc) => (cardInfo[sc.id] = CS.slimCard(sc)));
  const deckNames = CS.matchedNameSet(parsed.cards, matched);
  const slims = matched.filter((m) => m.card).map((m) => CS.slimCard(m.card));
  const profile = CS.deckProfile(slims, cmd.name, null);
  const syn = CS.deckSynergy(profile, slims);

  // candidate cards: EDHREC's page (as the page does), else Scryfall's piles
  let edhrecMap = {};
  let source = "edhrec";
  const recs = {};
  try {
    const page = await edhrecPage(cmd.name);
    if (!CS.buildEdhrecPiles(page, deckNames).length)
      throw new Error("no recommendations on the page");
    edhrecMap = CS.edhrecById(page);
    Object.keys(edhrecMap).forEach((id) => (recs[id] = edhrecMap[id]));
    const ids = CS.edhrecIdentifiers(page)
      .map((x) => x.id)
      .filter((id) => !cardInfo[id]);
    const got = await collection(ids.map((id) => ({ id })));
    got.data.forEach((sc) => (cardInfo[sc.id] = CS.slimCard(sc)));
  } catch (e) {
    source = "scryfall (EDHREC unavailable: " + e.message + ")";
    const pool = await searchAll(CS.everythingQuery(cmd.colorIdentity), 2);
    for (const role of CS.ROLES) {
      (
        await searchAll(
          CS.roleQuery(role.tag, cmd.colorIdentity, role.extra),
          1,
        )
      ).forEach((c) => pool.push(c));
    }
    pool.forEach((sc) => {
      if (!cardInfo[sc.id]) cardInfo[sc.id] = CS.slimCard(sc);
      if (!recs[sc.id]) recs[sc.id] = { id: sc.id, name: sc.name };
    });
  }

  // Best for your deck (index.html rebuildFitPile)
  const list = [];
  Object.keys(recs).forEach((id) => {
    const info = cardInfo[id];
    if (!info || deckNames[CS.nameKey(info.name)] || CS.isBasicLand(info.name))
      return;
    if (
      !CS.identityFits((info.colorIdentity || []).join(""), cmd.colorIdentity)
    )
      return;
    const f = CS.blendFit(CS.fitScore(info, profile), CS.strength(info));
    const e = edhrecMap[id];
    list.push({
      name: info.name,
      fit: f.score,
      score: CS.recScore(
        f.tieIn,
        e && e.onEdhrec ? e : null,
        info,
        f.strength,
        f.plan,
      ),
    });
  });
  list.sort(
    (a, b) => b.score - a.score || b.fit - a.fit || (a.name < b.name ? -1 : 1),
  );
  let picks = list.slice(0, N);
  const mode = arg("--picks", "app");
  if (mode === "staples") {
    // control: the colors' most-played cards (Scryfall order:edhrec), not the app's ranking;
    // same cuts as the app, so only the picks differ
    const top = await searchAll(CS.everythingQuery(cmd.colorIdentity), 1);
    picks = top
      .filter((sc) => !deckNames[CS.nameKey(sc.name)] && !/\bLand\b/.test(sc.type_line || ""))
      .slice(0, N)
      .map((sc) => ({ name: sc.name, fit: null, score: null }));
  }

  // cut ideas (index.html cutOpts / cutIdeas), combo pieces protected
  const protect = {};
  const comboPath =
    arg("--combos", null) || path.join(appDir, CS.comboFileUrl(cmd.name) || "");
  if (
    comboPath &&
    fs.existsSync(comboPath) &&
    fs.statSync(comboPath).isFile()
  ) {
    const d = CS.deckCombos(
      JSON.parse(fs.readFileSync(comboPath, "utf8")),
      deckNames,
      cmd.colorIdentity,
    );
    d.inDeck
      .concat(d.needsPiece)
      .forEach((c) => c.cards.forEach((n) => (protect[CS.nameKey(n)] = true)));
  }
  const edhrecByName = {};
  Object.keys(edhrecMap).forEach((id) => {
    const e = edhrecMap[id];
    if (e && e.name) edhrecByName[CS.nameKey(e.name)] = e;
  });
  const opts = {
    protect,
    cuts: {},
    edhrec: Object.keys(edhrecByName).length ? edhrecByName : null,
    deckCards: parsed.cards,
    slims,
    today: new Date().toISOString().slice(0, 10),
  };
  const ideas = CS.fillCuts(
    CS.cutSuggestions(profile, syn, slims, opts),
    profile,
    syn,
    slims,
    opts,
    picks.length,
  );
  const cuts = ideas.slice(0, picks.length);
  const nameOf = (c) =>
    c.name || (c.slim && c.slim.name) || (c.card && c.card.name) || String(c);

  const base = path.basename(exportPath).replace(/\.[^.]+$/, "");
  const out = {
    name: arg("--name", base + "-app" + N),
    made: new Date().toISOString(),
    commander: cmd.name,
    source,
    picks_from: mode,
    in: picks.map((p) => p.name),
    out: cuts.map(nameOf),
    detail: {
      picks,
      cuts: cuts.map((c) => ({
        name: nameOf(c),
        reasons: c.reasons || [],
        score: c.score,
      })),
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
  console.log(
    JSON.stringify(
      { wrote: outPath, commander: cmd.name, source, in: out.in, out: out.out },
      null,
      1,
    ),
  );
})().catch((e) => {
  console.error("app_swaps failed: " + e.message);
  process.exit(1);
});
