/*
 * Commander Swipe: core logic.
 *
 * Pure functions with no page access, so the same file runs in the browser
 * (loaded with a plain <script src="core.js">, which makes `CS` a global)
 * and in Node for the tests (require('./core.js')). The one exception is the
 * `store` helper, which is handed its storage object (or finds localStorage
 * itself, safely).
 *
 * Design notes: ../Architecture and plan.md
 */
(function (root) {
  "use strict";

  var CS = {};

  // ---------------------------------------------------------------- names

  // Moxfield writes double-faced cards as "Front / Back"; Scryfall and
  // EDHREC write "Front // Back". Real card names never contain " / ".
  var FACE_SPLIT = /\s+\/\/?\s+/;

  /** Front-face name: "Indulge / Excess" -> "Indulge". */
  CS.frontName = function (name) {
    return String(name || "")
      .split(FACE_SPLIT)[0]
      .trim();
  };

  /** Removes accents: "Lim-Dûl" -> "Lim-Dul". */
  function stripAccents(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /** Key for comparing names: front face, no accents, lowercase, single spaces. */
  CS.nameKey = function (name) {
    return stripAccents(CS.frontName(name))
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  };

  /**
   * EDHREC page slug for a commander: front face, no accents, lowercase,
   * punctuation removed, spaces to hyphens.
   * "Zurgo Stormrender" -> "zurgo-stormrender".
   */
  CS.commanderSlug = function (name) {
    return stripAccents(CS.frontName(name))
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/[\s-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  var BASICS = ["plains", "island", "swamp", "mountain", "forest", "wastes"];

  /** True for basic lands, snow-covered ones included. */
  CS.isBasicLand = function (name) {
    var k = CS.nameKey(name).replace(/^snow-covered /, "");
    return BASICS.indexOf(k) !== -1;
  };

  // ---------------------------------------------------------------- export

  var CARD_LINE = /^(\d+)x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s+(\S+))?$/;
  var MARKERS = /\s\*[A-Z]+\*/g; // *F* foil, *E* etched, and the like
  var SECTION_WORDS =
    /^(commanders?|companions?|deck|main ?deck|mainboard|sideboard|maybeboard|considering|tokens?)$/i;
  // Sections that aren't part of the 100 (cycle 8: counts, cuts and the whole-deck copy skip them).
  var SIDE_WORDS = /^(sideboard|maybeboard|considering|tokens?)$/i;

  /**
   * Reads a Moxfield Export.
   * Returns {cards: [{qty, name, set, number, lineNo, side}], unread: [{lineNo, text}]}.
   * Blank lines, // comments and section headers ("SIDEBOARD:") are skipped
   * quietly; any other line that isn't a card goes in `unread`. `side` is
   * true for cards under a sideboard, maybeboard, considering or tokens
   * header (not part of the 100).
   */
  CS.parseExport = function (text) {
    var cards = [];
    var unread = [];
    var side = false;
    String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .forEach(function (raw, i) {
        var line = raw.replace(MARKERS, "").trim();
        if (!line || line.indexOf("//") === 0) return;
        var m = CARD_LINE.exec(line);
        if (m) {
          cards.push({
            qty: parseInt(m[1], 10),
            name: m[2].trim(),
            set: m[3] ? m[3].toLowerCase() : null,
            number: m[4] || null,
            lineNo: i + 1,
            side: side,
          });
          return;
        }
        var bare = line.replace(/:$/, "").trim();
        if (/:$/.test(line) || SECTION_WORDS.test(bare)) {
          side = SIDE_WORDS.test(bare); // section header
          return;
        }
        unread.push({ lineNo: i + 1, text: raw });
      });
    return { cards: cards, unread: unread };
  };

  // ---------------------------------------------------------------- Scryfall

  /** Splits a list into chunks of n. */
  CS.chunk = function (arr, n) {
    var out = [];
    for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  /**
   * Scryfall /cards/collection identifiers for parsed export lines:
   * set + collector number when the line has them, otherwise the name.
   * Send at most 75 per request (see CS.chunk).
   */
  CS.deckIdentifiers = function (cards) {
    return cards.map(function (c) {
      return c.set && c.number
        ? { set: c.set, collector_number: c.number }
        : { name: CS.frontName(c.name) };
    });
  };

  /**
   * Lines the export up with Scryfall's answer. Returns one entry per export
   * line, in export order: {line, card} where card is the Scryfall card or null.
   * Matches by set + number first, then by name (whole or front face).
   */
  CS.matchCollection = function (cards, scryCards) {
    var bySetNum = {};
    var byName = {};
    (scryCards || []).forEach(function (sc) {
      if (sc.set && sc.collector_number) {
        bySetNum[sc.set.toLowerCase() + "|" + sc.collector_number] = sc;
      }
      byName[CS.nameKey(sc.name)] = byName[CS.nameKey(sc.name)] || sc;
    });
    return cards.map(function (line) {
      var card = null;
      if (line.set && line.number)
        card = bySetNum[line.set + "|" + line.number] || null;
      if (!card) card = byName[CS.nameKey(line.name)] || null;
      return { line: line, card: card };
    });
  };

  function face0(sc) {
    return (sc.card_faces && sc.card_faces[0]) || {};
  }

  /**
   * The parts of a Scryfall card the page uses, flattened. Double-faced
   * cards use the front face for image, text and cost.
   */
  CS.slimCard = function (sc) {
    var f = face0(sc);
    var img =
      (sc.image_uris && sc.image_uris.normal) ||
      (f.image_uris && f.image_uris.normal) ||
      null;
    var usd =
      sc.prices && sc.prices.usd != null ? parseFloat(sc.prices.usd) : null;
    return {
      id: sc.id,
      name: sc.name,
      front: CS.frontName(sc.name),
      typeLine: sc.type_line || f.type_line || "",
      frontType: f.type_line || sc.type_line || "",
      oracle: sc.oracle_text != null ? sc.oracle_text : f.oracle_text || "",
      text:
        sc.oracle_text != null
          ? sc.oracle_text
          : (sc.card_faces || [])
              .map(function (x) {
                return x.oracle_text || "";
              })
              .join("\n"),
      types: sc.type_line || f.type_line || "",
      manaCost: sc.mana_cost || f.mana_cost || "",
      image: img,
      usd: isNaN(usd) ? null : usd,
      gameChanger: sc.game_changer === true,
      colorIdentity: sc.color_identity || [],
      edhrecRank: sc.edhrec_rank != null ? sc.edhrec_rank : null,
      cmc: typeof sc.cmc === "number" ? sc.cmc : null,
    };
  };

  /**
   * Cards that could be the commander, in deck order: legendary creatures
   * and cards whose text says they can be your commander. Takes the output
   * of CS.matchCollection; returns slim cards.
   */
  CS.commanderCandidates = function (matched) {
    var seen = {};
    var out = [];
    matched.forEach(function (m) {
      if (!m.card) return;
      var sc = m.card;
      var type = face0(sc).type_line || sc.type_line || "";
      var text = (sc.oracle_text || "") + "\n" + (face0(sc).oracle_text || "");
      var ok =
        (/\bLegendary\b/.test(type) && /\bCreature\b/.test(type)) ||
        /can be your commander/i.test(text);
      if (ok && !seen[sc.id]) {
        seen[sc.id] = true;
        out.push(CS.slimCard(sc));
      }
    });
    return out;
  };

  /**
   * Role piles: Scryfall Tagger tags (otag:), searched inside the
   * commander's colors. `extra` narrows a noisy tag (fetch lands count as
   * "tutors"; so do Path to Exile and Wayfarer's Bauble, which fetch a land).
   * Tags checked on Scryfall 2026-11-17.
   */
  CS.ROLES = [
    { key: "removal", label: "Removal", tag: "removal" },
    { key: "ramp", label: "Ramp", tag: "ramp" },
    { key: "draw", label: "Card draw", tag: "draw" },
    { key: "protection", label: "Protection", tag: "protection" },
    { key: "wipes", label: "Board wipes", tag: "board-wipe" },
    { key: "tutors", label: "Tutors", tag: "tutor", extra: "-t:land -otag:land-ramp" },
    { key: "recursion", label: "Recursion", tag: "recursion" },
    { key: "sac", label: "Sacrifice outlets", tag: "sacrifice-outlet" },
    { key: "tokens", label: "Token makers", tag: "repeatable-token-generator" },
    { key: "haste", label: "Haste", tag: "gives-haste" },
    { key: "anthems", label: "Anthems", tag: "anthem" },
    { key: "combats", label: "Extra combats", tag: "extra-combat" },
    { key: "gyhate", label: "Graveyard hate", tag: "graveyard-hate" },
  ];

  function colorsFor(colorIdentity) {
    return (colorIdentity || []).join("").toLowerCase() || "c";
  }

  CS.roleQuery = function (tag, colorIdentity, extra) {
    return (
      "id<=" +
      colorsFor(colorIdentity) +
      " f:commander otag:" +
      tag +
      (extra ? " " + extra : "") +
      " order:edhrec"
    );
  };

  /** Every Commander-legal card in the colors, most played first (basics left out). */
  CS.everythingQuery = function (colorIdentity) {
    return (
      "id<=" + colorsFor(colorIdentity) + " f:commander -t:basic order:edhrec"
    );
  };

  CS.searchUrl = function (query) {
    return "https://api.scryfall.com/cards/search?q=" + encodeURIComponent(query);
  };

  CS.roleSearchUrl = function (tag, colorIdentity, extra) {
    return CS.searchUrl(CS.roleQuery(tag, colorIdentity, extra));
  };

  /**
   * Scryfall's next_page link, only if it really is a Scryfall search URL
   * (it's fetched as-is, so nothing else gets through). Otherwise null.
   */
  CS.safeNextPage = function (res) {
    var u = res && res.has_more ? res.next_page : null;
    return typeof u === "string" &&
      u.indexOf("https://api.scryfall.com/cards/search?") === 0
      ? u
      : null;
  };

  CS.edhrecUrl = function (commanderName) {
    return (
      "https://json.edhrec.com/pages/commanders/" +
      CS.commanderSlug(commanderName) +
      ".json"
    );
  };

  var SUB_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  /**
   * One of a commander's extra EDHREC pages: "budget", or a theme slug from
   * the main page ("tokens"). `slug` is the commander's page slug. Returns
   * null for anything that isn't a plain slug.
   */
  CS.edhrecSubUrl = function (slug, sub) {
    if (!SUB_OK.test(String(slug)) || !SUB_OK.test(String(sub))) return null;
    return (
      "https://json.edhrec.com/pages/commanders/" + slug + "/" + sub + ".json"
    );
  };

  /**
   * Themes EDHREC lists for the commander (its "taglinks"), most decks
   * first: [{slug, label, count}]. Themes with fewer than `minDecks` decks
   * (default 20) are left out, as are odd slugs; at most `max` (default 15).
   */
  CS.edhrecThemes = function (edhrecJson, minDecks, max) {
    var min = minDecks == null ? 20 : minDecks;
    var cap = max == null ? 15 : max;
    var links =
      edhrecJson && edhrecJson.panels && edhrecJson.panels.taglinks;
    if (!Array.isArray(links)) return [];
    var seen = {};
    return links
      .filter(function (t) {
        var good =
          t &&
          typeof t.slug === "string" &&
          SUB_OK.test(t.slug) &&
          t.slug !== "budget" &&
          typeof t.value === "string" &&
          t.value.trim() &&
          typeof t.count === "number" &&
          t.count >= min &&
          !seen[t.slug];
        if (good) seen[t.slug] = true;
        return good;
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, cap)
      .map(function (t) {
        return { slug: t.slug, label: t.value.trim(), count: t.count };
      });
  };

  // ---------------------------------------------------------------- piles

  /**
   * EDHREC sections grouped into piles. Unknown sections (if EDHREC adds
   * some) land in "Other" rather than being lost.
   */
  CS.EDHREC_PILES = [
    {
      key: "best",
      label: "Best for this commander",
      tags: ["topcards", "highliftcards", "newcards"],
    },
    { key: "creatures", label: "Creatures", tags: ["creatures"] },
    {
      key: "spells",
      label: "Instants and sorceries",
      tags: ["instants", "sorceries"],
    },
    {
      key: "artifacts",
      label: "Artifacts",
      tags: ["utilityartifacts", "manaartifacts"],
    },
    {
      key: "enchantments",
      label: "Enchantments and planeswalkers",
      tags: ["enchantments", "planeswalkers", "battles"],
    },
    { key: "lands", label: "Lands", tags: ["utilitylands", "lands"] },
  ];

  /** A Set-like lookup of the deck's names (front face, compared loosely). */
  CS.deckNameSet = function (cards) {
    var set = {};
    cards.forEach(function (c) {
      set[CS.nameKey(c.name)] = true;
    });
    return set;
  };

  /**
   * The deck's names as Scryfall knows them, added to an export's name set.
   * A printing with a flavor name ("Ya viene el coco") exports under that
   * name, but EDHREC and Scryfall list the card as Tibalt's Trickery, so
   * without this the deck's own cards come back as recommendations.
   * `matched`: CS.matchCollection output. Returns a new set.
   */
  CS.matchedNameSet = function (cards, matched) {
    var set = CS.deckNameSet(cards || []);
    (matched || []).forEach(function (m) {
      if (m && m.card && m.card.name && !(m.line && m.line.side))
        set[CS.nameKey(m.card.name)] = true;
    });
    return set;
  };

  /**
   * Export lines Scryfall didn't find by set and number (Moxfield's own
   * numbering, like "(PLIST) 789"), as name identifiers for a second
   * /cards/collection call. Returns [] when every line was found.
   */
  CS.retryIdentifiers = function (cards, scryCards) {
    var found = {};
    (scryCards || []).forEach(function (sc) {
      if (sc && sc.set && sc.collector_number)
        found[sc.set.toLowerCase() + "|" + sc.collector_number] = true;
    });
    var seen = {};
    var out = [];
    (cards || []).forEach(function (c) {
      if (!c.set || !c.number || found[c.set + "|" + c.number]) return;
      var n = CS.frontName(c.name);
      if (seen[n.toLowerCase()]) return;
      seen[n.toLowerCase()] = true;
      out.push({ name: n });
    });
    return out;
  };

  function skipCard(name, deckNames) {
    return deckNames[CS.nameKey(name)] === true || CS.isBasicLand(name);
  }

  /** Share of this commander's decks that run the card (0 to 1). */
  CS.inclusion = function (cv) {
    return cv && cv.potential_decks > 0 ? cv.num_decks / cv.potential_decks : 0;
  };

  function recFrom(cv, section) {
    return {
      id: cv.id,
      name: cv.name,
      synergy: typeof cv.synergy === "number" ? cv.synergy : 0,
      inclusion: CS.inclusion(cv),
      numDecks: cv.num_decks || 0,
      potentialDecks: cv.potential_decks || 0,
      section: section,
      onEdhrec: true,
    };
  }

  /** EDHREC's card lists, or [] when the page isn't the shape we expect. */
  CS.edhrecLists = function (edhrecJson) {
    var lists =
      edhrecJson &&
      edhrecJson.container &&
      edhrecJson.container.json_dict &&
      edhrecJson.container.json_dict.cardlists;
    return Array.isArray(lists) ? lists : [];
  };

  /**
   * Builds the EDHREC piles. Cards already in the deck and basic lands are
   * left out; each pile lists a card once. A card can sit in two piles (Best
   * and Creatures, say): the page skips any card already decided.
   * Returns [{key, label, cards: [rec]}], empty piles dropped.
   */
  CS.buildEdhrecPiles = function (edhrecJson, deckNames) {
    var byTag = {};
    var known = {};
    CS.EDHREC_PILES.forEach(function (p) {
      p.tags.forEach(function (t) {
        known[t] = true;
      });
    });
    var other = [];
    CS.edhrecLists(edhrecJson).forEach(function (cl) {
      var tag = cl.tag || "";
      var views = Array.isArray(cl.cardviews) ? cl.cardviews : [];
      if (known[tag])
        byTag[tag] = (byTag[tag] || []).concat(
          views.map(function (cv) {
            return [cv, tag];
          }),
        );
      else
        other = other.concat(
          views.map(function (cv) {
            return [cv, tag];
          }),
        );
    });
    var groups = CS.EDHREC_PILES.map(function (p) {
      var pairs = [];
      p.tags.forEach(function (t) {
        pairs = pairs.concat(byTag[t] || []);
      });
      return { key: p.key, label: p.label, pairs: pairs };
    });
    groups.push({ key: "other", label: "Other", pairs: other });
    return groups
      .map(function (g) {
        var seen = {};
        var cards = [];
        g.pairs.forEach(function (pair) {
          var cv = pair[0];
          if (
            !cv ||
            !cv.id ||
            !cv.name ||
            seen[cv.id] ||
            skipCard(cv.name, deckNames)
          )
            return;
          seen[cv.id] = true;
          cards.push(recFrom(cv, pair[1]));
        });
        return { key: g.key, label: g.label, cards: cards };
      })
      .filter(function (p) {
        return p.cards.length > 0;
      });
  };

  /** Every EDHREC card by Scryfall id (EDHREC's id is Scryfall's id). */
  CS.edhrecById = function (edhrecJson) {
    var map = {};
    CS.edhrecLists(edhrecJson).forEach(function (cl) {
      (cl.cardviews || []).forEach(function (cv) {
        if (cv && cv.id && !map[cv.id]) map[cv.id] = recFrom(cv, cl.tag || "");
      });
    });
    return map;
  };

  /** Scryfall identifiers for every EDHREC card, for /cards/collection. */
  CS.edhrecIdentifiers = function (edhrecJson) {
    return Object.keys(CS.edhrecById(edhrecJson)).map(function (id) {
      return { id: id };
    });
  };

  var BEST_TAGS = ["topcards", "highliftcards"];

  /**
   * One pile from a whole EDHREC page (a theme page or the budget page):
   * its Top and High Lift cards first, in that order, then every other card
   * by synergy (highest first; New Cards go here, since they have few decks
   * behind them yet). Deck cards and basics are left out; each card once.
   * Returns {key, label, cards}.
   */
  CS.buildEdhrecPagePile = function (key, label, edhrecJson, deckNames) {
    var seen = {};
    var best = [];
    var rest = [];
    CS.edhrecLists(edhrecJson).forEach(function (cl) {
      var tag = cl.tag || "";
      (Array.isArray(cl.cardviews) ? cl.cardviews : []).forEach(function (cv) {
        if (
          !cv ||
          !cv.id ||
          !cv.name ||
          seen[cv.id] ||
          skipCard(cv.name, deckNames)
        )
          return;
        seen[cv.id] = true;
        var rec = recFrom(cv, key);
        var at = BEST_TAGS.indexOf(tag);
        if (at === -1) rest.push(rec);
        else best.push([at, best.length, rec]);
      });
    });
    best.sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    best = best.map(function (x) {
      return x[2];
    });
    rest.sort(function (a, b) {
      return b.synergy - a.synergy;
    });
    return { key: key, label: label, cards: best.concat(rest) };
  };

  /**
   * More Scryfall search results for a pile already on screen: the cards
   * not in it yet, in Scryfall's order. Cards EDHREC also recommends keep
   * their EDHREC numbers. Deck cards and basics are left out.
   */
  CS.moreSearchCards = function (pile, scryCards, edhrecMap, deckNames) {
    var have = {};
    ((pile && pile.cards) || []).forEach(function (c) {
      have[c.id] = true;
    });
    var out = [];
    (scryCards || []).forEach(function (sc) {
      if (!sc || !sc.id || have[sc.id] || skipCard(sc.name, deckNames)) return;
      have[sc.id] = true;
      var rec = edhrecMap && edhrecMap[sc.id];
      out.push(
        rec
          ? Object.assign({}, rec, { section: pile.key })
          : {
              id: sc.id,
              name: sc.name,
              synergy: 0,
              inclusion: 0,
              numDecks: 0,
              potentialDecks: 0,
              section: pile.key,
              onEdhrec: false,
            },
      );
    });
    return out;
  };

  /**
   * A role pile from one page of Scryfall search results: cards EDHREC also
   * recommends come first, by synergy; then up to `extra` (default 25)
   * Scryfall-only cards in Scryfall's order, marked onEdhrec: false.
   * Works with an empty edhrecMap (EDHREC down or no page).
   */
  CS.buildRolePile = function (role, scryCards, edhrecMap, deckNames, extra) {
    var limit = extra == null ? 25 : extra;
    var onE = [];
    var offE = [];
    var seen = {};
    (scryCards || []).forEach(function (sc) {
      if (!sc || !sc.id || seen[sc.id] || skipCard(sc.name, deckNames)) return;
      seen[sc.id] = true;
      var rec = edhrecMap && edhrecMap[sc.id];
      if (rec) {
        onE.push(Object.assign({}, rec, { section: role.key }));
      } else if (offE.length < limit) {
        offE.push({
          id: sc.id,
          name: sc.name,
          synergy: 0,
          inclusion: 0,
          numDecks: 0,
          potentialDecks: 0,
          section: role.key,
          onEdhrec: false,
        });
      }
    });
    onE.sort(function (a, b) {
      return b.synergy - a.synergy;
    });
    return { key: role.key, label: role.label, cards: onE.concat(offE) };
  };

  // ---------------------------------------------------------------- combos

  /*
   * Combos come from Commander Spellbook (commanderspellbook.com). Its API
   * doesn't let web pages read it, so a helper script asks it about one
   * deck and saves a trimmed copy as combos/<commander slug>.json, which
   * the page reads from its own site. The page then works out, for the
   * deck pasted now, which combos are already in it and which are one card
   * away. Combos are shown as information, with Spellbook's bracket tag, so
   * a deck can stay at the table's power level.
   */

  /** Spellbook's bracket tags and the Commander bracket each one points to. */
  CS.COMBO_BRACKETS = {
    E: { n: 1, label: "Exhibition" },
    C: { n: 2, label: "Core" },
    O: { n: 2, label: "Oddball" },
    P: { n: 3, label: "Powerful" },
    S: { n: 3, label: "Spicy" },
    R: { n: 4, label: "Ruthless" },
    B: { n: 5, label: "Banned" },
  };

  /** {n, label} for a bracket tag; an unknown tag counts as bracket 4, to be safe. */
  CS.comboBracket = function (tag) {
    return CS.COMBO_BRACKETS[tag] || { n: 4, label: "Unknown" };
  };

  /** Where the page finds a commander's combo file (on its own site). */
  CS.comboFileUrl = function (commanderName) {
    var slug = CS.commanderSlug(commanderName);
    return slug ? "combos/" + slug + ".json" : null;
  };

  /** A combo's page on Commander Spellbook. */
  CS.comboLink = function (id) {
    return "https://commanderspellbook.com/combo/" + encodeURIComponent(id) + "/";
  };

  var NOTE_MAX = 200;

  /**
   * Trims a find-my-combos reply to what the page uses: the combos already
   * in the deck and those one card away in the deck's colors (Spellbook's
   * "included" and "almostIncluded"). Each combo is {id, cards, identity,
   * produces (up to 3), bracket, popularity, needs (other pieces described,
   * not named), note (Spellbook's notable prerequisites, cut to 200
   * characters), commanderOnly (cards that must be the commander)}.
   * Most popular first.
   */
  CS.trimSpellbook = function (reply, commanderName, made) {
    var r = (reply && reply.results) || {};
    var seen = {};
    var combos = [];
    ["included", "almostIncluded"].forEach(function (k) {
      (Array.isArray(r[k]) ? r[k] : []).forEach(function (v) {
        if (!v || v.id == null || seen[v.id] || !Array.isArray(v.uses)) return;
        var cards = v.uses
          .map(function (u) {
            return u && u.card && u.card.name;
          })
          .filter(Boolean);
        if (!cards.length || cards.length !== v.uses.length) return;
        seen[v.id] = true;
        var note =
          typeof v.notablePrerequisites === "string"
            ? v.notablePrerequisites.replace(/\s+/g, " ").trim()
            : "";
        if (note.length > NOTE_MAX) note = note.slice(0, NOTE_MAX - 3) + "...";
        combos.push({
          id: String(v.id),
          cards: cards,
          identity: typeof v.identity === "string" ? v.identity : "",
          produces: (Array.isArray(v.produces) ? v.produces : [])
            .map(function (p) {
              return p && p.feature && p.feature.name;
            })
            .filter(Boolean)
            .slice(0, 3),
          bracket: typeof v.bracketTag === "string" ? v.bracketTag : "",
          popularity: typeof v.popularity === "number" ? v.popularity : 0,
          needs: (Array.isArray(v.requires) ? v.requires : [])
            .map(function (q) {
              return q && q.template && q.template.name;
            })
            .filter(Boolean),
          note: note,
          commanderOnly: v.uses
            .filter(function (u) {
              return u.mustBeCommander === true;
            })
            .map(function (u) {
              return u.card.name;
            }),
        });
      });
    });
    combos.sort(function (a, b) {
      return b.popularity - a.popularity || (a.id < b.id ? -1 : 1);
    });
    return {
      v: 1,
      source: "Commander Spellbook (commanderspellbook.com)",
      commander: String(commanderName || ""),
      identity: typeof r.identity === "string" ? r.identity : "",
      made: String(made || ""),
      combos: combos,
    };
  };

  /** True when every color in a Spellbook identity ("RWB", "C") is in the commander's colors. */
  CS.identityFits = function (identity, colorIdentity) {
    var have = {};
    (colorIdentity || []).forEach(function (c) {
      have[String(c).toUpperCase()] = true;
    });
    return String(identity || "")
      .toUpperCase()
      .split("")
      .every(function (c) {
        return c === "C" || have[c] === true;
      });
  };

  /**
   * Which combos the pasted deck has, and which are one card away.
   * deckNames is CS.deckNameSet of the deck (commander included).
   * Returns {inDeck, needsPiece, oneAway}. inDeck: combos whose cards are
   * all in the deck. needsPiece: all its named cards are in, but Spellbook
   * says it also needs a kind of card ("Persist Creature"). oneAway:
   * [{name, key, best, combos}], one per missing card. Each combo entry is
   * the combo plus {bracketN, bracketLabel, others: the pieces already in
   * the deck}. oneAway is sorted lowest bracket first,
   * then more combos, then popularity. Combos outside the commander's
   * colors, or whose missing card would have to be the commander, are left
   * out. Anything malformed gives empty lists.
   */
  CS.deckCombos = function (file, deckNames, colorIdentity) {
    var out = { inDeck: [], needsPiece: [], oneAway: [] };
    if (!file || file.v !== 1 || !Array.isArray(file.combos)) return out;
    var byKey = {};
    file.combos.forEach(function (c) {
      if (!c || !Array.isArray(c.cards) || !c.cards.length) return;
      if (!CS.identityFits(c.identity, colorIdentity)) return;
      var missing = c.cards.filter(function (n) {
        return deckNames[CS.nameKey(n)] !== true;
      });
      if (missing.length > 1) return;
      var b = CS.comboBracket(c.bracket);
      var entry = Object.assign({}, c, {
        bracketN: b.n,
        bracketLabel: b.label,
        others: c.cards.filter(function (n) {
          return missing.indexOf(n) === -1;
        }),
      });
      if (!missing.length) {
        if (entry.needs && entry.needs.length) out.needsPiece.push(entry);
        else out.inDeck.push(entry);
        return;
      }
      var name = missing[0];
      if ((c.commanderOnly || []).indexOf(name) !== -1) return;
      if (CS.isBasicLand(name)) return;
      var key = CS.nameKey(name);
      if (!byKey[key]) byKey[key] = { name: name, key: key, combos: [] };
      byKey[key].combos.push(entry);
    });
    var rank = function (a, b) {
      return a.bracketN - b.bracketN || b.popularity - a.popularity;
    };
    out.inDeck.sort(rank);
    out.needsPiece.sort(rank);
    out.oneAway = Object.keys(byKey).map(function (k) {
      var g = byKey[k];
      g.combos.sort(rank);
      g.best = g.combos[0].bracketN;
      g.popularity = g.combos[0].popularity; // of its lowest-bracket combo
      return g;
    });
    out.oneAway.sort(function (a, b) {
      return (
        a.best - b.best ||
        b.combos.length - a.combos.length ||
        b.popularity - a.popularity ||
        (a.key < b.key ? -1 : 1)
      );
    });
    return out;
  };

  /**
   * The Combos pile: one card per oneAway entry, in that order, from the
   * Scryfall cards looked up by name. A card EDHREC also recommends keeps
   * its EDHREC numbers and id (matched by id, then by name), so it's never
   * offered twice under two printings. Cards Scryfall didn't find, and
   * cards already in the deck, are left out.
   */
  CS.buildComboPile = function (oneAway, scryCards, edhrecMap, deckNames) {
    var byName = {};
    (scryCards || []).forEach(function (sc) {
      if (sc && sc.id && sc.name && !byName[CS.nameKey(sc.name)])
        byName[CS.nameKey(sc.name)] = sc;
    });
    var edhrecByName = {};
    Object.keys(edhrecMap || {}).forEach(function (id) {
      var rec = edhrecMap[id];
      if (rec && rec.name) edhrecByName[CS.nameKey(rec.name)] = rec;
    });
    var seen = {};
    var cards = [];
    (oneAway || []).forEach(function (g) {
      var sc = byName[g.key];
      if (!sc || seen[g.key] || skipCard(sc.name, deckNames || {})) return;
      seen[g.key] = true;
      var rec = (edhrecMap && edhrecMap[sc.id]) || edhrecByName[g.key];
      cards.push(
        rec
          ? Object.assign({}, rec, { section: "combos" })
          : {
              id: sc.id,
              name: sc.name,
              synergy: 0,
              inclusion: 0,
              numDecks: 0,
              potentialDecks: 0,
              section: "combos",
              onEdhrec: false,
            },
      );
    });
    return { key: "combos", label: "Combos", cards: cards };
  };

  // ---------------------------------------------------------------- synergy

  /*
   * Our own synergy score ("Fit"), built only from rules text and type
   * lines, so it works for any deck and needs no outside data.
   *
   * Each card gets "gives" and "wants" labels from its text (a token maker
   * gives "bodies"; a sacrifice outlet wants "fodder" and gives "deaths"; a
   * death trigger wants "deaths"). A recommended card scores for every deck
   * card it pairs with: it gives what that card wants, or wants what that
   * card gives. The commander counts three times, since it's always there.
   * Each label's count is square-rooted, so a card that ties into several
   * of the deck's plans beats one that only piles onto a single plan.
   * Creature types (tribal) and roles the deck is short on add a little.
   * The total is squashed to 0-100.
   */

  /** Rules text of every face, lowercase, with the card's own name as "~". */
  CS.synText = function (slim) {
    var t = String((slim && (slim.text != null ? slim.text : slim.oracle)) || "")
      .toLowerCase()
      .replace(/\u2212/g, "-");
    var names = [];
    String((slim && slim.name) || "")
      .split(FACE_SPLIT)
      .forEach(function (n) {
        n = n.trim().toLowerCase();
        if (!n) return;
        names.push(n);
        var short = n.split(",")[0].trim();
        if (short.length > 3 && short !== n) names.push(short);
      });
    names.sort(function (a, b) {
      return b.length - a.length;
    });
    names.forEach(function (n) {
      t = t.split(n).join("~");
    });
    return t.replace(
      /\bthis (creature|artifact|enchantment|land|equipment|aura|permanent|card|spell|vehicle)\b/g,
      "~",
    );
  };

  /** Every face's type line, lowercase. */
  function synTypes(slim) {
    return String((slim && (slim.types || slim.typeLine)) || "").toLowerCase();
  }

  var NUM = "(?:a|an|one|two|three|four|five|x|that many|\\d+)";
  // "land", or a basic land type: fetch lands and Farseek name the type ("a
  // Forest or Island card"), not the word land
  var LAND_WORD = "(lands?|forests?|islands?|plains|swamps?|mountains?|wastes)";

  // [label, regex] pairs. Order doesn't matter.
  var GIVES = [
    // creature bodies: tokens and anything that makes extra creatures
    ["bodies", /\bcreates?\b[^.]*\bcreature tokens?\b/],
    ["bodies", /\b(myriad|mobilize|squad|populate|amass|incubate|afterlife|fabricate|embalm|eternalize|encore)\b/],
    ["bodies", /\bcreate\b[^.]*\btokens? that'?s? (are |is )?(a )?cop(y|ies)\b/],
    // fodder: bodies, plus creatures that are worth sacrificing
    ["fodder", /\bcreates?\b[^.]*\bcreature tokens?\b/],
    ["fodder", /\b(myriad|mobilize|squad|populate|amass|afterlife|fabricate|persist|undying|escape)\b/],
    ["fodder", /\bwhen ~ dies\b/],
    // deaths: sacrifice outlets and wipes
    ["deaths", /\bsacrifice (a|an|another|one or more|x|two|three)( other)? (nontoken )?(creatures?|artifact or creature|creature or artifact|permanents?|nonland permanents?)\b/],
    ["deaths", /\b(destroy|exile) all (other )?(creatures|nonland permanents)\b/],
    ["deaths", /\bsacrifice (it|them) at (the beginning of the next end step|end of combat)\b|\bdecayed\b/],
    ["deaths", /\beach creature gets -|\ball creatures get -|\bdamage to each creature\b/],
    ["deaths", /\bsacrifices? all (other )?creatures\b|\beach (player|opponent) sacrifices (a|an|one|two) creatures?\b/],
    // attacks: attack triggers and things that make attacking better
    ["attacks", /\bwhenever (~|you|one or more (other )?creatures( you control)?|a creature you control|another creature you control|equipped creature|enchanted creature|a (\w+ )?token you control) attacks?\b/],
    ["attacks", /\bwhenever you attack\b|\b(myriad|mobilize|battle cry|exalted|melee|dethrone)\b/],
    ["attacks", /\bwhenever ~ (enters|blocks) or attacks\b|\bwhenever ~ attacks or blocks\b/],
    ["attacks", /\b(have|has|gains?|gets?)\b[^.]*\bhaste\b/],
    ["attacks", /\badditional combat phase\b/],
    ["attacks", /\bcreatures you control (have|gain) [^.]*(menace|trample|flying|double strike|can't be blocked)/],
    ["attacks", /\bcreatures? can't block\b|~ can't be blocked\b|\bshadow\b/],
    // treasure and other artifact tokens
    ["treasure", /\bcreates? [^.]*\btreasure\b/],
    ["artifacts", /\bcreate\b[^.]*\b(treasure|clue|food|blood|map|powerstone|gold|incubator)\b|\bartifact creature tokens?\b|\bartifact token\b/],
    // +1/+1 counters
    ["counters", /\bput[^.]*\+1\/\+1 counters? on\b|\benters with[^.]*\+1\/\+1 counters?\b|\bproliferate\b/],
    ["counters", /\+1\/\+1 counters? would be put on\b|\bthat many plus one\b|\btwice that many [^.]*counters\b|\bmove [^.]*\bcounters? [^.]*\bonto\b/],
    // life gain
    ["lifegain", /\byou gain (\d+|x|that much|life)\b|\bgain (\d+|x|that much) life\b|\blifelink\b|\byou gain [^.]*\blife\b/],
    // graveyard fillers
    ["graveyard", /\brad counters?\b/],
    ["graveyard", /\bput (the rest|all other cards revealed this way|all other revealed cards|the other cards?|those cards|them|that card) [^.]*\binto your graveyard\b/],
    ["graveyard", /\bmills?\b|\bsurveil\b|\bdiscard (a|two|three|x|your hand|that many)\b|\bdiscards? (their|your) hands?\b/],
    // blink
    ["blink", /\bexile\b[^.]*\breturn (it|them|that card|those cards) to the battlefield\b/],
    ["blink", /\breturn (another )?target (creature|nonland permanent|permanent) you control to (its owner's|your) hand\b/],
    ["blink", /\bexile (any number of |x |up to (one|two|three) )?(other )?target (creatures?|nonland permanents?|permanents?|artifacts? or creatures?) you control\b|\bdies, return (that card|it) to the battlefield\b/],
    ["blink", /\bcreature card in your graveyard\b[^.]*\.[^.]*\breturn it to the battlefield\b|\breturn target creature card from your graveyard to the battlefield\b/],
    // landfall enablers
    ["landfall", new RegExp("\\bsearch your library for [^.]*\\b" + LAND_WORD + "\\b[^.]*(onto|put)[^.]*battlefield\\b")],
    ["landfall", /\bput [^.]*\blands? cards? [^.]*onto the battlefield\b|\bplay (an|up to (two|three)|two|three|any number of) additional lands?\b|\bplay lands from (your graveyard|the top of your library)\b/],
    ["landfall", new RegExp("\\breturn (a|an) " + LAND_WORD + "[^.]* you control to (its|their) owner('s|s'|s)? hands?\\b")],
    ["landfall", /\bcreatures you control are [^.]*\blands?\b|\bare (forest |plains |island |swamp |mountain )?lands in addition\b/],
    ["drain", /\b(each opponent|target opponent|target player|that player|each player|they) loses? (\d+|x|that much|half their) life\b|\b(each opponent|target opponent|target player|that player|they) lose (\d+|x|that much|half their) life\b/],
    ["lifegain", /\bdouble (target player's|your) life total\b/],
    ["lifeloss", /\byou lose (\d+|x|half your|that much) life\b|\bpays? (\d+|x) life\b|\bpay life equal\b/],
    // cycle 11: dungeons, opponents drawing, opponents sacrificing or discarding,
    // noncombat damage, targeting what opponents control, casting from exile
    ["dungeon", /\bventure into (the dungeon|undercity)\b|\b(take|takes|have|has) the initiative\b/],
    ["oppdraw", /\beach player draws\b|\b(each|target) (opponent|player) draws\b|\bdraws? (an|one|two) additional cards?\b|\beach player (discards|shuffles) [^.]*\bthen draws\b/],
    ["oppsac", /\b(each|target) (opponent|player)\b[^.]*\b(sacrifices|discards)\b|\bthat player (sacrifices|discards)\b|\bunless (they|that player) (sacrifices?|discards?)\b|\bsacrifices? [^.]*\bor discards?\b/],
    ["targets", /\btarget (creature|permanent|nonland permanent|artifact|enchantment|planeswalker|player|opponent|spell|creature or planeswalker)\b(?! you control)/],
    ["exile", /\bexile the top [^.]*\.\s*(until [^,]*, )?you may (play|cast)\b|\byou may (play|cast) (that card|those cards|it|them|cards exiled)[^.]*\b(this turn|for as long as|until)\b|\bexile it face down\. you may play\b/],
  ];

  var WANTS = [
    // go-wide and token payoffs
    ["bodies", /\bcreature tokens? you control\b|\bwhenever you create (one or more )?(creature )?tokens?\b/],
    ["bodies", /\bfor each (other )?creature you control\b(?! with)|\bnumber of (other )?creatures you control\b(?! with)|\bcreatures you control get \+\d/],
    ["bodies", /\bwhenever (a|an|one or more|another)( other)?( nontoken)? creatures?( you control)?( with power \d or less)? enters?\b/],
    ["bodies", /\bwould create one or more (creature )?tokens\b/],
    ["bodies", /\bconvoke\b|\b(twenty|ten|\d+) or more (other )?creatures\b/],
    // sacrifice outlets want fodder
    ["fodder", /\bsacrifice (a|an|another|one or more|x|two|three)( other)? (nontoken )?(creatures?|artifact or creature|creature or artifact)\b/],
    // death payoffs
    ["deaths", /\bwhenever (a|an|another|one or more)( other)?( nontoken)? creatures?( you control)?( or planeswalkers?)? (dies|die)\b/],
    ["deaths", /\bwhenever (a|an|another)( other)?( nontoken)? creature you control (with|without) [a-z ]{1,20}? dies\b/],
    ["deaths", /\bwhenever ~ or another (nontoken )?creature( or planeswalker)?( you control)? dies\b|\bwhenever a creature an opponent controls dies\b|\ba creature dying\b|\bcreatures? (that )?(died|have died) this turn\b|\bwhenever equipped creature dies\b|\bput into a graveyard from the battlefield\b/],
    ["deaths", /\bcreature cards? [^.]*from your graveyard\b|\bfrom your graveyard to the battlefield\b/],
    ["deaths", /\bcreature cards? from (their|all|each player's|a) graveyards?\b|\ball creature cards from\b/],
    ["deaths", /\bwhenever a creature token you control leaves\b/],
    // attack payoffs
    ["attacks", /\bwhenever (~|you|one or more (other )?creatures( you control)?|a creature you control|another creature you control|equipped creature|enchanted creature|a (\w+ )?token you control) attacks?\b/],
    ["attacks", /\bwhenever ~ (enters|blocks) or attacks\b|\bwhenever ~ attacks or blocks\b/],
    ["attacks", /\bwhenever you attack\b|\b(myriad|mobilize|battle cry|exalted|melee|dethrone)\b|\battacking creatures?\b|\bcreature attacking causes\b|\bwhenever a creature you control that's [^.]*\battacks\b|\bdeals? combat damage to (a player|an opponent)\b|\bif it was attacking\b|\b(equipped|enchanted) creature is attacking\b/],
    // treasure and artifact payoffs
    ["treasure", /\bsacrifice (a|an|x|one or more|two) (treasures?|artifacts?|clues?|foods?)\b|\bsacrifice an artifact\b|\bwhenever you sacrifice\b/],
    ["artifacts", /\bartifacts? you control\b|\bwhenever (an|one or more) artifacts? (you control )?enters?\b|\bfor each artifact\b|\baffinity for artifacts\b|\bimprovise\b|\bmetalcraft\b/],
    // counters payoffs
    ["counters", /\bwith (a|one or more) \+1\/\+1 counters?\b|\bwith \+1\/\+1 counters on (it|them)\b|\bwhenever one or more \+1\/\+1 counters\b|\bproliferate\b|\bfor each \+1\/\+1 counter\b|\bnumber of \+1\/\+1 counters\b/],
    ["counters", /\bwith (a|one or more) counters? on (it|them)\b|\bif it had (one or more )?counters on it\b|\+1\/\+1 counters? would be put on\b|\bwhenever you put one or more \+1\/\+1 counters\b/],
    // life gain payoffs
    ["lifegain", /\bwhenever you gain life\b|\bif you gained life\b|\bgained life this turn\b|\bamount of life you gained\b|\bif you would gain life\b|\b(\d+|thirty|forty|fifty) or more life\b/],
    // graveyard payoffs
    ["graveyard", /\bleaves? your graveyard\b|\bcards? (are|is) milled\b|\bcards? (are )?in your graveyard\b/],
    ["graveyard", /\bfrom your graveyard\b|\bfrom a graveyard\b|\b(escape|flashback|unearth|aftermath|embalm|eternalize|disturb|delve|jump-start|retrace)\b/],
    // blink payoffs: the card's own enter trigger
    ["blink", /\bwhen ~ enters\b|\bentering( the battlefield)? causes a triggered ability\b/],
    // landfall payoffs
    ["landfall", /\bwhenever (a land|one or more lands) (you control )?enters?\b|\blandfall\b|\ba land entering\b/],
    // cycle 11 payoffs
    ["dungeon", /\broom abilit(y|ies)\b|\bcompleted? (a|that) dungeon\b|\bdungeons? you own\b/],
    ["oppdraw", /\bwhenever (an opponent|a player) draws\b/],
    ["drawing", /\bwhenever you draw (a|your second|one or more) cards?\b/],
    ["oppsac", /\bwhenever (an opponent|a player|one or more opponents) (sacrifices|discards)\b/],
    ["burn", /\bnoncombat damage\b|\bif a source you control would deal damage\b|\bwould deal damage to an opponent\b|\bwhenever an opponent is dealt damage\b|\bwhenever (a|another) (red )?source you control deals damage\b/],
    ["targets", /\bbecomes the target of a spell or ability you control\b|\bcommit a crime\b|\bcounters? on (a |one or more )?(creatures?|permanents?) you don't control\b/],
    ["exile", /\b(plays? a land|casts? a spell|cast spells?|play lands?) from exile\b|\bspells? you cast from exile\b|\bspells you cast but don't own\b|\bwhenever you cast a spell from anywhere other than your hand\b/],
    ["etb", /\bwhenever (a|an|another|one or more)( other)?( nontoken)? creatures?( you control)? enters?\b|\b(creature|permanent) entering( the battlefield)? causes a triggered ability\b/],
    ["walkers", /\bwould put one or more counters on a permanent you control\b|\bplaneswalkers? you control\b|\bloyalty abilit(y|ies)\b|\bproliferate\b/],
    ["enchantments", /\bwhenever you cast an? enchantment spell\b|\benchantments? you control\b|\bfor each enchantment\b|\bconstellation\b|\bwhenever an(other)? enchantment (you control )?enters\b/],
    ["xspells", /\bwith \{x\} in (its|their) mana costs?\b|\bspells? with \{x\}\b/],
    ["devotion", /\bdevotion to (white|blue|black|red|green|that color|the chosen color)\b|\byour devotion\b/],
    ["drain", /\bwhenever (an opponent|a player|one or more opponents|each opponent) loses? (\d+ or more )?life\b|\bwhenever an opponent is dealt damage or loses life\b|\bif an opponent lost (\d+ or more )?life\b/],
    ["lifeloss", /\blife you('ve)? lost this turn\b|\bwhenever you lose life\b|\bif you('ve)? lost life\b/],
    ["instant", /\bwhenever you cast a spell (while|during)\b|\bwhenever you cast a spell during an opponent's turn\b/],
    ["enchantments", /\benchantment cards? (from|in) your graveyard\b|\benchantment spells? you cast\b/],
    ["artifacts", /\bartifact cards?\b|\bartifact spells? you cast\b/],
  ];

  /**
   * Plain words for the labels, used in reasons: what the card does when it
   * gives the label, when it wants it, and when it does both; `short` is
   * used after the commander's name.
   */
  CS.SYN_LABELS = {
    bodies: { g: "Makes creature tokens", w: "Pays off going wide", b: "Makes tokens and pays off going wide", short: "tokens" },
    fodder: { g: "Makes sacrifice fodder", w: "Sacrifice outlet", b: "Sacrifice outlet that makes its own fodder", short: "sacrifice" },
    deaths: { g: "Makes creatures die", w: "Pays off creatures dying", b: "Makes creatures die and pays it off", short: "death triggers" },
    attacks: { g: "Rewards attacking", w: "Rewards attacking", b: "Rewards attacking", short: "attacking" },
    treasure: { g: "Makes Treasure", w: "Uses Treasure", b: "Makes and uses Treasure", short: "Treasure" },
    artifacts: { g: "Is or makes an artifact", w: "Pays off artifacts", b: "Artifact that pays off artifacts", short: "artifacts" },
    counters: { g: "Adds +1/+1 counters", w: "Uses +1/+1 counters", b: "Adds and uses +1/+1 counters", short: "+1/+1 counters" },
    lifegain: { g: "Gains life", w: "Pays off life gain", b: "Gains life and pays it off", short: "life gain" },
    graveyard: { g: "Fills your graveyard", w: "Uses your graveyard", b: "Fills and uses your graveyard", short: "graveyard" },
    blink: { g: "Blinks creatures", w: "Has an enter trigger", b: "Blinks and has an enter trigger", short: "blink" },
    landfall: { g: "Puts extra lands out", w: "Pays off lands entering", b: "Ramps lands and pays it off", short: "landfall" },
    gear: { g: "Equipment or Aura", w: "Pays off Equipment and Auras", b: "Equipment payoff", short: "Equipment" },
    spells: { g: "Instant or sorcery", w: "Pays off instants and sorceries", b: "Spell payoff", short: "spells" },
    facedown: { g: "Puts cards face down", w: "Turns face-down cards up or pays them off", b: "Puts cards face down and pays it off", short: "face-down cards" },
    top: { g: "Sets up the top of your library", w: "Uses the top of your library", b: "Sets up and uses the top of your library", short: "top of library" },
    big: { g: "Big card worth putting into play for free", w: "Puts cards into play without paying for them", b: "Big card that also cheats others into play", short: "big cards for free" },
    landyard: { g: "Puts lands in your graveyard", w: "Uses lands from your graveyard", b: "Puts lands in your graveyard and uses them", short: "lands in your graveyard" },
    landhand: { g: "Gets land cards into your hand", w: "Wants land cards in hand to discard", b: "Gets lands into your hand and uses them", short: "lands in hand" },
    discard: { g: "Discards cards", w: "Pays off discarding", b: "Discards and pays it off", short: "discarding" },
    color: { g: "Changes what color things are", w: "Cares about a color", b: "Changes colors and cares about them", short: "color tricks" },
    protect: { g: "Protects your creatures", w: "Needs a creature to stay on the battlefield", b: "Protects creatures and needs them", short: "protecting a key creature" },
    stax: { g: "Taxes or slows opponents", w: "Taxes or slows opponents", b: "Taxes or slows opponents", short: "taxing opponents" },
    oneturn: { g: "Does something when it enters, attacks or dies", w: "Gives creatures one turn (blitz or dash)", b: "One-turn creature that pays off", short: "one-turn creatures" },
    cast: { g: "A big creature your commander helps you cast", w: "Helps you cast big creatures", b: "Helps cast big creatures, and is one", short: "big creature spells" },
    animate: { g: "A big artifact or enchantment your commander animates", w: "Turns big artifacts or enchantments into creatures", b: "Animates big permanents, and is one", short: "big artifacts and enchantments" },
    dungeon: { g: "Ventures into the dungeon", w: "Pays off dungeons", b: "Ventures and pays off dungeons", short: "dungeons" },
    oppdraw: { g: "Makes opponents draw", w: "Punishes or taxes opponents' draws", b: "Makes opponents draw and pays it off", short: "opponents drawing" },
    drawing: { g: "Draws cards", w: "Pays off drawing cards", b: "Draws cards and pays it off", short: "drawing cards" },
    oppsac: { g: "Makes opponents sacrifice or discard", w: "Pays off opponents sacrificing or discarding", b: "Makes opponents sacrifice or discard and pays it off", short: "opponents sacrificing or discarding" },
    burn: { g: "Deals damage to opponents", w: "Boosts noncombat damage", b: "Deals and boosts damage", short: "noncombat damage" },
    targets: { g: "Targets things", w: "Pays off targeting opponents' things", b: "Targets and pays it off", short: "targeting opponents' things" },
    exile: { g: "Lets you play cards from exile", w: "Pays off casting from exile", b: "Casts from exile and pays it off", short: "casting from exile" },
    etb: { g: "A creature", w: "Pays off creatures entering", b: "A creature that pays off creatures entering", short: "creatures entering" },
    walkers: { g: "A planeswalker", w: "Pays off planeswalkers", b: "Planeswalker payoff", short: "planeswalkers" },
    enchantments: { g: "An enchantment", w: "Pays off enchantments", b: "Enchantment that pays off enchantments", short: "enchantments" },
    sagas: { g: "A Saga", w: "Pays off Sagas", b: "Saga payoff", short: "Sagas" },
    xspells: { g: "A spell with X in its cost", w: "Pays off X spells", b: "X spell payoff", short: "X spells" },
    devotion: { g: "Adds devotion (two or more pips of one color)", w: "Counts devotion", b: "Adds and counts devotion", short: "devotion" },
    drain: { g: "Makes opponents lose life", w: "Pays off opponents losing life", b: "Drains and pays it off", short: "draining opponents" },
    lifeloss: { g: "Costs you life", w: "Pays off losing life", b: "Costs life and pays it off", short: "paying life" },
    instant: { g: "Can be cast at instant speed", w: "Pays off spells cast at the right moment", b: "Instant-speed payoff", short: "instant-speed spells" },
  };

  /** "Makes creature tokens; 15 of your cards use them" and the like. */
  CS.reasonFor = function (label, link) {
    var lab = CS.SYN_LABELS[label];
    var n = link.n;
    var cards = n === 1 ? "1 of your cards" : n + " of your cards";
    if (label === "attacks") return "Rewards attacking, like " + cards;
    if (label === "stax") return "Taxes or slows opponents, like " + cards;
    if (link.g && link.w) return lab.b + "; ties in with " + cards;
    if (link.g) return lab.g + "; " + cards + (n === 1 ? " uses" : " use") + " that";
    return lab.w + "; " + cards + (n === 1 ? " feeds" : " feed") + " it";
  };

  /**
   * Roles a deck needs a few of, with rough targets (a common rule of
   * thumb, not a law): ramp 10, card draw 10, removal 8, board wipes 3,
   * tutors 2, protection 3.
   */
  CS.SYN_ROLES = [
    { key: "ramp", label: "Ramp", target: 10, re: new RegExp("\\{t\\}[^:]*: add \\{|\\badd (one|two|three) mana\\b|\\badd \\{[wubrgc]\\}|\\badds? an additional (one )?(mana|\\{)|\\badds? (one|two) additional mana\\b|\\bsearch your library for [^.]*\\b" + LAND_WORD + " cards?\\b[^.]*battlefield|\\bcreate (a|two|x|that many) ([a-z]+ token or a )?treasure|\\bplay (an|up to (two|three)|two|three) additional lands?\\b") },
    { key: "draw", label: "Card draw", target: 10, re: /\bdraws? (a|an|one|two|three|four|five|six|seven|x|that many|\d+) cards?\b|\bdraws? (an|one|two|three|x|\d+) additional cards?\b|\bdraw cards equal\b|\bexile the top [^.]*\. (until [^.]*, )?you may play\b/ },
    { key: "removal", label: "Removal", target: 8, re: /\b(destroy|exile) (up to (one|two) )?target ((white|blue|black|red|green|multicolored|monocolored|nonland|nontoken|tapped|nonartifact|noncreature) )*(creature|artifact|enchantment|planeswalker|permanent|nonland|attacking)|-1\/-1 counters? on (up to (one|two) )?target creature|\b(destroy|exile) each (nonland )?permanents? with the most votes\b|\beach (player|opponent) sacrifices (a|an|one) (creature|nonland permanent|attacking creature)\b|\bdeals? (\d+|x) damage to (any target|target (creature|attacking|blocking))|\btarget creature (an opponent controls )?gets -|\btarget creature gets -x\/-x|\bcounter target\b|\breturn (up to (one|two) )?target (creature|nonland permanent|permanent|artifact|enchantment|planeswalker)s?( or [a-z]+)?( an opponent controls| you don't control)? to (its|their) owner('s|s'|s)? hands?\b/ },
    { key: "wipes", label: "Board wipes", target: 3, re: /\b(destroy|exile) all (other )?(creatures|nonland permanents|nontoken|artifacts|enchantments|permanents)|\beach creature gets -|\ball creatures get -|\bdamage to each creature\b|\bsacrifices? all (other )?creatures\b|\bairbend all (other )?creatures\b|\breturn (all|each) (other )?(creatures?|nonland permanents?)[^.]*to (their|its) owners?('s|s'|s)? hands?\b/ },
    { key: "tutors", label: "Tutors", target: 2, re: new RegExp("\\bsearch your library for (a|an|up to (one|two)) (?![^.]*\\b" + LAND_WORD + "\\b)[^.]*\\bcards?\\b") },
    { key: "protection", label: "Protection", target: 3, re: /\b(creatures|permanents) you control (gain|have|get)[^.]*\b(indestructible|hexproof|shroud|protection)\b|\bequipped creature has[^.]*\b(shroud|hexproof|indestructible|protection)\b|\btarget (creature|permanent|artifact or creature)( you control)? (becomes [^.]*and )?gains?[^.]*\b(indestructible|hexproof|protection)\b|\ball creatures gain protection\b|\b(enchanted|equipped) creature (gets [^.]*and )?has [^.]*\b(shroud|hexproof|indestructible|protection)\b|\bprevent all combat damage\b|\bphases? out\b/ },
  ];

  /**
   * The part of a card's text (reminder text already removed) that counts
   * as ramp: Treasure only when it comes every turn or with each land
   * (not one-off, on a death or a hit, or for another player); not an
   * altar's "sacrifice a creature: add" (a sacrifice outlet); not a land
   * search that sacrifices a land first (Crop Rotation swaps, it doesn't ramp).
   */
  CS.rampText = function (bare) {
    var t = String(bare || "").replace(/[^.]*\btreasures?\b[^.]*/g, function (s) {
      var steady = /\bat the beginning of\b|\bwhenever (a|one or more) lands?\b|\blandfall\b/.test(s);
      var forOthers = /\b(its controller|each opponent|target (player|opponent)|that player)\b/.test(s);
      return steady && !forOthers ? s : "";
    });
    t = t.replace(/\bsacrifice (a|an|another) (creature|artifact|permanent|nonland permanent)[^:.]*: add\b[^.]*/g, "");
    if (/\bsacrifice an? land\b/.test(t)) t = t.replace(/[^.]*\bsearch your library for\b[^.]*/g, "");
    return t;
  };

  var COMMON_TYPES = { human: true }; // too common to count as a tribe

  // Labels read from the text without reminder text (the part in
  // parentheses), since morph and manifest reminders say "turn it face up"
  // and scry's says "look at the top card" on every card that has them.
  var BARE_GIVES = [
    // face-down cards: manifest, cloak, morph, disguise, "put it face down"
    ["facedown", /\bmanifest\b|\bmanifest dread\b|\bcloak\b|\b(mega)?morph\b|\bdisguise\b|\bface down\b/],
    // arranging the top of the library
    ["top", /\bscry (\d+|x)\b|\bsurveil (\d+|x)\b|\bon top of (your|its owner's|their owner's) library\b|\bput (them|those cards) back in any order\b/],
    // manifest dread puts the other card in the graveyard
    ["graveyard", /\bmanifest dread\b/],
    // lands into the graveyard: sacrificing or discarding lands (fetch lands are added below)
    ["landyard", /\bsacrifice (a|an|two|x|one or more) (lands?|forests?|plains|islands?|swamps?|mountains?)\b|\bdiscard (a|x|two|one or more) land cards?\b|\bdiscarding a land card\b/],
    // land cards into hand: Life from the Loam, Kodama's Reach, Borborygmos
    ["landhand", /\bexplores?\b/],
    ["landhand", /\bland cards?\b[^.]*\binto your hand\b|\breturn [^.]*\blands?\b[^.]*\bto (your|its owner's|their owners'|their owner's) hands?\b|\bland cards? [^.]*\bto your hand\b|\bwhenever a land is tapped for mana, return it to its owner's hand\b/],
    // discarding as a cost or an effect (Borborygmos, Mox Diamond, cycling)
    ["discard", /\bdiscard (a|x|two|one or more|that) (land )?cards?\b|\bdiscarding a (land )?card\b|\b(cycling|channel)\b|\bdiscards? (their|your) hands?\b/],
    // color changers: Painter's Servant, Eight-and-a-Half-Tails, Distorting Lens
    ["color", /\bbecomes? (the color of your choice|the chosen color|white|blue|black|red|green|colorless)\b|\b(are|is) the chosen color\b|\bin addition to (its|their) other colors\b|\bnonland permanents you control are (white|blue|black|red|green)\b/],
  ];
  var BARE_WANTS = [
    ["facedown", /\bface-down (creatures?|permanents?|spells?)\b|\bturn(s|ed)? [^.]*\bface up\b|\bwhenever you (manifest|cloak)\b|\bexile (this creature|~|target (creature|permanent)[^.,]*|another target [^.,]*), then return (it|that card|them|those cards) to the battlefield\b/],
    ["top", /\b(look at|play with) the top card of your library (any time|revealed)\b|\b(play|cast) [^.]*\bfrom the top of your library\b|\bmanifest (dread|the top card)\b|\breveal the top card of your library\b|\bmiracle\b/],
    // cheat effects: free casting, putting a permanent card into play,
    // reanimation, and flipping a face-down card without paying for it
    // uses lands from the graveyard: Crucible, Ramunap, Life from the Loam, Splendid Reclamation
    ["landyard", /\bplay lands? from your graveyard\b|\bland cards? (from|in) your graveyard\b|\breturn [^.]*\bland cards?\b[^.]*\bgraveyard\b|\blands? in your graveyard\b/],
    // discard payoffs: Glint-Horn Buccaneer, madness
    ["discard", /\bwhenever you (discard|cycle or discard|cycle)\b|\bmadness\b/],
    // wants land cards in hand: discarding lands as a cost or for value
    ["landhand", /\bdiscard (a|x|two|one or more) land cards?\b|\bdiscarding a land card\b|\bput a land card from your hand onto the battlefield\b/],
    // cares about colors: color hosers and color protection (with a color changer, these hit or dodge anything)
    ["color", /\b(non)?(white|blue|black|red|green|multicolored|monocolored) (source|permanent|creature|spell)s?\b|\bprotection from (white|blue|black|red|green|the color of your choice|the chosen color|each color|all colors|its colors|their colors|each of (its|their) colors)\b|\bsource of the color of your choice\b|\bof the chosen color\b|\bshares a color\b/],
    ["big", /\bwithout paying (its|their|the) mana costs?\b|\bput (a|an|target|that|up to one) [^.]*?\b(creature|permanent|artifact) cards? [^.]*\bonto the battlefield\b|\breturn target creature card from (your|a) graveyard to the battlefield\b|\byou may turn [^.]*\bface up\b|\bturn target [^.]*\bface up\b/],
  ];
  var BIG_CMC = 7; // a permanent card this costly is worth cheating into play

  // Taxes and locks on opponents (Thalia, Esper Sentinel, Ghostly Prison,
  // Linvala). A pile-on theme: each piece is better next to the others, so
  // a card with it both gives and wants the label.
  var STAX =
    /\b(spells|abilities)[^.]*\bcost \{\d+\} more\b|\bcost \{\d+\} more to (cast|activate)\b|\bactivated abilities of [^.]*can't be activated\b|\bwhenever an opponent (casts|draws|searches)\b|\bwhenever a player casts [^.]*\bloses? \d+ life\b|\bunless (that player|its controller|they) pays? \{|\bcan't attack you\b[^.]*\bunless\b|\byour opponents can't (cast|search|draw|gain|activate)\b|\beach opponent can't\b|\bif no mana was spent to cast it, counter\b|\bopponents? (draws?|casts?) (their|a) second\b|\bdon't untap during\b|\bnonbasic lands are\b|\bif an opponent would (search|draw)\b/;

  /**
   * What a commander does for one kind of card, read from its text, for
   * labels no card's own text can show. Now: commanders that help cast
   * creature spells (Henzie gives creatures with mana value 4+ blitz;
   * Hamza makes creature spells cheaper). Returns {castMin} or {}.
   */
  CS.commanderHooks = function (slim) {
    var t = CS.synText(slim).replace(/\([^)]*\)/g, "");
    var hooks = {};
    var m = /\bcreature spells? you cast with (mana value|converted mana cost) (\d+) or greater\b/.exec(t);
    if (m) hooks.castMin = parseInt(m[2], 10);
    else if (/\bcreature spells you cast (cost \{\d+\} less|have|gain)\b/.test(t)) hooks.castMin = 4;
    // blitz or dash (read with reminder text): the creature stays one turn,
    // so the best ones do something when they enter, attack or die
    if (hooks.castMin && /\b(blitz|dash)\b/.test(CS.synText(slim))) hooks.oneTurn = true;
    // cycle 11: commanders that make big noncreature artifacts or enchantments
    // into creatures (Bello: "... with mana value 4 or greater is a 4/4")
    var pm = /\b(artifacts?|enchantments?)\b[^.]*\byou control with (mana value|converted mana cost) (\d+) or greater (is|are|becomes?)\b/.exec(t);
    if (pm) {
      hooks.permMin = parseInt(pm[3], 10);
      hooks.permTypes = /artifact/.test(pm[0]) && /enchantment/.test(pm[0]) ? "both" : /artifact/.test(pm[1]) ? "artifact" : "enchantment";
    }
    return hooks;
  };

  /** Adds the labels a commander's hooks give a card (a creature it helps cast). */
  function applyHooks(traits, slim, hooks) {
    if (!hooks || traits.land) return;
    var front = String((slim && (slim.frontType || slim.typeLine || slim.types)) || "").toLowerCase();
    if (hooks.permMin && typeof slim.cmc === "number" && slim.cmc >= hooks.permMin) {
      var f0 = front.split("//")[0];
      var kind = /\bartifact\b/.test(f0) && !/\bequipment\b/.test(f0) ? "artifact" : /\benchantment\b/.test(f0) && !/\baura\b/.test(f0) ? "enchantment" : null;
      if (kind && !/\bcreature\b/.test(f0) && (hooks.permTypes === "both" || hooks.permTypes === kind)) traits.gives.animate = true;
    }
    if (!hooks.castMin) return;
    if (/\bcreature\b/.test(front.split("//")[0]) && typeof slim.cmc === "number" && slim.cmc >= hooks.castMin) {
      traits.gives.cast = true;
      if (hooks.oneTurn && /\bwhen(ever)? ~ (enters|dies|attacks)\b|\bwhen ~ enters or (dies|attacks)\b/.test(traits.text))
        traits.gives.oneturn = true;
    }
  }

  /**
   * Reads one card: its gives/wants labels, roles, creature types and the
   * creature types its text cares about. Lands get labels but no roles.
   */
  CS.cardTraits = function (slim) {
    var text = CS.synText(slim);
    var types = synTypes(slim);
    var gives = {};
    var wants = {};
    // cycle 11: Beast Within's "its controller creates a 3/3 Beast" makes a
    // token for someone else, so it isn't fodder or a body for you
    var ownText = text.replace(/\b(its controller|that player|that creature's controller|target opponent|each opponent|its owner) creates?\b[^.]*/g, "");
    GIVES.forEach(function (g) {
      if (g[1].test(ownText)) gives[g[0]] = true;
    });
    WANTS.forEach(function (w) {
      if (w[1].test(text)) wants[w[0]] = true;
    });
    var bare = text.replace(/\([^)]*\)/g, "");
    // "whenever you manifest dread" pays off manifesting; it doesn't do it
    var bareGive = bare.replace(/\bwhenever you (manifest|cloak)[^,.]*/g, "");
    BARE_GIVES.forEach(function (g) {
      if (g[1].test(bareGive)) gives[g[0]] = true;
    });
    BARE_WANTS.forEach(function (w) {
      if (w[1].test(bare)) wants[w[0]] = true;
    });
    var isLand = /\bland\b/.test(types.split("\u2014")[0]);
    if (isLand && (/\bsacrifice ~[^.]*\bsearch your library\b/.test(bare) || /\b(cycling|channel)\b/.test(bare)))
      gives.landyard = true; // a fetch land or a cycling land ends up in the graveyard
    if (STAX.test(bare)) {
      gives.stax = true;
      wants.stax = true;
    }
    // an Aura on a land (Utopia Sprawl, Wild Growth) is ramp, not gear
    var landAura = /\baura\b/.test(types) && /\benchant (land|forest|plains|island|swamp|mountain)\b/.test(text);
    if (/\b(equipment|aura)\b/.test(types) && !landAura) {
      gives.gear = true;
      if (!/\benchant (land|artifact|enchantment|player|permanent you don't control|creature you don't control|creature an opponent controls)\b/.test(text))
        wants.protect = true; // the creature wearing it has to survive
    }
    if (/\b(as long as|if) you control a creature\b/.test(bare)) wants.protect = true;
    else if (/\bequipped creature\b|\bwhenever (an|one or more) (equipment|auras?)\b|\b(equipment|auras?) you control\b|\bfor each (aura|equipment)\b|\bequip abilities\b|\bsearch your library for an? (equipment|aura)\b|\b(equipment|aura)( and vehicle)? spells?\b|\b(enchanted or equipped|equipped or enchanted)\b|\b(equipment|aura) cards?\b|\bas long as ~ is (equipped|enchanted)\b/.test(text))
      wants.gear = true;
    if (/\b(instant|sorcery)\b/.test(types)) gives.spells = true;
    // cycle 11: what a card is (its card types), for payoffs that count them
    var mainTypes = types
      .split("//")
      .map(function (f) {
        return f.split("\u2014")[0];
      })
      .join(" ");
    var subLine = types
      .split("//")
      .map(function (f) {
        return f.split("\u2014")[1] || "";
      })
      .join(" ");
    var before = Object.assign({}, gives);
    if (/\bartifact\b/.test(mainTypes)) gives.artifacts = true;
    if (/\binstant\b/.test(mainTypes) || /\bflash\b/.test(bare)) gives.instant = true;
    if (/\benchantment\b/.test(mainTypes) && !isLand) gives.enchantments = true;
    if (/\bplaneswalker\b/.test(mainTypes)) gives.walkers = true;
    if (/\bcreature\b/.test(mainTypes.split(" ")[0] + " " + mainTypes) && !isLand) gives.etb = true;
    if (/\bsaga\b/.test(subLine)) gives.sagas = true;
    if (/\bsagas?\b|\blore counters?\b|\bfinal chapter\b|\bproliferate\b/.test(bare.replace(/\bsaga\b[^.]*\benters\b[^.]*\./, ""))) wants.sagas = true;
    if (gives.sagas) delete wants.sagas; // a Saga's own chapters aren't a payoff
    if (/\{x\}/.test(String(slim.manaCost || "").toLowerCase()) && !isLand) gives.xspells = true;
    var typeOnly = {};
    Object.keys(gives).forEach(function (l) {
      if (!before[l]) typeOnly[l] = true;
    });
    if (!isLand && /\b(creature|artifact|enchantment|planeswalker)\b/.test(mainTypes)) {
      var pips = {};
      (String(slim.manaCost || "").toLowerCase().match(/\{[wubrg]\}/g) || []).forEach(function (p) {
        pips[p] = (pips[p] || 0) + 1;
      });
      if (Object.keys(pips).some(function (p) {
        return pips[p] >= 2;
      }))
        gives.devotion = true;
    }
    // noncombat damage to opponents (combat damage is the "attacks" label)
    if (/\bdamage to (each opponent|each player|any target|target player|target opponent|each of your opponents|that player|target player or planeswalker)\b/.test(text.replace(/\bcombat damage\b/g, "")))
      gives.burn = true;
    // grants ninjutsu to creature cards: big creatures come in without being cast
    if (/\b(has|have) ninjutsu\b/.test(bare)) {
      wants.big = true;
      wants.attacks = true;
    }
    var permanentCard = /\b(creature|artifact|enchantment|planeswalker|battle)\b/.test(types);
    if (!isLand && permanentCard && typeof slim.cmc === "number" && slim.cmc >= BIG_CMC)
      gives.big = true;
    if (/\bwhenever you cast (an|a|your)[^.]*(instant|sorcery|noncreature)\b|\bprowess\b|\bmagecraft\b|\bwhenever you cast a spell\b(?! with)(?! that)/.test(text))
      wants.spells = true;
    // a card only pays off its own label when it says so for others too
    var roles = {};
    if (!isLand)
      CS.SYN_ROLES.forEach(function (r) {
        if (r.re.test(r.key === "ramp" ? CS.rampText(bare) : bare)) roles[r.key] = true;
      });
    if (roles.protection) gives.protect = true;
    if (roles.draw) gives.drawing = true; // cycle 11: for "whenever you draw a card" payoffs
    // creature types: from creature type lines, and from tokens it makes
    var subtypes = {};
    types.split("//").forEach(function (face) {
      var parts = face.split("\u2014");
      if (parts.length > 1 && /\bcreature\b/.test(parts[0]))
        parts[1].trim().split(/\s+/).forEach(function (s) {
          if (s) subtypes[s] = true;
        });
    });
    types.split("//").forEach(function (face) {
      var parts = face.split("\u2014");
      if (parts.length > 1 && /\bland\b/.test(parts[0]))
        parts[1].trim().split(/\s+/).forEach(function (s) {
          if (s && !/^(plains|island|swamp|mountain|forest)$/.test(s)) subtypes[s] = true;
        });
    });
    var tokenTypes = {};
    var tm = text.match(/\b\d+\/\d+ [a-z ,]*?\b([a-z]+) creature tokens?\b/g) || [];
    tm.forEach(function (m) {
      var w = /([a-z]+) creature tokens?$/.exec(m);
      if (w) tokenTypes[w[1]] = true;
    });
    if (/\bmobilize\b/.test(text)) tokenTypes.warrior = true;
    return {
      gives: gives,
      wants: wants,
      roles: roles,
      subtypes: subtypes,
      tokenTypes: tokenTypes,
      text: text,
      land: isLand,
      typeOnly: typeOnly,
    };
  };

  /**
   * Sums up a deck for scoring: each deck card's traits (commander marked),
   * label counts, creature-type counts, role counts.
   * `deckSlims`: slim cards for the deck (the commander included);
   * `commanderName`: which one is the commander.
   */
  CS.deckProfile = function (deckSlims, commanderName) {
    var cmdKey = CS.nameKey(commanderName || "");
    var cards = [];
    var seen = {};
    var hooks = {};
    (deckSlims || []).forEach(function (s) {
      if (s && cmdKey !== "" && CS.nameKey(s.name) === cmdKey) hooks = CS.commanderHooks(s);
    });
    (deckSlims || []).forEach(function (s) {
      if (!s || seen[s.id]) return;
      seen[s.id] = true;
      if (CS.isBasicLand(s.name)) return;
      var t = CS.cardTraits(s);
      t.id = s.id;
      t.name = s.name;
      t.commander = cmdKey !== "" && CS.nameKey(s.name) === cmdKey;
      if (t.commander) {
        Object.keys(t.typeOnly || {}).forEach(function (l) {
          delete t.gives[l];
        });
        if (hooks.castMin) t.wants.cast = true;
        if (hooks.permMin) t.wants.animate = true;
        if (hooks.oneTurn) t.wants.oneturn = true;
      } else applyHooks(t, s, hooks);
      cards.push(t);
    });
    var typeCount = {};
    var roleCount = {};
    cards.forEach(function (c) {
      var w = c.commander ? 3 : 1;
      Object.keys(c.subtypes).forEach(function (s) {
        typeCount[s] = (typeCount[s] || 0) + w;
      });
      Object.keys(c.tokenTypes).forEach(function (s) {
        typeCount[s] = (typeCount[s] || 0) + w;
      });
      Object.keys(c.roles).forEach(function (r) {
        roleCount[r] = (roleCount[r] || 0) + 1;
      });
    });
    return {
      cards: cards,
      commander: cards.filter(function (c) {
        return c.commander;
      })[0] || null,
      typeCount: typeCount,
      roleCount: roleCount,
      hooks: hooks,
    };
  };

  /** Creature types a card's text names as a group ("Warriors you control"). */
  function namedTypes(text, typeCount) {
    var out = [];
    Object.keys(typeCount).forEach(function (t) {
      if (COMMON_TYPES[t] || t.length < 3) return;
      var plural = t + "s";
      if (/(f|fe)$/.test(t)) plural = t.replace(/fe?$/, "ves");
      var re = new RegExp("\\b(" + t + "|" + plural + ")\\b(?! creature tokens?)(?! token)");
      // naming a type only to make tokens of it isn't a payoff
      var stripped = text.replace(/\bcreate\b[^.]*\btokens?\b/g, "");
      if (re.test(stripped)) out.push(t);
    });
    return out;
  }

  var SYN_K = 7; // squash constant: tuned so a typical strong pick lands near 70-85
  var CMD_BONUS = 2; // extra raw score per label shared with the commander (at most two)

  /**
   * Scores one card against a deck profile. Returns
   * {score (0-100), raw, reasons: [string], links: {label: count}}.
   * `skipId` leaves one deck card out (for scoring the deck's own cards).
   */
  CS.fitScore = function (slim, profile, skipId) {
    var me = CS.cardTraits(slim);
    if (!profile.commander || slim.id !== profile.commander.id) applyHooks(me, slim, profile.hooks);
    var links = {};
    var cmdHits = [];
    var contrib = [];
    profile.cards.forEach(function (c) {
      if (c.id === slim.id || c.id === skipId) return;
      var w = c.commander ? 3 : 1;
      var hit = {};
      Object.keys(me.gives).forEach(function (l) {
        if (c.wants[l]) hit[l] = { g: true };
      });
      Object.keys(me.wants).forEach(function (l) {
        if (c.gives[l]) (hit[l] = hit[l] || {}).w = true;
      });
      Object.keys(hit).forEach(function (l) {
        if (!links[l]) links[l] = { n: 0, w8: 0, g: false, w: false };
        links[l].n += 1;
        links[l].w8 += w;
        if (hit[l].g) links[l].g = true;
        if (hit[l].w) links[l].w = true;
        if (c.commander) cmdHits.push(l);
      });
    });
    var raw = 0;
    Object.keys(links).forEach(function (l) {
      var v = Math.sqrt(links[l].w8);
      raw += v;
      contrib.push([v, l]);
    });
    // Tying in to the commander itself counts extra (up to two labels): the
    // commander is always there, and an enabler for its own trigger
    // (Burgeoning for a landfall commander) is a core card even when few
    // other cards share the label.
    var cmdLabels = cmdHits.filter(function (l, i) {
      return cmdHits.indexOf(l) === i;
    });
    raw += CMD_BONUS * Math.min(2, cmdLabels.length);
    var cmdTie = null;
    var cmdName = profile.commander ? CS.frontName(profile.commander.name).toLowerCase() : "";
    if (cmdName && (!profile.commander || slim.id !== profile.commander.id)) {
      var short = cmdName.split(",")[0].trim();
      if (me.text.indexOf(cmdName) !== -1 || (short.length > 3 && me.text.indexOf(short) !== -1))
        cmdTie = "Names " + CS.frontName(profile.commander.name).split(",")[0];
      else if (/\blieutenant\b|\byou control your commander\b|\byour commander\b|\bcommander creatures you own\b/.test(me.text.replace(/\([^)]*\)/g, "")))
        cmdTie = "Better while your commander is out";
      if (cmdTie) raw += CMD_BONUS;
    }
    // tribal: shares a type the deck cares about, or cares about a type the deck has
    var tribal = null;
    var cares = {};
    // cycle 11: a changeling (or "gains all creature types") is every type the deck has
    if (/\bchangeling\b|\bis every creature type\b|\bgain all creature types\b/.test(me.text))
      Object.keys(profile.typeCount).forEach(function (t) {
        me.subtypes[t] = true;
      });
    profile.cards.forEach(function (c) {
      if (c.id === slim.id || c.id === skipId) return;
      namedTypes(c.text, me.subtypes).forEach(function (t) {
        cares[t] = (cares[t] || 0) + (c.commander ? 3 : 1);
      });
    });
    Object.keys(cares).forEach(function (t) {
      var v = Math.sqrt(cares[t]);
      if (!tribal || v > tribal[0]) tribal = [v, t, "deck"];
    });
    namedTypes(me.text, profile.typeCount).forEach(function (t) {
      var n = profile.typeCount[t] - (me.subtypes[t] ? 1 : 0);
      if (n >= 4) {
        var v = Math.sqrt(n) * 0.8;
        if (!tribal || v > tribal[0]) tribal = [v, t, "card"];
      }
    });
    // cycle 11: a card that names whatever type you choose works with the
    // deck's main creature type (at least 8 cards of it)
    if (/\bchoose a creature type\b|\bshares a creature type\b|\bof the chosen (creature )?type\b/.test(me.text)) {
      var mainT = null;
      Object.keys(profile.typeCount).forEach(function (t) {
        if (COMMON_TYPES[t] || t.length < 3) return;
        if (!mainT || profile.typeCount[t] > profile.typeCount[mainT]) mainT = t;
      });
      if (mainT && profile.typeCount[mainT] >= 8) {
        var cv = Math.sqrt(profile.typeCount[mainT]) * 0.8;
        if (!tribal || cv > tribal[0]) tribal = [cv, mainT, "card"];
      }
    }
    if (tribal) raw += tribal[0];
    // roles the deck is short on
    var role = null;
    if (!me.land)
      CS.SYN_ROLES.forEach(function (r) {
        if (!me.roles[r.key]) return;
        var have = profile.roleCount[r.key] || 0;
        var gap = (r.target - have) / r.target;
        if (gap > 0) {
          var v = 2 * gap;
          if (!role || v > role[0]) role = [v, r, have];
        }
      });
    if (role) raw += role[0];
    var score = Math.round(100 * (1 - Math.exp(-raw / SYN_K)));

    // reasons, biggest first
    contrib.sort(function (a, b) {
      return b[0] - a[0];
    });
    var reasons = [];
    var cmd = profile.commander;
    if (cmd && cmdHits.length) {
      reasons.push(
        "Works with " +
          CS.frontName(cmd.name).split(",")[0] +
          ": " +
          cmdHits
            .filter(function (l, i) {
              return cmdHits.indexOf(l) === i;
            })
            .slice(0, 2)
            .map(function (l) {
              return CS.SYN_LABELS[l].short;
            })
            .join(", "),
      );
    }
    var rest = contrib.map(function (x) {
      return [x[0], CS.reasonFor(x[1], links[x[1]])];
    });
    if (tribal) {
      var T = tribal[1].charAt(0).toUpperCase() + tribal[1].slice(1);
      rest.push([
        tribal[0],
        tribal[2] === "deck"
          ? "It's a " + T + ", and your deck cares about " + T + "s"
          : "Cares about " + T + "s; your deck has " + profile.typeCount[tribal[1]],
      ]);
    }
    if (cmdTie) rest.push([CMD_BONUS + 0.5, cmdTie]);
    if (role)
      rest.push([
        role[0] + 1, // a real gap is worth saying even when it adds little
        role[1].label + ": your deck has " + role[2] + " (about " + role[1].target + " is typical)",
      ]);
    rest.sort(function (a, b) {
      return b[0] - a[0];
    });
    rest.forEach(function (x) {
      reasons.push(x[1]);
    });
    var linkCounts = {};
    Object.keys(links).forEach(function (l) {
      linkCounts[l] = links[l].n;
    });
    return {
      score: score,
      raw: raw,
      reasons: reasons.slice(0, 3),
      links: linkCounts,
      roles: Object.keys(me.roles),
    };
  };

  /**
   * True when `traits` (a deck card from CS.deckProfile) is a big card and
   * another card in the deck puts cards into play without paying for them
   * (Zimone flipping a face-down card, Omniscience, Sneak Attack, reanimation).
   */
  CS.isCheatPayload = function (traits, profile) {
    if (!traits || !traits.gives || !traits.gives.big) return false;
    return ((profile && profile.cards) || []).some(function (d) {
      return d.id !== traits.id && d.wants && d.wants.big;
    });
  };

  /**
   * The deck's own synergy: each nonland card scored against the rest
   * (commander included, not scored itself). Cards that are mostly a role
   * (ramp, draw, removal...) and tie in to little (Fit under 50) are
   * listed as staples and left out of the average, so Sol Ring doesn't
   * count as a weak link.
   * Returns {score, plan: [{label, noun, gives, wants}], weakest: [{name,
   * score}], staples: [name], scored: n}.
   */
  CS.deckSynergy = function (profile, slims) {
    var byId = {};
    (slims || []).forEach(function (s) {
      if (s) byId[s.id] = s;
    });
    var scored = [];
    var staples = [];
    var fits = {};
    profile.cards.forEach(function (c) {
      if (c.commander || c.land || !byId[c.id]) return;
      var f = CS.fitScore(byId[c.id], profile, c.id);
      fits[c.id] = f.score;
      // a big card the deck cheats into play is a payload: its one job is
      // the commander's plan, so it's judged like a role card
      var isRole = Object.keys(c.roles).length > 0 || CS.isCheatPayload(c, profile);
      if (isRole && f.score < 50) staples.push(c.name);
      else scored.push({ name: c.name, id: c.id, score: f.score });
    });
    var sum = scored.reduce(function (a, x) {
      return a + x.score;
    }, 0);
    var plan = {};
    profile.cards.forEach(function (c) {
      Object.keys(c.gives).forEach(function (l) {
        plan[l] = plan[l] || { gives: 0, wants: 0 };
        plan[l].gives++;
      });
      Object.keys(c.wants).forEach(function (l) {
        plan[l] = plan[l] || { gives: 0, wants: 0 };
        plan[l].wants++;
      });
    });
    var planList = Object.keys(plan)
      .filter(function (l) {
        return plan[l].gives > 0 && plan[l].wants > 0;
      })
      .map(function (l) {
        return {
          label: l,
          noun: CS.SYN_LABELS[l].short,
          gives: plan[l].gives,
          wants: plan[l].wants,
        };
      })
      .sort(function (a, b) {
        // cycle 11: the commander's own plan first (Tergrid: opponents
        // sacrificing), then the deck's biggest two-sided plans
        var cw = profile.commander ? profile.commander.wants : {};
        return (cw[b.label] ? 1 : 0) - (cw[a.label] ? 1 : 0) ||
          Math.min(b.gives, b.wants) - Math.min(a.gives, a.wants) ||
          b.gives + b.wants - (a.gives + a.wants);
      });
    scored.sort(function (a, b) {
      return a.score - b.score;
    });
    return {
      score: scored.length ? Math.round(sum / scored.length) : 0,
      plan: planList,
      weakest: scored.slice(0, 5),
      staples: staples,
      scored: scored.length,
      roleCount: profile.roleCount,
      fits: fits,
    };
  };

  // ---------------------------------------------------------------- cut suggestions

  // Roles a deck shouldn't drop below (taxonomy: ramp, card advantage,
  // targeted and mass disruption). A card that keeps one of these at or
  // under its typical count isn't suggested as a cut.
  var KEEP_ROLES = { ramp: true, draw: true, removal: true, wipes: true };
  var STAPLE_RANK = 500; // EDHREC rank at or under which a role card counts as a staple

  /**
   * Cards worth cutting, best idea first (from data/synergy-taxonomy.json
   * cut_score, simplified): weak Fit, a role the deck has more of than
   * usual, costing 6+ while not part of the plan, and Game Changers (for an
   * LGS-friendly deck). Never suggested: the commander, lands, cards in a
   * combo the deck already has, cards with Fit 75+, and a card whose cut
   * would drop ramp, card draw, removal or board wipes below the typical
   * count.
   * `syn`: CS.deckSynergy result; `slims`: the deck's slim cards;
   * opts: {protect: {nameKey: true}, cuts: {name: n}}.
   * Returns [{id, name, score (0-100), fit, reasons: [string], roles: [key], cmc}].
   */
  CS.cutSuggestions = function (profile, syn, slims, opts) {
    var o = opts || {};
    var protect = o.protect || {};
    var cutKeys = {};
    Object.keys(o.cuts || {}).forEach(function (n) {
      cutKeys[CS.nameKey(n)] = true;
    });
    var byId = {};
    (slims || []).forEach(function (s) {
      if (s) byId[s.id] = s;
    });
    var roleCount = profile.roleCount || {};
    var roleInfo = {};
    CS.SYN_ROLES.forEach(function (r) {
      roleInfo[r.key] = r;
    });
    var planLabels = ((syn && syn.plan) || []).map(function (p) {
      return p.label;
    });
    var cmd = profile.cards.filter(function (c) {
      return c.commander;
    })[0];
    // a label the card gives that the commander wants, or the other way round
    function tiesToCommander(c) {
      if (!cmd) return false;
      return Object.keys(c.gives).some(function (l) {
        return cmd.wants[l];
      }) || Object.keys(c.wants).some(function (l) {
        return cmd.gives[l];
      });
    }
    // Extra protection is a surplus, unless the commander is the creature
    // to protect (it protects itself, like Eight-and-a-Half-Tails, or wants
    // Equipment and Auras). More tutors is never counted as waste.
    var cmdT = profile.commander;
    var cmdTypes = cmd ? namedTypes(cmd.text, profile.typeCount) : [];
    var protectPlan = !!(cmdT && (cmdT.gives.protect || cmdT.wants.protect || cmdT.wants.gear));
    var gcCount = 0;
    profile.cards.forEach(function (c) {
      if (byId[c.id] && byId[c.id].gameChanger) gcCount++;
    });
    var out = [];
    profile.cards.forEach(function (c) {
      if (c.commander || c.land) return;
      var key = CS.nameKey(c.name);
      if (protect[key] || cutKeys[key]) return;
      var fit = syn && syn.fits && typeof syn.fits[c.id] === "number" ? syn.fits[c.id] : null;
      if (fit == null || fit >= 75) return;
      var roles = Object.keys(c.roles);
      var keeps = roles.filter(function (r) {
        return KEEP_ROLES[r] && (roleCount[r] || 0) <= roleInfo[r].target;
      });
      if (keeps.length) return;
      var reasons = [];
      var surplus = 0;
      var surplusRole = null;
      roles.forEach(function (r) {
        if (!KEEP_ROLES[r] && !(r === "protection" && !protectPlan)) return;
        // cycle 11: no surplus of what the commander feeds on (draw for
        // Sheoldred or Nekusar, edicts for Tergrid)
        if (cmd && r === "draw" && (cmd.wants.drawing || cmd.wants.oppdraw)) return;
        if (cmd && r === "removal" && cmd.wants.oppsac) return;
        var t = roleInfo[r].target;
        // a card or two over the usual count isn't a surplus; a quarter over is
        var x = Math.min(1, Math.max(0, ((roleCount[r] || 0) - 1.25 * t) / t));
        if (x > surplus) {
          surplus = x;
          surplusRole = r;
        }
      });
      var slim = byId[c.id] || {};
      var cmc = typeof slim.cmc === "number" ? slim.cmc : null;
      var payload = CS.isCheatPayload(c, profile);
      var inPlan = planLabels.some(function (l) {
        return c.gives[l] || c.wants[l];
      }) || cmdTypes.some(function (t) {
        return c.subtypes[t]; // a Dragon in a Dragon commander's deck is the plan
      });
      var offCurve = cmc != null && cmc >= 6 && fit < 60 && !payload && !inPlan ? 1 : 0;
      var gc = slim.gameChanger ? 1 : 0;
      // Staples: a role card most decks run (high on EDHREC) is kept;
      // other role cards count weak Fit for less, since ramp and removal
      // rarely tie in to a theme (taxonomy "staple damping").
      var rank = typeof slim.edhrecRank === "number" ? slim.edhrecRank : null;
      if (roles.length && rank != null && rank <= STAPLE_RANK) return;
      // a card that feeds what the commander itself wants (a land bouncer
      // for a landfall commander) is part of its engine: weak Fit counts less
      var feeds = cmd && Object.keys(c.gives).some(function (l) {
        return cmd.wants[l];
      });
      var lowFit = (1 - fit / 100) * (roles.length || payload ? 0.4 : feeds ? 0.5 : 1);
      var surplusEff = surplus * Math.min(1, (100 - fit) / 60); // Rishkar (counters and ramp) stays
      var score = 0.5 * lowFit + 0.25 * surplusEff + 0.15 * offCurve + 0.1 * gc;
      if (fit < 40 && !roles.length && !payload)
        reasons.push(
          "Weak fit (Fit " + fit + "): " +
            (tiesToCommander(c) ? "ties in to your commander, little else" : "ties in to little else here"),
        );
      if (surplusRole && surplus > 0)
        reasons.push(
          roleInfo[surplusRole].label + ": " + roleCount[surplusRole] +
            " in the deck, about " + roleInfo[surplusRole].target + " is typical",
        );
      if (offCurve) reasons.push("Costs " + cmc + " and isn't part of the deck's plan");
      if (gc)
        reasons.push(
          gcCount > 3
            ? "Game Changer: the deck has " + gcCount + " (over 3 means bracket 4)"
            : "Game Changer: the deck has " + gcCount + " (any means bracket 3 or higher)",
        );
      if (!reasons.length) {
        // no concrete reason and a Fit at or above the deck's average: not a cut idea
        if (syn && typeof syn.score === "number" && fit >= syn.score) return;
        if (feeds) return; // feeds the commander's own engine (Quirion Ranger for Zimone)
        if (roles.length) return; // a role card doing its job (a tutor, removal) isn't a cut just for low Fit
        reasons.push("Fit " + fit + ", lower than most of the deck");
      }
      out.push({
        id: c.id,
        name: c.name,
        score: Math.round(score * 100),
        fit: fit,
        reasons: reasons,
        roles: roles,
        cmc: cmc,
      });
    });
    out.sort(function (a, b) {
      return b.score - a.score || a.fit - b.fit || (a.name < b.name ? -1 : 1);
    });
    return out;
  };

  /**
   * What to cut for a card just added (taxonomy swap_pairing, simplified):
   * a cut idea scores higher when it does the same job, works the same theme,
   * or costs about the same. A land pairs with a basic land.
   * `added`: the added card (slim); `ideas`: CS.cutSuggestions result;
   * `deckCards`: parsed export lines (for basics); `cuts`: current cuts.
   * Returns up to 3 [{name, id (null for a basic), why}].
   */
  CS.swapSuggestions = function (added, ideas, profile, deckCards, cuts) {
    if (!added) return [];
    var me = CS.cardTraits(added);
    if (me.land) {
      var cutLeft = cuts || {};
      var basics = {};
      (deckCards || []).forEach(function (c) {
        if (!CS.isBasicLand(c.name)) return;
        var cutN = 0;
        Object.keys(cutLeft).forEach(function (n) {
          if (CS.nameKey(n) === CS.nameKey(c.name)) cutN += cutLeft[n];
        });
        var have = (basics[c.name] ? basics[c.name].have : 0) + (c.qty || 1);
        basics[c.name] = { name: c.name, have: have, cut: cutN };
      });
      return Object.keys(basics)
        .map(function (n) {
          return basics[n];
        })
        .filter(function (b) {
          return b.have - b.cut > 0;
        })
        .sort(function (a, b) {
          return b.have - b.cut - (a.have - a.cut) || (a.name < b.name ? -1 : 1);
        })
        .slice(0, 3)
        .map(function (b) {
          return { name: b.name, id: null, why: "a basic land, for a land" };
        });
    }
    var traits = {};
    profile.cards.forEach(function (c) {
      traits[c.id] = c;
    });
    var myRoles = Object.keys(me.roles);
    var myLabels = Object.keys(me.gives).concat(Object.keys(me.wants));
    var cmc = typeof added.cmc === "number" ? added.cmc : null;
    var roleLabel = {};
    CS.SYN_ROLES.forEach(function (r) {
      roleLabel[r.key] = r.label.toLowerCase();
    });
    return (ideas || [])
      .map(function (y) {
        var t = traits[y.id] || { gives: {}, wants: {}, roles: {} };
        var sameRole = myRoles.filter(function (r) {
          return t.roles[r];
        })[0];
        var sameTheme = myLabels.some(function (l) {
          return t.gives[l] || t.wants[l];
        });
        var mvClose =
          cmc != null && y.cmc != null ? 1 - Math.min(Math.abs(cmc - y.cmc), 4) / 4 : 0;
        var pair = y.score / 100 + (sameRole ? 0.5 : 0) + (sameTheme ? 0.3 : 0) + 0.1 * mvClose;
        var why = sameRole
          ? "does the same job (" + roleLabel[sameRole] + "), weaker fit"
          : y.reasons[0].charAt(0).toLowerCase() + y.reasons[0].slice(1);
        return { name: y.name, id: y.id, why: why, pair: pair };
      })
      .sort(function (a, b) {
        return b.pair - a.pair || (a.name < b.name ? -1 : 1);
      })
      .slice(0, 3)
      .map(function (x) {
        return { name: x.name, id: x.id, why: x.why };
      });
  };

  // ---------------------------------------------------------------- filters

  CS.TYPES = [
    "creature",
    "instant",
    "sorcery",
    "artifact",
    "enchantment",
    "planeswalker",
    "land",
    "battle",
  ];

  CS.defaultSettings = function () {
    return { v: 1, hideGameChangers: true, maxPrice: null, types: [] };
  };

  /** Card types on the front face: "Artifact Creature — Golem" -> ['artifact','creature']. */
  CS.cardTypes = function (slim) {
    var main = String(slim.frontType || slim.typeLine || "")
      .split("\u2014")[0]
      .toLowerCase();
    return CS.TYPES.filter(function (t) {
      return new RegExp("\\b" + t + "\\b").test(main);
    });
  };

  /**
   * Whether a card passes the filters. Unknown price passes a price limit
   * (the card shows "no price"). An empty type list means every type.
   */
  CS.passesFilters = function (slim, settings) {
    var s = settings || CS.defaultSettings();
    if (!slim) return false;
    if (s.hideGameChangers && slim.gameChanger) return false;
    if (
      typeof s.maxPrice === "number" &&
      slim.usd != null &&
      slim.usd > s.maxPrice
    )
      return false;
    if (s.types && s.types.length) {
      var t = CS.cardTypes(slim);
      if (
        !t.some(function (x) {
          return s.types.indexOf(x) !== -1;
        })
      )
        return false;
    }
    return true;
  };

  /**
   * The next `n` cards to show from a pile: not yet decided, details
   * loaded (cardInfo[id]), and passing the filters. Filters apply as cards
   * are drawn, so changing one never loses swipes.
   */
  CS.nextCards = function (pile, state, settings, cardInfo, n) {
    var out = [];
    var decided = (state && state.decisions) || {};
    var cards = (pile && pile.cards) || [];
    for (var i = 0; i < cards.length && out.length < (n || 1); i++) {
      var c = cards[i];
      if (decided[c.id]) continue;
      var info = cardInfo && cardInfo[c.id];
      if (!info || !CS.passesFilters(info, settings)) continue;
      out.push(c);
    }
    return out;
  };

  // ---------------------------------------------------------------- swipes

  CS.CHOICES = ["add", "skip", "maybe"];

  /** Short stable hash (FNV-1a, 32-bit) as 8 hex digits. */
  CS.hash = function (s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  };

  /**
   * Deck id: commander slug + hash of the sorted card names, so pasting the
   * same deck again picks up where you left off.
   */
  CS.deckId = function (commanderName, cards) {
    var names = Object.keys(CS.deckNameSet(cards)).sort();
    return CS.commanderSlug(commanderName) + "-" + CS.hash(names.join("\n"));
  };

  /**
   * Saved swipes for one deck. Format v2 (cycle 8) adds `cards` (the deck's
   * sorted name keys, so an edited version of the deck can find this save),
   * `cuts` ({card name as in the export: copies to cut}) and `removed`
   * (name keys of cards that left the deck in an edit, so a pick that was
   * added and later cut doesn't come back as a pick). v2 saves are kept
   * under `cs:deck2:<id>`; v1 saves stay under `cs:deck:<id>` untouched.
   */
  CS.newDeckState = function (commanderName, now, cards) {
    return {
      v: 2,
      commander: commanderName,
      cards: Array.isArray(cards) ? cards.slice() : null,
      decisions: {},
      history: [],
      cuts: {},
      removed: [],
      updated: now || 0,
    };
  };

  /** Storage key (without "cs:") of a deck's v2 save, and of its v1 save. */
  CS.deckKey = function (deckId) {
    return "deck2:" + deckId;
  };
  CS.oldDeckKey = function (deckId) {
    return "deck:" + deckId;
  };

  /** The deck's names as sorted keys (what a v2 save keeps in `cards`). */
  CS.deckKeys = function (cards) {
    return Object.keys(CS.deckNameSet(cards || [])).sort();
  };

  function cleanCuts(src) {
    var out = {};
    if (!src || typeof src !== "object" || Array.isArray(src)) return out;
    Object.keys(src).forEach(function (name) {
      var n = src[name];
      if (
        typeof name === "string" &&
        name.trim() &&
        typeof n === "number" &&
        n >= 1 &&
        n <= 99 &&
        Math.floor(n) === n
      )
        out[name] = n;
    });
    return out;
  }

  /**
   * Checks a saved deck state. Returns a clean v1 state, or null if it
   * can't be used (then the page starts fresh for that deck). When the
   * format changes, convert older versions here.
   */
  CS.migrateDeckState = function (saved) {
    if (
      !saved ||
      typeof saved !== "object" ||
      (saved.v !== 1 && saved.v !== 2)
    )
      return null;
    var decisions = {};
    var src =
      saved.decisions && typeof saved.decisions === "object"
        ? saved.decisions
        : {};
    Object.keys(src).forEach(function (id) {
      if (CS.CHOICES.indexOf(src[id]) !== -1) decisions[id] = src[id];
    });
    var history = Array.isArray(saved.history)
      ? saved.history.filter(function (id) {
          return (
            typeof id === "string" &&
            Object.prototype.hasOwnProperty.call(decisions, id)
          );
        })
      : [];
    // v1 saves (before cycle 8) have no card list and no cuts.
    var cards =
      saved.v === 2 && Array.isArray(saved.cards)
        ? saved.cards.filter(function (k) {
            return typeof k === "string";
          })
        : null;
    var removed =
      saved.v === 2 && Array.isArray(saved.removed)
        ? saved.removed.filter(function (k) {
            return typeof k === "string";
          })
        : [];
    return {
      v: 2,
      commander: typeof saved.commander === "string" ? saved.commander : "",
      cards: cards,
      decisions: decisions,
      history: history,
      cuts: saved.v === 2 ? cleanCuts(saved.cuts) : {},
      removed: removed,
      updated: typeof saved.updated === "number" ? saved.updated : 0,
    };
  };

  function copyState(state) {
    return {
      v: 2,
      commander: state.commander,
      cards: state.cards ? state.cards.slice() : null,
      decisions: Object.assign({}, state.decisions),
      history: state.history.slice(),
      cuts: Object.assign({}, state.cuts || {}),
      removed: (state.removed || []).slice(),
      updated: state.updated,
    };
  }

  /** Records a swipe. Returns a new state; the old one is unchanged. */
  CS.decide = function (state, id, choice, now) {
    if (CS.CHOICES.indexOf(choice) === -1)
      throw new Error("Unknown choice: " + choice);
    var s = copyState(state);
    s.history = s.history.filter(function (x) {
      return x !== id;
    });
    s.decisions[id] = choice;
    s.history.push(id);
    s.updated = now || s.updated;
    return s;
  };

  /** Undoes the last swipe. Returns {state, id} (id null if nothing to undo). */
  CS.undo = function (state, now) {
    var s = copyState(state);
    var id = s.history.pop() || null;
    if (id) {
      delete s.decisions[id];
      s.updated = now || s.updated;
    }
    return { state: s, id: id };
  };

  /** Takes a card off the Added or Maybe list (it can come back in its pile). */
  CS.clearDecision = function (state, id, now) {
    var s = copyState(state);
    delete s.decisions[id];
    s.history = s.history.filter(function (x) {
      return x !== id;
    });
    s.updated = now || s.updated;
    return s;
  };

  /** Ids with a given choice, in the order they were swiped. */
  CS.idsWith = function (state, choice) {
    return state.history.filter(function (id) {
      return state.decisions[id] === choice;
    });
  };

  /**
   * "Copy picks" text: one "1 Card Name" per line, nothing else.
   * Takes card names (Scryfall's full names, "Front // Back" for
   * double-faced cards).
   */
  CS.copyOutText = function (names) {
    return names
      .map(function (n) {
        return "1 " + String(n).trim();
      })
      .join("\n");
  };

  // ---------------------------------------------------------------- edited decks

  var CARRY_MIN = 0.6; // share of cards two versions of a deck must have in common

  /**
   * Finds the save to carry over when a deck is pasted again after edits
   * (picks added, cards cut), so the swipes aren't lost.
   * `entries`: [{key: "deck2:<id>", state: migrated state}] from storage;
   * `slug`: the commander's slug; `newKeys`: CS.deckKeys of the new paste.
   * Only saves for the same commander that know their cards count (v1
   * saves don't, so they're never carried), and they must share at least
   * 60% of their cards. Most shared wins, then the most recent. Empty
   * saves are ignored. Returns {key, state, overlap (0-1)} or null.
   */
  CS.findCarrySource = function (entries, slug, newKeys, minOverlap) {
    var min = typeof minOverlap === "number" ? minOverlap : CARRY_MIN;
    var prefix = CS.deckKey(slug + "-");
    var newSet = {};
    (newKeys || []).forEach(function (k) {
      newSet[k] = true;
    });
    var best = null;
    (entries || []).forEach(function (e) {
      if (!e || !e.state || typeof e.key !== "string") return;
      if (e.key.indexOf(prefix) !== 0) return;
      if (!/^[0-9a-f]{8}$/.test(e.key.slice(prefix.length))) return; // another commander whose slug starts the same
      var s = e.state;
      if (!Object.keys(s.decisions).length && !Object.keys(s.cuts || {}).length)
        return;
      if (!s.cards) return;
      var shared = s.cards.filter(function (k) {
        return newSet[k];
      }).length;
      var size = Math.max(s.cards.length, (newKeys || []).length);
      var overlap = size ? shared / size : 0;
      if (overlap < min) return;
      var cand = { key: e.key, state: s, overlap: overlap };
      if (
        !best ||
        overlap > best.overlap ||
        (overlap === best.overlap && (s.updated || 0) > (best.state.updated || 0))
      )
        best = cand;
    });
    return best;
  };

  /**
   * Cuts still to make: drops cuts for cards no longer in the deck (done in
   * Moxfield) and caps each at the copies the deck has.
   * `cards`: parsed export lines.
   */
  CS.liveCuts = function (cuts, cards) {
    var have = {};
    var label = {};
    (cards || []).forEach(function (c) {
      if (c.side) return;
      var k = CS.nameKey(c.name);
      have[k] = (have[k] || 0) + (c.qty || 1);
      if (!label[k]) label[k] = c.name;
    });
    var out = {};
    Object.keys(cuts || {}).forEach(function (name) {
      var k = CS.nameKey(name);
      if (!have[k]) return;
      var n = Math.min(cuts[name], have[k]);
      if (n >= 1) out[label[k]] = (out[label[k]] || 0) + n;
    });
    Object.keys(out).forEach(function (n) {
      out[n] = Math.min(out[n], have[CS.nameKey(n)]);
    });
    return out;
  };

  /**
   * A carried-over save made fit for the new paste: the new card list, cuts
   * trimmed to what's still in the deck, and the cards that left the deck
   * added to `removed` (cards back in the deck come off it). Swipes stay
   * as they were.
   */
  CS.carryOver = function (state, newKeys, cards, now) {
    var s = copyState(state);
    var keys = (newKeys || []).slice();
    var inNew = {};
    keys.forEach(function (k) {
      inNew[k] = true;
    });
    var removed = {};
    s.removed.forEach(function (k) {
      if (!inNew[k]) removed[k] = true;
    });
    (s.cards || []).forEach(function (k) {
      if (!inNew[k]) removed[k] = true;
    });
    s.removed = Object.keys(removed).sort();
    s.cards = keys;
    s.cuts = CS.liveCuts(s.cuts, cards);
    s.updated = now || s.updated;
    return s;
  };

  /** Cuts one more copy of a deck card (up to `max` copies). Returns a new state. */
  CS.cutOne = function (state, name, max, now) {
    var s = copyState(state);
    var cur = Object.prototype.hasOwnProperty.call(s.cuts, name) ? s.cuts[name] : 0;
    var cap = typeof max === "number" && max >= 1 ? max : 1;
    if (cur < cap) s.cuts[name] = cur + 1;
    s.updated = now || s.updated;
    return s;
  };

  /** Takes back one cut copy. Returns a new state. */
  CS.uncutOne = function (state, name, now) {
    var s = copyState(state);
    if (Object.prototype.hasOwnProperty.call(s.cuts, name)) {
      if (s.cuts[name] > 1) s.cuts[name] -= 1;
      else delete s.cuts[name];
    }
    s.updated = now || s.updated;
    return s;
  };

  /** Number of cut copies in all. */
  CS.cutCount = function (cuts) {
    return Object.keys(cuts || {}).reduce(function (a, n) {
      return a + cuts[n];
    }, 0);
  };

  /**
   * Splits Added cards into picks still to add, picks already in the deck
   * (added in Moxfield and pasted back), and picks that were in the deck and
   * were cut from it since (`removed`: name keys from the save).
   * `nameOf(id)` gives a card's name or null while it loads; unknown names
   * count as still to add.
   */
  CS.splitAdded = function (ids, nameOf, deckNames, removed) {
    var gone = {};
    (removed || []).forEach(function (k) {
      gone[k] = true;
    });
    var out = { pending: [], inDeck: [], gone: [] };
    (ids || []).forEach(function (id) {
      var n = nameOf(id);
      var k = n ? CS.nameKey(n) : null;
      if (k && deckNames[k] === true) out.inDeck.push(id);
      else if (k && gone[k]) out.gone.push(id);
      else out.pending.push(id);
    });
    return out;
  };

  /** Copies in the deck: every card line's count added up (sideboard and the like left out). */
  CS.deckSize = function (cards) {
    return (cards || []).reduce(function (a, c) {
      return c.side ? a : a + (c.qty || 1);
    }, 0);
  };

  /**
   * The whole deck with the changes made, for Moxfield's Bulk Edit (which
   * replaces the list): the export's own lines kept as they are (printings,
   * foil marks, section headers), cut copies taken off the main list, and
   * one "1 Card Name" line per pick right after the main list's last card
   * (before a sideboard or maybeboard section, if there is one).
   */
  CS.updatedDeckText = function (exportText, cuts, pickNames) {
    var left = {};
    Object.keys(cuts || {}).forEach(function (n) {
      var k = CS.nameKey(n);
      left[k] = (left[k] || 0) + cuts[n];
    });
    var lines = [];
    var side = false;
    var lastMain = -1; // index in `lines` of the main list's last card line
    String(exportText || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .forEach(function (raw) {
        var line = raw.replace(MARKERS, "").trim();
        var m = line && line.indexOf("//") !== 0 ? CARD_LINE.exec(line) : null;
        if (!m) {
          var bare = line.replace(/:$/, "").trim();
          if (line && (/:$/.test(line) || SECTION_WORDS.test(bare)))
            side = SIDE_WORDS.test(bare);
          lines.push(raw);
          return;
        }
        if (side) {
          lines.push(raw);
          return;
        }
        var k = CS.nameKey(m[2]);
        var qty = parseInt(m[1], 10);
        var take = Math.min(left[k] || 0, qty);
        if (take) left[k] -= take;
        if (qty - take > 0) {
          lines.push(take ? raw.replace(/^(\s*)\d+/, "$1" + (qty - take)) : raw);
          lastMain = lines.length - 1;
        }
      });
    var picks = CS.copyOutText(pickNames || []);
    if (picks) {
      var at = lastMain + 1;
      if (lastMain === -1) {
        at = lines.length; // no main card left: after everything
        while (at > 0 && !lines[at - 1].trim()) at--;
      }
      lines = lines.slice(0, at).concat(picks.split("\n"), lines.slice(at));
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join("\n");
  };

  // ---------------------------------------------------------------- storage

  var PREFIX = "cs:";

  /**
   * Saved data, under "cs:" keys only. Every read and write is wrapped, so
   * the page keeps working when storage is missing, full or blocked.
   * Pass a storage object (tests), or leave it out to use localStorage.
   * `ok` says whether saving is working, so the page can say so.
   */
  CS.makeStore = function (backend) {
    var s = backend;
    if (s === undefined) {
      try {
        s = root.localStorage;
      } catch (e) {
        s = null;
      }
    }
    var store = { ok: !!s };
    store.get = function (key, fallback) {
      if (!s) return fallback;
      try {
        var raw = s.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    };
    store.set = function (key, value) {
      if (!s) return false;
      try {
        s.setItem(PREFIX + key, JSON.stringify(value));
        store.ok = true;
        return true;
      } catch (e) {
        store.ok = false;
        return false;
      }
    };
    /** Every cs: key in storage, without the prefix ([] if storage can't be listed). */
    store.keys = function () {
      if (!s) return [];
      try {
        var out = [];
        for (var i = 0; i < s.length; i++) {
          var k = s.key(i);
          if (typeof k === "string" && k.indexOf(PREFIX) === 0)
            out.push(k.slice(PREFIX.length));
        }
        return out;
      } catch (e) {
        return [];
      }
    };
    store.remove = function (key) {
      if (!s) return false;
      try {
        s.removeItem(PREFIX + key);
        return true;
      } catch (e) {
        return false;
      }
    };
    return store;
  };

  /** A deck's v2 save, or null. */
  CS.readDeckState = function (store, deckId) {
    return CS.migrateDeckState(store.get(CS.deckKey(deckId), null));
  };

  /**
   * Loads a deck's saved swipes: its v2 save, else its v1 save converted
   * (the v1 save is left where it is), else a fresh state.
   */
  CS.loadDeckState = function (store, deckId, commanderName) {
    return (
      CS.readDeckState(store, deckId) ||
      CS.migrateDeckState(store.get(CS.oldDeckKey(deckId), null)) ||
      CS.newDeckState(commanderName)
    );
  };

  CS.saveDeckState = function (store, deckId, state) {
    return store.set(CS.deckKey(deckId), state);
  };

  /** Saved v2 decks for one commander: [{key, state}] (unreadable saves left out). */
  CS.savedDecksFor = function (store, slug) {
    var prefix = CS.deckKey(slug + "-");
    return store
      .keys()
      .filter(function (k) {
        return k.indexOf(prefix) === 0;
      })
      .map(function (k) {
        return { key: k, state: CS.migrateDeckState(store.get(k, null)) };
      })
      .filter(function (e) {
        return e.state;
      });
  };

  /** Loads the filters, falling back to defaults for anything missing or odd. */
  CS.loadSettings = function (store) {
    var d = CS.defaultSettings();
    var s = store.get("settings", null);
    if (!s || typeof s !== "object" || s.v !== 1) return d;
    return {
      v: 1,
      hideGameChangers:
        typeof s.hideGameChangers === "boolean"
          ? s.hideGameChangers
          : d.hideGameChangers,
      maxPrice:
        typeof s.maxPrice === "number" && s.maxPrice >= 0 ? s.maxPrice : null,
      types: Array.isArray(s.types)
        ? s.types.filter(function (t) {
            return CS.TYPES.indexOf(t) !== -1;
          })
        : [],
    };
  };

  CS.saveSettings = function (store, settings) {
    return store.set("settings", settings);
  };

  // ---------------------------------------------------------------- export

  if (typeof module !== "undefined" && module.exports) module.exports = CS;
  else root.CS = CS;
})(typeof globalThis !== "undefined" ? globalThis : this);
