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
    // cycle 29: no price (Nick proxies; price never counts, AGENTS.md)
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
      gameChanger: sc.game_changer === true,
      colorIdentity: sc.color_identity || [],
      edhrecRank: sc.edhrec_rank != null ? sc.edhrec_rank : null,
      cmc: typeof sc.cmc === "number" ? sc.cmc : null,
      // cycle 19: for big bodies (Kozilek), keyword donors (Rayami) and new cards (Graduation Day)
      power: /^\d+$/.test(String(sc.power != null ? sc.power : f.power)) ? parseInt(sc.power != null ? sc.power : f.power, 10) : null,
      keywords: (sc.keywords || []).map(function (k) {
        return String(k).toLowerCase();
      }),
      released: sc.reprint ? null : sc.released_at || null, // a reprint's date isn't the card's first printing
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
   * One of a commander's extra EDHREC pages: a theme slug from the main
   * page ("tokens"). ("budget" also works; the page stopped using it in cycle 29.) `slug` is the commander's page slug. Returns
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
   * One pile from a whole EDHREC page (a theme page):
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
   * Cycle 29 (Nick's pick 2A): the Good in any deck pile. One more page of
   * the colors' most played cards (Scryfall, order:edhrec), minus the cards
   * on the commander's EDHREC page (its own piles have those), the deck and
   * basics. Each page's new cards go strongest first (CS.strength: how
   * widely played, and how good at its job), so the pile is strong cards
   * this commander's page misses. Works with an empty edhrecMap (EDHREC
   * down): then it's simply the strongest popular cards in the colors.
   * `cardInfo`: slim cards by id, for strength. Returns the new cards.
   */
  CS.anyDeckCards = function (pile, scryCards, edhrecMap, deckNames, cardInfo) {
    var info = cardInfo || {};
    var add = CS.moreSearchCards(pile, scryCards, edhrecMap, deckNames).filter(
      function (c) {
        return !CS.onEdhrecPage(c.id, edhrecMap);
      },
    );
    var str = {};
    add.forEach(function (c, i) {
      str[c.id] = [info[c.id] ? CS.strength(info[c.id]).score : -1, i];
    });
    return add.sort(function (a, b) {
      return str[b.id][0] - str[a.id][0] || str[a.id][1] - str[b.id][1];
    });
  };

  /** Whether a card is on the commander's EDHREC page (cycle 29). */
  CS.onEdhrecPage = function (id, edhrecMap) {
    var e = edhrecMap && edhrecMap[id];
    return !!(e && e.onEdhrec !== false);
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
        // cycle 25 (Karlov, Bruvac): a legendary card's text uses its first name when the name has no comma
        var lead = /^([a-z'-]+) (of|the) /.exec(n);
        if (lead && lead[1].length > 3 && lead[1] !== "the" && /\blegendary\b/i.test(String((slim && (slim.typeLine || slim.types)) || "")))
          names.push(lead[1]);
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
    ["deaths", /\bsacrifice (a|an|another|one or more|x|two|three)( other)? ((nontoken|white|blue|black|red|green|artifact|legendary) )?(creatures?|artifact or creature|creature or artifact|permanents?|nonland permanents?)\b/],
    ["deaths", /\b(destroy|exile) all (other )?(creatures|nonland permanents)\b/],
    ["deaths", /\bsacrifice (it|them) at (the beginning of the next end step|end of combat)\b|\bdecayed\b/],
    ["deaths", /\beach creature gets -|\ball creatures get -|\bdamage to each creature\b/],
    ["deaths", /\bsacrifices? all (other )?creatures\b|\beach (player|opponent) sacrifices (a|an|one|two|three|x|\d+|[a-z]*teen) creatures?\b/], // cycle 19: Blasphemous Edict (thirteen)
    // attacks: attack triggers and things that make attacking better
    ["attacks", /\bwhenever (~|you|one or more (other )?creatures( you control)?|a creature you control|another creature you control|equipped creature|enchanted creature|a (\w+ )?token you control) attacks?\b/],
    ["attacks", /\bwhenever you attack\b|\b(myriad|mobilize|battle cry|exalted|melee|dethrone)\b/],
    ["attacks", /\bwhenever ~ (enters|blocks) or attacks\b|\bwhenever ~ attacks or blocks\b/],
    ["attacks", /\b(have|has|gains?|gets?)\b[^.]*\bhaste\b/],
    ["attacks", /\badditional combat phase\b/],
    // cycle 31 (Nick: Reconnaissance in Zurgo): pulling your attackers out of combat, untapping them
    // or giving the team vigilance makes attacking free, so it serves attack triggers like other attack help
    ["attacks", /\bremove (target|that|an|each) attacking creatures? you control from combat\b|\buntap (that creature|it) and remove it from combat\b|\bcreatures you control (have|gain) (vigilance|[^.]*\band vigilance)\b/],
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
    // cycle 25: milling yourself fills your graveyard; "each opponent mills" doesn't (that's oppmill)
    ["graveyard", /\b(you|~|target player|each player|that player|its owner|their owner|controller)( may)? mills?\b|(^|[.:,;\n]\s*|\b(then|and|may|or) )mill (a|an|one|two|three|four|five|six|seven|eight|nine|ten|x|that many|half|cards|\d+)\b|\bwhenever you mill\b|\bsurveil\b|\bdiscard (a|two|three|x|your hand|that many)\b|\bdiscards? (their|your) hands?\b/],
    // blink
    ["blink", /\bexile\b[^.]*\breturn (it|them|that card|those cards) to the battlefield\b/],
    ["blink", /\breturn (another )?target (creature|nonland permanent|permanent) you control to (its owner's|your) hand\b/],
    // cycle 18 (held-back decks: Phantasmal Image, Spark Double, Mockingbird): clones re-use enter triggers too
    ["blink", /\benters? as a copy of (any|a|an|another|target) (creature|artifact or creature|nonland permanent|permanent|creature or planeswalker)\b/],
    ["copyab", /\benters? as a copy of (any|a|an|another|target) (creature|artifact or creature|nonland permanent|permanent|creature or planeswalker)\b/],
    // cycle 18 (The Jolly Balloon Man, Kiki-Jiki, Splinter Twin, Panharmonicon): copies and doubled enter triggers re-use enter triggers
    ["blink", /\bcreate (a|x|that many) tokens? that'?s? (a )?cop(y|ies) of (another )?(target (nonlegendary )?creature you control|~)(?![a-z])|\bentering( the battlefield)? causes a triggered ability [^.]*\btriggers? an additional time\b/],
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
    // cycle 12: the Ring tempting you, amass (Armies), the monarch, keeping
    // attackers off you (goad, attack taxes, fogs, damage reflection),
    // tapping your creatures (crew, station, convoke), riot
    ["ring", /\bthe ring tempts you\b/],
    ["army", /\bamass\b/],
    ["monarch", /\bmonarch\b/],
    ["deter", /\bgoads?\b|\battacks? each combat if able\b|\battacks? a player other than you\b|\bcan't attack you\b|\bprevent all (combat )?damage that would be dealt to you\b|\bwhenever enchanted player is attacked\b|\bdeals? that much damage to (that source's|the source's|its) controller\b|\bdeals damage equal to its power to its controller\b|\bwhenever ~ is dealt damage, it deals that much damage\b|\bdeals that much damage to each other creature and each player\b/],
    ["tap", /\bcrew \d+\b|\bstation\b|\bconvoke\b|\btap (an|one|two|three|x|any number of|one or more) untapped (creatures?|artifacts? or creatures?|creatures? or artifacts?)( you control)?\b|\btap an untapped creature you control\b/],
    ["attacks", /\briot\b/],
    ["lifegain", /\b(target player|you) gains? (\d+|x|twice x|that much|life)\b/],
    ["oppdraw", /\byou and (target|that|each) (opponent|player)s? each draws?\b|\beach opponent may draw\b|\bthat player draws (two|three|four|five|six|seven|x|\d+) cards\b/],
    // cycle 25 (outcome check: Bruvac, Phenax, Zellix read as graveyard): milling opponents
    ["oppmill", /\b(each opponent|target opponent|target player|each player|that player|defending player|each other player|any number of target players|those players|each of those players|controller) mills?\b|\bopponents? mills?\b|\bif an opponent would mill\b/],
  ];

  var WANTS = [
    // go-wide and token payoffs
    ["bodies", /\bcreature tokens? you control\b|\bwhenever you create (one or more )?(creature )?tokens?\b/],
    ["bodies", /\bfor each (other )?creature you control\b(?! with)|\bnumber of (other )?creatures you control\b(?! with)|\bcreatures you control get \+\d/],
    ["bodies", /\bwhenever (a|an|one or more|another)( other)?( nontoken)? creatures?( you control)?( with power \d or less)? enters?\b/],
    ["bodies", /\bwould create one or more (creature )?tokens\b/],
    ["bodies", /\bconvoke\b|\b(twenty|ten|\d+) or more (other )?creatures\b/],
    // sacrifice outlets want fodder
    ["fodder", /\bsacrifice (a|an|another|one or more|x|two|three)( other)? ((nontoken|white|blue|black|red|green|artifact|legendary) )?(creatures?|artifact or creature|creature or artifact)\b/],
    ["fodder", /\beach player\b[^.]*\bsacrifices (a|an|one|two) (creatures?|nonland permanents?|permanents?)\b/], // cycle 16: symmetric edicts (Smallpox) want something to give up
    // death payoffs
    ["deaths", /\bwhenever (a|an|another|one or more)( other)?( nontoken)? creatures?( you control)?( or planeswalkers?)? (dies|die)\b/],
    ["deaths", /\bwhenever you sacrifice (a|an|another|one or more)( other)? (creatures?|permanents?)\b/], // cycle 16: Dina, Essence Brewer
    ["counters", /\bwhenever (a|one or more) \+1\/\+1 counters? (is|are) put on\b/], // cycle 16: Fathom Mage
    ["deaths", /\bwhenever (a|an|another)( other)?( nontoken)? creature you control (with|without) [a-z ]{1,20}? dies\b/],
    ["deaths", /\bwhenever ~ or another (nontoken )?creature( or planeswalker)?( you control)? dies\b|\bwhenever a creature an opponent controls dies\b|\ba creature dying\b|\bcreatures? (that )?(died|have died) this turn\b|\bwhenever equipped creature dies\b|\bput into a graveyard from the battlefield\b/],
    ["deaths", /\bcreature cards? [^.]*from your graveyard\b|\bfrom your graveyard to the battlefield\b/],
    ["deaths", /\bcreature cards? from (their|all|each player's|a) graveyards?\b|\ball creature cards from\b/],
    ["deaths", /\bwhenever a creature token you control leaves\b/],
    // attack payoffs
    ["attacks", /\bwhenever (~|you|one or more (other )?creatures( you control)?|a creature you control|another creature you control|equipped creature|enchanted creature|a (\w+ )?token you control) attacks?\b/],
    ["attacks", /\bwhenever ~ (enters|blocks) or attacks\b|\bwhenever ~ attacks or blocks\b/],
    // cycle 23 (Winota): "whenever a non-Human creature you control attacks" pays off attacking too
    ["attacks", /\bwhenever (a|an|one or more|another) non-?[a-z]+ creatures? you control attacks?\b/],
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
    ["graveyard", /\bleaves? your graveyard\b|\bcards? (are|is) milled\b|\bcards? (are )?in (your|all|each player's) graveyards?\b/],
    ["graveyard", /\bfrom your graveyard\b|\bfrom a graveyard\b|\b(escape|flashback|unearth|aftermath|embalm|eternalize|disturb|delve|jump-start|retrace)\b/],
    // blink payoffs: the card's own enter trigger
    ["blink", /\bwhen ~ enters\b|\bentering( the battlefield)? causes a triggered ability\b/],
    // landfall payoffs
    ["landfall", /\bwhenever (a land|one or more lands) (you control )?enters?\b|\blandfall\b|\ba land entering\b/],
    // cycle 11 payoffs
    ["dungeon", /\broom abilit(y|ies)\b|\bcompleted? (a|that) dungeon\b|\bdungeons? you own\b/],
    ["oppdraw", /\bwhenever (an opponent|a player) draws\b/],
    // cycle 25: payoffs for opponents' milled cards and full graveyards
    ["oppmill", /\bwhenever (a player|an opponent|one or more opponents) mills?\b|\bcards? (are|is) milled\b|\b(if|whenever) an opponent would mill\b|\bcards? in (target|each|an|that) (opponent's|player's) graveyard\b|\bcards? in (your )?opponents' graveyards\b|\bwhenever (a|one or more) (creature )?cards? (is|are) put into an opponent's graveyard from (their|anywhere|a) library\b|\bno cards in (their|his or her) library\b/],
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
    // cycle 18: speed goes up when an opponent loses life during your turn (The Speed Demon)
    ["drain", /\bstart your engines\b|\bmax speed\b/],
    // cycle 18: defenders (Arcades, the Strategist) and colorless spells (Kozilek's Eldrazi)
    ["defender", /\bcreatures you control with power (or toughness )?\d or less\b[^.]*\bcan't be blocked\b|\bcan't block creatures with power \d or less\b|\bcreatures with power [3-9] or greater (don't untap|can't attack)\b|\b(destroy all creatures|creatures) with power [3-9] or greater\b|\btotal power \d or less\b/],
    ["defender", /\b(creatures?|each creature|walls?) (you control )?with defender\b|\bassigns? combat damage equal to (its|their) toughness\b|\bas though (it|they) didn't have defender\b|\btoughness greater than (its|their) power\b/],
    ["colorless", /\bcolorless (spells?|creatures?|permanents?)\b|\bwhenever you tap a permanent for \{c\}|\bpermanents? that'?s? one or more colors\b|\bpermanents? they control that are one or more colors\b/],
    ["instant", /\bwhenever you cast a spell (while|during)\b|\bwhenever you cast a spell during an opponent's turn\b/],
    ["enchantments", /\benchantment cards? (from|in) your graveyard\b|\benchantment spells? you cast\b/],
    ["artifacts", /\bartifact cards?\b|\bartifact spells? you cast\b/],
    // cycle 12 payoffs
    ["ring", /\bwhenever the ring tempts you\b|\bring-bearer\b/],
    ["army", /\barm(y|ies) you control\b|\bwhenever you amass\b/],
    ["monarch", /\bmonarch\b/],
    ["deter", /\byou become the monarch\b|\bwhenever (an opponent|a player) attacks (another one of your opponents|one of your opponents|a player other than you)\b|\bgoaded\b/],
    ["tap", /\bbecomes? tapped\b/],
    ["bigspell", /\bat least (\w+) mana (was )?spent\b|\b(four|five|six|\d+) or more mana (was )?spent\b|\bif (four|five|six|seven|\d+) or more mana was spent\b|\bamount of mana spent to cast (it|that spell)\b|\bwhere x is (that spell's|the) mana value( of that spell)?\b/],
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
    attacks: { g: "Helps or rewards attacking", w: "Helps or rewards attacking", b: "Helps or rewards attacking", short: "attacking" }, // cycle 32: Reconnaissance helps, it doesn't reward
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
    // cycle 20 (from Scryfall Tagger): pile-on labels like stax, each card both gives and wants them
    hug: { g: "Helps every player (group hug)", w: "Helps every player (group hug)", b: "Helps every player (group hug)", short: "group hug" },
    oppmill: { g: "Mills opponents", w: "Mills opponents", b: "Mills opponents", short: "milling opponents" },
    theft: { g: "Plays or takes opponents' cards", w: "Plays or takes opponents' cards", b: "Plays or takes opponents' cards", short: "playing opponents' cards" },
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

    ring: { g: "Makes the Ring tempt you", w: "Pays off the Ring tempting you", b: "Tempts you and pays it off", short: "the Ring" },
    army: { g: "Amasses (grows an Army)", w: "Pays off Armies", b: "Amasses and pays off Armies", short: "Armies" },
    monarch: { g: "Makes you the monarch", w: "Pays off being the monarch", b: "Monarch card", short: "the monarch" },
    deter: { g: "Keeps attackers off you (goad, attack taxes, damage reflection)", w: "Wants opponents attacking someone else", b: "Keeps attackers off you and pays it off", short: "keeping attackers away" },
    tap: { g: "Taps your creatures (crew, station, tap abilities)", w: "Pays off your creatures becoming tapped", b: "Taps creatures and pays it off", short: "tapping your creatures" },
    bigspell: { g: "A noncreature spell costing 4 or more (or X)", w: "Pays off spells with 4 or more mana spent", b: "Big spell payoff", short: "big noncreature spells" },

    evasion: { g: "A hard-to-block creature", w: "Pays off creatures connecting (combat damage, ninjutsu)", b: "Evasive creature with a combat-damage payoff", short: "evasive attackers" },
    noncreature: { g: "A noncreature spell", w: "Pays off noncreature spells", b: "Noncreature spell that pays off noncreature spells", short: "noncreature spells" }, // cycle 23
    copyab: { g: "Copies or doubles abilities", w: "Has abilities worth copying", b: "Copies abilities and has its own", short: "copying abilities" },
    untap: { g: "Untaps your artifacts or other permanents", w: "Has a tap ability worth untapping", b: "Untaps and has a tap ability", short: "untapping" },
    // cycle 16 synergy audit (10 hand-mapped decks; Nick's Nelly Borca and Land Tax notes)
    untapc: { g: "Untaps your creatures", w: "A creature with a tap ability worth untapping", b: "Untaps creatures and has a tap ability", short: "untapping creatures" },
    dietrig: { g: "Has a death trigger", w: "Doubles death triggers (each one happens twice)", b: "Doubles death triggers and has one", short: "doubling death triggers" },
    forced: { g: "Makes opponents' creatures attack (goad, forced attacks)", w: "Pays off opponents' creatures attacking each other", b: "Forces attacks and pays them off", short: "forcing opponents to attack" },
    defender: { g: "A creature with defender", w: "Pays off defenders (draws, attacks using toughness, or helps low-power creatures)", b: "Defender that pays off defenders", short: "defenders" },
    colorless: { g: "A colorless spell", w: "Pays off colorless spells", b: "Colorless spell that pays off colorless spells", short: "colorless spells" },
    lowlands: { g: "Sacrifices or returns your own lands", w: "Better while an opponent has more lands than you", b: "Keeps your land count low and pays it off", short: "staying behind on lands" },
    // cycle 19 (Nick's Rayami and Elsha decks)
    keywords: { g: "A creature with combat keywords (flying, deathtouch, hexproof...)", w: "Borrows keywords from other creatures", b: "Has keywords and borrows more", short: "borrowed keywords" },
    heroic: { g: "A spell that targets your creature (pump or protection)", w: "Pays off spells that target your creatures", b: "Targets your creatures and pays it off", short: "spells that target your creatures" },
  };

  /** "Makes creature tokens; 15 of your cards use them" and the like. */
  CS.reasonFor = function (label, link) {
    var lab = CS.SYN_LABELS[label];
    var n = link.n;
    var cards = n === 1 ? "1 of your cards" : n + " of your cards";
    if (label === "attacks") return "Helps or rewards attacking, like " + cards;
    if (label === "stax") return "Taxes or slows opponents, like " + cards;
    if (label === "hug" || label === "oppmill" || label === "theft") return lab.g + ", like " + cards;
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
    { key: "ramp", label: "Ramp", target: 10, re: new RegExp("\\{t\\}[^:]*: add \\{|\\badd (one|two|three) mana\\b|\\badd \\{[wubrgc]\\}|\\badds? an additional (one )?(mana|\\{)|\\badds? (one|two) additional mana\\b|\\bsearch your library for [^.]*\\b" + LAND_WORD + " cards?\\b[^.]*battlefield|\\bcreate (a|two|x|that many) ([a-z]+ token or a )?treasure|\\bplay (an|up to (two|three)|two|three) additional lands?\\b|\\bput (a|up to (one|two)) (basic )?land cards? from your hand onto the battlefield\\b|\\bspells you cast cost \\{\\d+\\} less\\b|\\badd x mana\\b|\\beach spell you cast that'?s [^.]*\\bcosts \\{\\d+\\} less\\b") },
    { key: "draw", label: "Card draw", target: 10, re: /\bdraws? (a|an|one|two|three|four|five|six|seven|x|that many|\d+) cards?\b|\bdraws? (an|one|two|three|x|\d+) additional cards?\b|\bdraw cards equal\b|\bexile the top [^.]*\. (until [^.]*, )?you may play\b|\bat the beginning of your upkeep\b[^.]*\bsearch your library for up to (two|three) basic land cards\b[^.]*\binto your hand\b/ },
    { key: "removal", label: "Removal", target: 8, re: /\b(destroy|exile) (up to (one|two) )?target ((white|blue|black|red|green|multicolored|monocolored|nonland|nontoken|tapped|nonartifact|noncreature|non[a-z]+) )*(creature|artifact|enchantment|planeswalker|permanent|nonland|attacking)|-1\/-1 counters? on (up to (one|two) )?target creature|\b(destroy|exile) each (nonland )?permanents? with the most votes\b|\beach (player|opponent) (sacrifices|exiles) (a|an|one) (creature|nonland permanent|attacking creature)\b|\bthe owner of target (nonland )?permanent shuffles it into\b|\bdeals? (\d+|x) damage to (any target|target (creature|attacking|blocking))|\btarget creature (an opponent controls )?gets -|\btarget creature gets -x\/-x|\bcounter target\b|\breturn (up to (one|two) )?target (creature|nonland permanent|permanent|artifact|enchantment|planeswalker)s?( or [a-z]+)?( an opponent controls| you don't control)? to (its|their) owner('s|s'|s)? hands?\b/ },
    { key: "wipes", label: "Board wipes", target: 3, re: /\b(destroy|exile) all (other )?((tapped|untapped|attacking|non-[a-z]+|non[a-z]+) )?(creatures|nonland permanents|nontoken|artifacts|enchantments|permanents)|\beach creature gets -|\ball creatures get -|\bdamage to each creature\b|\bsacrifices? all (other )?creatures\b|\beach player sacrifices (x|\d+|ten|twenty|[a-z]*teen) creatures\b|\bairbend all (other )?creatures\b|\bthen sacrifices the rest\b|\breturn (all|each) (other )?(creatures?|nonland permanents?)[^.]*to (their|its) owners?('s|s'|s)? hands?\b/ },
    { key: "tutors", label: "Tutors", target: 2, re: new RegExp("\\bsearch your library for (a|an|up to (one|two)) (?![^.]*\\b" + LAND_WORD + "\\b)[^.]*\\bcards?\\b" +
      // cycle 18 (Starfield Shepherd: "a basic Plains card or a creature card with mana value 1 or less"; Finale of Devastation; Demonic Consultation)
      "|\\bsearch your library for [^.]*\\b(or|and/or) (a|an) ([a-z0-9]+ )*(creature|artifact|enchantment|instant|sorcery|planeswalker|equipment|aura|legendary|nonland) cards?\\b" +
      "|\\bsearch your library and/or graveyard for (a|an|up to one)\\b|\\buntil you reveal (a card with the chosen name|the named card)\\b" +
      "|\\btransmute\\b|\\bsearch your library for (a|an) (nonbasic )?land card\\b|\\bsearch your library for (a|an) ([a-z0-9]+ )*(creature|artifact|enchantment|instant|sorcery|planeswalker|equipment|aura) card[^.]*\\bor (a|an)\\b") },
    { key: "protection", label: "Protection", target: 3, re: /\b(creatures|permanents) you control (gain|have|get)[^.]*\b(indestructible|hexproof|shroud|protection)\b|\bequipped creature has[^.]*\b(shroud|hexproof|indestructible|protection)\b|\btarget (creature|permanent|artifact or creature)( you control)? (becomes [^.]*and )?gains?[^.]*\b(indestructible|hexproof|protection)\b|\ball creatures gain protection\b|\b(enchanted|equipped) creature (gets [^.]*and )?has [^.]*\b(shroud|hexproof|indestructible|protection)\b|\bprevent all combat damage\b|\bphases? out\b|\btarget (creature|permanent)( you control)? gains? shroud\b|\byou (have|gain) (hexproof|shroud|protection)\b|\b(change (the|a) target of|choose new targets for) target spell\b|\bexile (any number of )?target spells?\b|\bcounter target (noncreature |creature |instant |sorcery |instant or sorcery |activated or triggered |activated |triggered )?(spell|ability)\b|\breturn target spell to its owner's hand\b|\bspells you (cast|control) can't be countered\b|\b(have|has|gains?) ward\b/ },
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
    if (/\bsacrifice an? land\b/.test(t) && !/\bsearch your library for up to (two|three)\b/.test(t))
      t = t.replace(/[^.]*\bsearch your library for\b[^.]*/g, "");
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
    ["top", /\b(look at|play with) the top card of your library (any time|revealed)\b|\b(play|cast) [^.]*\bfrom the top of your library\b|\bmanifest (dread|the top card)\b|\breveal the top card of your library\b|\bmiracle\b|\breveal (that many|x) cards from the top of your library\b/],
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
    /\b(spells|abilities)[^.]*\bcost \{\d+\} more\b|\bcost \{\d+\} more to (cast|activate)\b|\bactivated abilities of [^.]*can't be activated\b|\bwhenever an opponent (casts|draws|searches)\b[^.]*\b(unless|loses?|damage|counter|pays?)\b|\bwhenever a player casts [^.]*\bloses? \d+ life\b|\bunless (that player|its controller|they) pays? \{|\bcan't attack you\b[^.]*\bunless\b|\byour opponents can't (cast|search|draw|gain|activate)\b|\beach opponent can't\b|\bif no mana was spent to cast it, counter\b|\bopponents? (draws?|casts?) (their|a) second\b|\bdon't untap during\b|\bnonbasic lands are\b|\bif an opponent would (search|draw)\b/;

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
    // cycle 23 (Winota): a commander that triggers when a creature that ISN'T a type attacks. Creatures
    // outside that type, and tokens of another type, are what make it go (the type itself is the payoff).
    var an = /\bwhenever (a|an|one or more|another) non-?([a-z]+) creatures? you control attacks?\b/.exec(t);
    if (an) hooks.attackNot = an[2];
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
    if (hooks.attackNot) {
      var fa = front.split("//")[0];
      var other = /\bcreature\b/.test(fa) && !(traits.subtypes || {})[hooks.attackNot] && !/\bchangeling\b/.test(traits.text || "");
      var otherTokens = traits.gives.bodies && Object.keys(traits.tokenTypes || {}).some(function (k) {
        return k !== hooks.attackNot;
      });
      if (other || otherTokens) traits.gives.attacks = true;
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
  /**
   * Cycle 20: card tags from Scryfall Tagger, trimmed to what the app's text rules miss
   * (tools/tagger/build_tags.js writes data/card_tags.json). `data`: {v, codes: {short: label}, cards: {name key: "gstax wstax"}}.
   * The page loads the file once; without it (offline, file missing) the text rules work alone.
   */
  var TAG_CARDS = null;
  var TAG_CODE = {};
  CS.setCardTags = function (data) {
    TAG_CARDS = data && data.cards && typeof data.cards === "object" ? data.cards : null;
    TAG_CODE = (data && data.codes) || {};
    return !!TAG_CARDS;
  };
  CS.hasCardTags = function () {
    return !!TAG_CARDS;
  };

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
    // cycle 16: "untap / destroy target attacking creature" (Maze of Ith) is defense, not an attack payoff
    var wantText = text.replace(/\b(target|each|all) attacking (or blocking )?creatures?( target player controls)?\b/g, "");
    WANTS.forEach(function (w) {
      if (w[1].test(w[0] === "attacks" ? wantText : text)) wants[w[0]] = true;
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
    // cycle 16 (Nick's Nelly Borca list): forced combat. Goad, attack-if-able
    // effects on opponents' creatures (Grand Melee), and attack-if-able tokens
    // handed to opponents (Goblin Spymaster; the token strip above drops those)
    if (/\bgoads?\b/.test(bare) || /\b(all|each) creatures? attacks? each combat if able\b|\bcreatures (your opponents control|target opponent controls|each opponent controls) attack each (combat|turn) if able\b/.test(bare) ||
      /\b(that player|each opponent|target opponent|its controller) creates?\b[^.]*"[^"]*\battacks? each combat if able\b/.test(bare))
      gives.forced = true;
    if (/\bgoaded creatures?\b|\bwhenever a goaded creature\b|\bcreatures? (an opponent controls|your opponents control) deals? combat damage to (one or more of )?your opponents\b|\bwhenever (a|one or more) creatures? (an opponent controls|your opponents control) attacks?\b|\bwhenever (an opponent|a player) attacks (another one of your opponents|one of your opponents|a player other than you)\b/.test(bare))
      wants.forced = true;
    // opponents' things entering tapped (Authority of the Consuls, Kismet, Blind Obedience) slows them
    if (/\byour opponents control enter (the battlefield )?tapped\b|\benter (the battlefield )?under (an opponent's|your opponents') control tapped\b/.test(bare)) {
      gives.stax = true;
      wants.stax = true;
    }
    // attack limits and Maze of Ith keep attackers off you
    if (/\bno more than (one|two|three) creatures? can attack\b|\buntap target attacking creature\b|\bcreatures? can't attack you\b/.test(bare)) gives.deter = true;
    // death-trigger doublers (Teysa Karlov, The Masamune) want cards with death triggers
    if (/\bcreature dying causes\b/.test(bare)) wants.dietrig = true;
    if (/\bwhen(ever)? [^.]{0,60}?\bdies?\b/.test(bare) || /\b(afterlife|persist|undying)\b/.test(text)) gives.dietrig = true;
    // cycle 16 (held-back decks): a creature that sacrifices itself (Sakura-Tribe Elder, Spore Frog) dies
    if (/\bcreature\b/.test(types.split("\u2014")[0]) && /(^|\n|, )sacrifice ~[,:]/.test(bare)) gives.deaths = true;
    // putting a creature card onto the battlefield (Birthing Pod, Natural Order) or granting undying/persist
    // (Mikaeus) re-buys enter triggers, like blink
    if (/\bsearch your library for (a|an|up to one) [^.]*\bcreature card\b[^.]*\bput (it|that card) onto the battlefield\b/.test(bare) ||
      /\b(have|has|gains?|gets? [^.]* and (have|has)) [^.]*\b(undying|persist)\b/.test(bare)) gives.blink = true;
    // a creature that returns itself from the graveyard (Reassembling Skeleton) is fodder
    if (/\breturn ~ from your graveyard to the battlefield\b/.test(bare)) gives.fodder = true;
    if (/\bcreature\b/.test(types.split("\u2014")[0]) && /\byou may cast ~ from your graveyard\b/.test(bare)) gives.fodder = true; // cycle 23 (Gravecrawler)
    // Skullclamp-style Equipment and small-creature reanimation want fodder
    if (/\bwhenever equipped creature dies\b/.test(bare) || /\breturn (up to (one|two) )?target creature cards? with (power|mana value) \d or less from your graveyard to the battlefield\b/.test(bare))
      wants.fodder = true;
    // catch-up cards (Land Tax, Knight of the White Orchid) want you behind on lands
    if (/\b(an|each) opponent controls more lands than you\b|\bcontrols (at least )?(two )?more lands than you\b/.test(bare)) wants.lowlands = true;
    if (/\bsacrifice (a|an|another|two) (lands?|forests?|plains|islands?|swamps?|mountains?)\b|\breturn (a|an|target) (land|forest|plains|island|swamp|mountain)( card)? you control to (its|their) owner's hand\b/.test(bare) ||
      (/\bland\b/.test(types.split("\u2014")[0]) && /\bsacrifice ~[^.]*\bsearch your library\b/.test(bare)))
      gives.lowlands = true;
    // an Aura on a land (Utopia Sprawl, Wild Growth) is ramp, not gear
    var landAura = /\baura\b/.test(types) && /\benchant (land|forest|plains|island|swamp|mountain)\b/.test(text);
    if (/\b(equipment|aura)\b/.test(types) && !landAura) {
      gives.gear = true;
      if (!/\benchant (land|artifact|enchantment|player|permanent you don't control|creature you don't control|creature an opponent controls)\b/.test(text))
        wants.protect = true; // the creature wearing it has to survive
    }
    // cycle 18 (The Speed Demon, Phyrexian Arena): a card that costs you life every turn wants life gain
    if (/\bat the beginning of [^.]*\byou (draw [^.]*\band (you )?)?lose (x|\d+|that much) life\b/.test(bare)) wants.lifegain = true;
    if (/\b(as long as|if) you control a creature\b/.test(bare)) wants.protect = true;
    else if (/\bequipped creature\b|\bwhenever (an|one or more) (equipment|auras?)\b|\b(equipment|auras?) you control\b|\bfor each (aura|equipment)\b|\bequip abilities\b|\bsearch your library for an? (equipment|aura)\b|\b(equipment|aura)( and vehicle)? spells?\b|\b(enchanted or equipped|equipped or enchanted)\b|\b(equipment|aura) cards?\b|\bas long as ~ is (equipped|enchanted)\b/.test(text))
      wants.gear = true;
    if (/\b(instant|sorcery)\b/.test(types)) gives.spells = true;
    if (/\bwhenever you cast (a|an|your first) noncreature spell\b/.test(bare)) wants.noncreature = true; // cycle 23 (Ovika)
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
    // cycle 23 (Ovika): artifacts, enchantments and planeswalkers are noncreature spells too (instants and
    // sorceries already link through "spells", so they don't count twice)
    if (!isLand && !/\b(creature|instant|sorcery)\b/.test(mainTypes)) gives.noncreature = true;
    if (/\bplaneswalker\b/.test(mainTypes)) gives.walkers = true;
    if (/\bcreature\b/.test(mainTypes.split(" ")[0] + " " + mainTypes) && !isLand) gives.etb = true;
    if (/\bsaga\b/.test(subLine)) gives.sagas = true;
    if (/\bsagas?\b|\blore counters?\b|\bfinal chapter\b|\bproliferate\b/.test(bare.replace(/\bsaga\b[^.]*\benters\b[^.]*\./, ""))) wants.sagas = true;
    if (gives.sagas) delete wants.sagas; // a Saga's own chapters aren't a payoff
    if (/\{x\}/.test(String(slim.manaCost || "").toLowerCase()) && !isLand) gives.xspells = true;
    // cycle 18: a defender (the keyword, or a Wall), and a colorless nonland card
    if (!isLand && (/(^|\n)([a-z]+(, | ))*defender(,|\n| |$)/.test(bare) || /\bwall\b/.test(subLine))) gives.defender = true;
    if (!isLand && slim.colorIdentity && slim.colorIdentity.length === 0 && !/\{[wubrg]/.test(String(slim.manaCost || "").toLowerCase()))
      gives.colorless = true;
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
    if (/\bdamage to (each opponent|each player|any target|target player|target opponent|each of your opponents|that player|target player or planeswalker|that source's controller|the source's controller|its controller)\b/.test(text.replace(/\bcombat damage\b/g, "")))
      gives.burn = true;
    // grants ninjutsu to creature cards: big creatures come in without being cast
    if (/\b(has|have) ninjutsu\b/.test(bare)) {
      wants.big = true;
      wants.attacks = true;
    }
    var permanentCard = /\b(creature|artifact|enchantment|planeswalker|battle)\b/.test(types);
    if (!isLand && permanentCard && typeof slim.cmc === "number" && slim.cmc >= BIG_CMC)
      gives.big = true;
    if (/\bwhenever you cast (an|a|your)[^.]*(instant|sorcery|noncreature)\b|\bprowess\b|\bmagecraft\b|\bwhenever you cast a spell\b(?! with)(?! that)|\b(instant and sorcery|instant and\/or sorcery|instant or sorcery) cards (are )?in your graveyard\b/.test(text))
      wants.spells = true;
    // a card only pays off its own label when it says so for others too
    var allRoles = {};
    if (!isLand)
      CS.SYN_ROLES.forEach(function (r) {
        if (r.re.test(r.key === "ramp" ? CS.rampText(bare) : bare)) allRoles[r.key] = true;
      });
    // cycle 19 (Kozilek, Butcher of Truth in Zimone; Leap and Arcane Denial): a role that comes only
    // from a rider is a side job. "Draw a card." on a pump spell or a counterspell is a cantrip. A big
    // card's cast trigger (castRoles) is a side job only in a deck that puts it into play for free
    // (CS.deckProfile and CS.swapSuggestions decide). Side jobs don't count toward role counts, role
    // swaps or "more X than the deck needs".
    var roles = allRoles;
    var sideRoles = {};
    var castRoles = {};
    if (!isLand && Object.keys(allRoles).length) {
      var mainText = bare;
      if (permanentCard && typeof slim.cmc === "number" && slim.cmc >= BIG_CMC) {
        var noCast = bare.replace(/\bwhen you cast (this spell|~)[^.]*\.?/g, "");
        CS.SYN_ROLES.forEach(function (r) {
          if (allRoles[r.key] && !r.re.test(r.key === "ramp" ? CS.rampText(noCast) : noCast)) castRoles[r.key] = true;
        });
      }
      if (/\b(instant|sorcery)\b/.test(mainTypes)) {
        var noCantrip = mainText.replace(/(^|\n|\. )(you )?draw a card( at the beginning of the next turn's upkeep)?\./g, "$1");
        var other = CS.SYN_ROLES.some(function (r) {
          return r.key !== "draw" && r.re.test(r.key === "ramp" ? CS.rampText(noCantrip) : noCantrip);
        }) || /\btarget ([a-z]+ )?creature\b|\bcreatures you control (get|gain)\b/.test(noCantrip);
        if (other) mainText = noCantrip;
      }
      // cycle 23 (Ovika's 30 rocks read as 24 card draw): a noncreature permanent that makes mana and
      // draws only by sacrificing itself is ramp; the draw is a side job
      if (permanentCard && !/\bcreature\b/.test(mainTypes) && allRoles.ramp && allRoles.draw) {
        var noSacDraw = mainText.replace(/(^|\n)[^\n]*\bsacrifice ~[^\n:]*:[^\n]*/g, "$1");
        var drawRe = CS.SYN_ROLES.filter(function (r) {
          return r.key === "draw";
        })[0].re;
        if (!drawRe.test(noSacDraw)) mainText = noSacDraw;
      }
      if (mainText !== bare) {
        roles = {};
        CS.SYN_ROLES.forEach(function (r) {
          if (allRoles[r.key] && r.re.test(r.key === "ramp" ? CS.rampText(mainText) : mainText)) roles[r.key] = true;
        });
        Object.keys(allRoles).forEach(function (k) {
          if (!roles[k]) sideRoles[k] = true;
        });
      }
    }
    if (allRoles.protection) gives.protect = true;
    // cycle 19 (Rayami): commanders that borrow keywords (Rayami, Odric, Kathril, Majestic Myriarch,
    // Concerted Effort) want creatures with keywords; any creature with a combat keyword gives one
    var KW = "(flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|protection|reach|trample|vigilance)";
    if (new RegExp("\\b" + KW + "(, (and )?" + KW + "){3,}").test(bare) &&
      /\bthe same is true for\b|\bamong\b|\bif (a|any) creature\b|\bas long as (an|a|you control a)\b/.test(bare))
      wants.keywords = true;
    var kwHas = (slim.keywords || []).some(function (k) {
      return new RegExp("^" + KW + "$").test(k);
    }) || new RegExp("(^|\\n)" + KW + "( from [a-z ]+)?((, | and )" + KW + "( from [a-z ]+)?)*[ ]*(\\n|$)").test(bare);
    if (/\bcreature\b/.test(mainTypes) && !isLand && kwHas) gives.keywords = true;
    // Rayami exiles dying creatures to borrow their keywords: it wants creatures to die
    if (/\bif (a|another) (nontoken )?creature (an opponent controls )?would die\b/.test(bare)) wants.deaths = true;
    // cycle 19 (Graduation Day in Elsha): heroic. Spells and Auras that target your own creature give it;
    // "whenever you cast a spell that targets a creature" and heroic want it
    if (!isLand && (/\b(instant|sorcery)\b/.test(mainTypes) || (/\baura\b/.test(types) && /\benchant creature\b/.test(text))) &&
      /\btarget creature( you control)? (gets \+|gains?|has|can't be blocked|becomes)|\bput (a|an|one|two|three|x) \+1\/\+1 counters? on target creature\b|\buntap target creature\b|\benchanted creature (gets \+|has|gains?)/.test(bare))
      gives.heroic = true;
    if (/\bwhenever you cast (a|an) ([a-z]+ )*spells? that targets? (~|a creature|one or more creatures|only ~|a creature you control)\b|(^|\n)heroic\b|\bwhenever ~ becomes the target of a spell( or ability)? you control\b/.test(bare))
      wants.heroic = true;
    // cycle 12: a creature with a {T} ability (a mana Elf) taps itself, which
    // "whenever ... becomes tapped" commanders (Dionus) pay off
    if (/\bcreature\b/.test(mainTypes) && !isLand && /\{t\}/.test(bare)) gives.tap = true;
    // a noncreature spell with 4 or more mana spent, for "if at least four mana
    // was spent" payoffs (The Emperor of Palamecia, Tellah); X spells count
    if (!isLand && !/\bcreature\b/.test(mainTypes) && ((typeof slim.cmc === "number" && slim.cmc >= 4) || gives.xspells)) {
      if (!gives.bigspell) typeOnly.bigspell = true;
      gives.bigspell = true;
    }
    if (allRoles.draw) gives.drawing = true; // cycle 11: for "whenever you draw a card" payoffs
    // cycle 15 missed-synergy scan (57 decks): evasive creatures for combat-damage
    // and ninjutsu commanders (Satoru, Gonti); ability copiers (Strionic
    // Resonator, Rings of Brighthearth, Felix Five-Boots); untappers (Dramatic Reversal)
    if (/\bcreature\b/.test(mainTypes) && !isLand &&
      (/(^|\n)[a-z ,]*\b(flying|menace|skulk|shadow|horsemanship|fear|intimidate)\b[a-z ,]*(\n|$)/.test(bare) || /~ (can't block and )?can't be blocked\b/.test(bare)))
      gives.evasion = true;
    if (/\bninjutsu\b|\bwhenever (a|one or more|another)( other)? creatures?( you control)? deals? combat damage to (a player|an opponent|one of your opponents)\b|\bwhenever a creature deals combat damage to one of your opponents\b/.test(bare))
      wants.evasion = true;
    if (/\bcopy (target|that|it|the) (activated or triggered |triggered |activated )?abilit(y|ies)\b|\bcopy that ability\b|\btriggers? an additional time\b/.test(bare))
      gives.copyab = true;
    var um = /\buntap (all|each|target|another target|up to (one|two|three|x) target|up to (one|two|three|x) other target)( other)? (nonland )?(permanents?|artifacts?|creatures?|lands?)( and lands)?( you control)?\b/.exec(bare);
    if (um) {
      // cycle 16: an untapper of creatures only (Retreat to Coralhelm) doesn't help a mana rock
      if (!/^creature/.test(um[6])) gives.untap = true;
      if (!/^(artifact|land)/.test(um[6])) gives.untapc = true;
    }
    // (cycle 16: "{T}: Add one mana of any color" is a mana ability too, so Birds of Paradise isn't a tap-ability creature)
    if (!isLand && /\{t\}(?![^:]*: add (\{|one|two|three|x|that much|an amount|[a-z]+ mana))[^:\n]*:/.test(bare)) {
      // a tap ability that isn't only mana
      if (/\bcreature\b/.test(mainTypes)) wants.untapc = true;
      else wants.untap = true;
    }
    // a creature whose mana grows with the board (Priest of Titania, Kami of Whispered Hopes) is worth untapping
    if (!isLand && /\bcreature\b/.test(mainTypes) && /\{t\}[^:\n]*: add [^.\n]*\b(for each|equal to|where x is)\b/.test(bare)) wants.untapc = true;
    if (!isLand && /\}: untap ~/.test(bare)) wants.copyab = true; // Basalt Monolith wants Rings of Brighthearth
    // cycle 26 (Nick: Marvin "works with almost nothing else" in a deck of mana Elves): a creature that borrows your
    // creatures' activated abilities taps for their mana and abilities, so untappers and tap-ability creatures feed it
    if (!isLand && /\bcreature\b/.test(mainTypes) && /\b(has|have|gains?) all activated abilities of (all |each )?(other )?(creatures?|permanents?)( cards?)?( you control| in (all )?graveyards?| exiled with ~)?\b/.test(bare)) {
      wants.untapc = true;
      wants.tap = true;
    }
    if (!isLand && /\bartifact\b/.test(mainTypes) && /\{t\}[^:\n]*: add \{/.test(bare)) wants.untap = true; // mana rocks (Dramatic Reversal)
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
    // cycle 20: Scryfall Tagger tags fill what the text rules miss (data/card_tags.json, see CS.setCardTags).
    // A tag only adds; it never removes a reading. A role the text reads as a rider (a cantrip) stays a side job.
    var tagJobs = {};
    var tagCodes = TAG_CARDS ? TAG_CARDS[CS.nameKey(slim && slim.name)] : null;
    if (tagCodes)
      String(tagCodes)
        .split(" ")
        .forEach(function (code) {
          var kind = code.charAt(0);
          var key = TAG_CODE[code.slice(1)] || code.slice(1);
          if (kind === "g") gives[key] = true;
          else if (kind === "w") wants[key] = true;
          else if (kind === "r" && !sideRoles[key] && !castRoles[key]) roles[key] = true;
          else if (kind === "j") tagJobs[key] = true;
        });
    return {
      tagJobs: tagJobs, // cycle 20: plan jobs from tags ("win": an alternate win, extra turns, poison)
      gives: gives,
      wants: wants,
      roles: roles,
      sideRoles: sideRoles, // cycle 19: roles from a rider (a cantrip; a big card's cast trigger in a deck that cheats it in)
      castRoles: castRoles, // cycle 19: roles that come only from a big card's cast trigger
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
  /** Cycle 19: moves a big card's cast-trigger roles to its side jobs when the deck cheats big cards in. */
  CS.applyCastSide = function (traits, cards) {
    var keys = Object.keys((traits && traits.castRoles) || {});
    if (!keys.length) return traits;
    // the commander cheats big cards in, or three or more cards do (one reanimation spell isn't a plan)
    var cheats = (cards || []).some(function (d) {
      return d.commander && d.id !== traits.id && d.wants && d.wants.big;
    }) || (cards || []).filter(function (d) {
      return d.id !== traits.id && d.wants && d.wants.big;
    }).length >= 3;
    if (!cheats) return traits;
    keys.forEach(function (k) {
      if (!traits.roles[k]) return;
      if (traits.roles === traits.sideRoles) return;
      var r = Object.assign({}, traits.roles);
      delete r[k];
      traits.roles = r;
      traits.sideRoles[k] = true;
    });
    return traits;
  };

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
        // cycle 15: a commander with a triggered or activated ability wants it copied
        if (/\bwhenever\b|\bat the beginning of\b|(^|\n)[^\n:]*\}[^\n:]*: /.test(t.text.replace(/\([^)]*\)/g, ""))) t.wants.copyab = true;
      } else applyHooks(t, s, hooks);
      cards.push(t);
    });
    // cycle 19: in a deck that puts big cards into play for free (Zimone), their cast triggers are side jobs
    cards.forEach(function (c) {
      CS.applyCastSide(c, cards);
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
    var route = CS.deckRoute(cards, deckSlims); // cycle 19: Voltron; cycle 20: every archetype (kind, also, power)
    var cmdCard = cards.filter(function (c) {
      return c.commander;
    })[0] || null;
    // cycle 23 (Shroofus: the pump spells were its top cut ideas): when the deck wins by suiting up the
    // commander, spells that target it and gear feed the commander itself
    if (route && route.kind === "voltron" && cmdCard) {
      cmdCard.wants.heroic = true;
      cmdCard.wants.gear = true;
    }
    return {
      cards: cards,
      commander: cmdCard,
      typeCount: typeCount,
      roleCount: roleCount,
      hooks: hooks,
      route: route,
    };
  };

  /** Creature types a card's text names as a group ("Warriors you control"). */
  function namedTypes(text, typeCount, allowCommon) {
    var out = [];
    Object.keys(typeCount).forEach(function (t) {
      // cycle 23 (Winota names Humans): a common type counts when the commander itself names it
      if ((COMMON_TYPES[t] && !allowCommon) || t.length < 3) return;
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
      namedTypes(c.text, me.subtypes, c.commander).forEach(function (t) {
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
    var planJob = CS.planJobFor(me, slim, profile); // cycle 19
    if (cmd && planJob === "voltron")
      reasons.push("For the game plan: suits up " + CS.frontName(cmd.name).split(",")[0] + " for commander damage");
    else if (cmd && planJob === "win" && CS.isBigBody(me, slim))
      reasons.push("For the game plan: a finisher " + CS.frontName(cmd.name).split(",")[0] + " can put into play for free");
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
      // cycle 26: "an Elf", "Elves" (was "a Elf", "Elfs")
      var Ts = /(f|fe)$/.test(T) ? T.replace(/fe?$/, "ves") : T + "s";
      rest.push([
        tribal[0],
        tribal[2] === "deck"
          ? "It's " + (/^[AEIOU]/.test(T) ? "an " : "a ") + T + ", and your deck cares about " + Ts
          : "Cares about " + Ts + "; your deck has " + profile.typeCount[tribal[1]],
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
   * Order for the "Best for your deck" pile (cycle 12). Measured with
   * tools/benchmark/holdout.js on 57 well-liked Moxfield decks: take a card
   * out of the deck and see where each method ranks it among the commander's
   * EDHREC cards. How often decks with this commander run a card (EDHREC
   * inclusion) predicts what good builders play best; EDHREC synergy adds a
   * little; Fit alone ranks real picks barely above chance (it says how a card
   * ties in, not how good it is), so here it only nudges the order.
   * `fit`: 0-100; `rec`: the card's EDHREC numbers, or null when EDHREC
   * doesn't list it; `slim`: the card (its overall EDHREC rank stands in for
   * popularity then). Higher is better.
   */
  CS.REC_FIT_WEIGHT = 0.15;
  CS.REC_STRENGTH_WEIGHT = 0.4; // cycle 15: tuned on half the 57 decks (0.4-0.5 best), checked on the other half
  CS.recScore = function (fit, rec, slim, strength) {
    var f = typeof fit === "number" ? Math.max(0, Math.min(100, fit)) / 100 : 0;
    var st = typeof strength === "number" ? strength : CS.strength(slim).score;
    st = Math.max(0, Math.min(100, st)) / 100;
    if (rec && rec.onEdhrec)
      return (rec.inclusion || 0) + 0.5 * (rec.synergy || 0) + CS.REC_FIT_WEIGHT * f + CS.REC_STRENGTH_WEIGHT * st;
    // not on the commander's page: below most cards EDHREC lists, ordered by
    // tie-in and strength (which includes how much it's played overall)
    return CS.REC_FIT_WEIGHT * f + 0.1 * st;
  };

  // ---------------------------------------------------------------- strength (cycle 15)

  /**
   * How widely a card is played across all of Commander, 0-1, from its
   * overall EDHREC rank on a log scale (rank 1 = 1, rank 100 = 0.56,
   * rank 1,000 = 0.33, rank 30,000+ = 0). 0 when the rank is unknown.
   */
  CS.popularity = function (slim) {
    var r = slim && typeof slim.edhrecRank === "number" && slim.edhrecRank > 0 ? slim.edhrecRank : null;
    return r ? Math.max(0, Math.min(1, 1 - Math.log(r) / Math.LN10 / 4.5)) : 0;
  };

  // 1 at or under the first mana value, then 0.7, 0.4, and 0.15 above the third
  function costTier(cmc, cuts) {
    if (cmc == null) return 0.4;
    return cmc <= cuts[0] ? 1 : cmc <= cuts[1] ? 0.7 : cmc <= cuts[2] ? 0.4 : 0.15;
  }

  /**
   * Cycle 15 (Nick: Fit should blend synergy and strength, as the
   * power-level sites do): how strong a card is, 0-100, whatever deck it's
   * in. Built from what edhpowerlevel, commanderpowermeter and commandersalt
   * score (fast mana, cheap tutors, cheap and instant-speed interaction,
   * one-sided wipes, repeatable card flow, free spells, Game Changers) plus
   * how widely the card is played. 55% popularity, 45% how good it is at
   * its job; a Game Changer adds 12. Strength never hides a card; it only
   * moves it up or down the order.
   * `traits`: CS.cardTraits(slim), if already worked out.
   * Returns {score, reasons: [string]}.
   */
  CS.strength = function (slim, traits) {
    if (!slim) return { score: 0, reasons: [] };
    var t = traits || CS.cardTraits(slim);
    var text = CS.synText(slim).replace(/\([^)]*\)/g, "");
    var types = String(slim.frontType || slim.typeLine || "").toLowerCase();
    var cmc = typeof slim.cmc === "number" ? slim.cmc : null;
    var instant = /\binstant\b/.test(types) || /\bflash\b/.test(text);
    var spell = /\b(instant|sorcery)\b/.test(types);
    var q = 0;
    var why = [];
    function take(v, reason) {
      if (v > q) {
        q = v;
        why = reason ? [reason] : [];
      }
    }
    var r = t.roles || {};
    if (!t.land) {
      if (r.ramp) {
        if (/\badd \{|\badd (one|two|three) mana\b/.test(text) && !spell && cmc != null && cmc <= 1) take(1, "Fast mana");
        else take(costTier(cmc, [1, 2, 3]) * 0.9, cmc != null && cmc <= 2 ? "Cheap ramp" : null);
      }
      if (r.removal) {
        var v = costTier(cmc, [1, 2, 3]);
        if (instant) v += 0.15;
        if (/\btarget (nonland )?permanent\b|\bcounter target spell\b/.test(text)) v += 0.1;
        // a creature that removes something when it enters is removal plus a body
        if (/\bcreature\b/.test(types) && /\bwhen ~ enters\b[^.]*\b(destroy|exile|return)\b/.test(text)) v += 0.45;
        v = Math.min(1, v);
        take(v, v >= 0.85 ? "Cheap, flexible interaction" + (instant ? " at instant speed" : "") : null);
      }
      if (r.wipes) {
        var w = costTier(cmc, [3, 4, 5]);
        if (/\b(creatures?|permanents?) (your opponents control|you don't control)\b|\beach creature you don't control\b/.test(text))
          take(Math.min(1, w + 0.25), "One-sided board wipe");
        else take(w, w >= 0.85 ? "Cheap board wipe" : null);
      }
      if (r.draw) {
        var rep = /\bwhenever\b[^.]*\bdraws? (a|an|one|two|\d+) cards?\b|\bat the beginning of\b[^.]*\bdraws?\b|\{t\}(?![^:]*\bsacrifice\b)[^:]*: draw\b|\bdraw a card for each\b/.test(text) ||
          (/\bwhenever\b/.test(text) && /\bdraw\b/.test(text) && !spell);
        var d = Math.min(1, costTier(cmc, [2, 3, 4]) * 0.8 + (rep ? 0.25 : 0));
        take(d, rep && d >= 0.75 ? "Repeatable card draw" : null);
      }
      if (r.tutors) {
        var open = /\bsearch your library for (a|an) card\b/.test(text);
        var tu = costTier(cmc, [1, 2, 3]) * (open ? 1 : 0.75);
        take(tu, tu >= 0.7 ? (open ? "Cheap tutor for any card" : "Cheap tutor") : null);
      }
      if (r.protection) take(Math.min(1, costTier(cmc, [1, 2, 3]) * 0.8 + (instant ? 0.15 : 0)), null);
      if ((r.removal || r.protection || r.draw) &&
        /\bwithout paying (its|their) mana cost\b|\brather than pay (this spell's|~'s) mana cost\b|\bif you control a commander, you may cast this spell without\b/.test(text))
        take(1, "Can be cast for free");
    }
    var p = CS.popularity(slim);
    var s = 0.55 * p + 0.45 * q + (slim.gameChanger ? 0.12 : 0);
    if (p >= 0.55) why.push("One of the most played cards in Commander"); // overall rank 100 or better
    if (slim.gameChanger) why.push("Game Changer");
    // cycle 19: quality is how good it is at its job, without popularity (for cards too new to be widely played)
    return { score: Math.round(100 * Math.max(0, Math.min(1, s))), reasons: why, quality: Math.round(100 * q) };
  };

  /**
   * Cycle 15: the Fit shown on a card, 60% tie-in (CS.fitScore) and 40%
   * strength (CS.strength). On the 57-deck hold-out test the blend ranks
   * real picks better than tie-in alone (AUC 0.63 vs 0.59).
   * `fit`: CS.fitScore result; `str`: CS.strength result.
   * Returns the fit result plus {score (blend), tieIn, strength, reasons}.
   */
  CS.FIT_STRENGTH_SHARE = 0.4;

  /**
   * Cycle 21 (Nick's cycle 19 pick A: plain readouts instead of a Fit number):
   * how well a card ties into the deck, in words, from its tie-in (0-100).
   * Tie-in is mostly 0 or high (Zurgo's recs: a quarter at 10 or less, half
   * at 70 or more), so three steps cover it. Strength and popularity show as
   * "in X% of <commander> decks" instead.
   */
  CS.FIT_TIERS = { strong: 70, some: 30 };
  /**
   * Cycle 31 (Nick: "I barely know what any of this means"): a word for a card's
   * strength (0-100, CS.strength), said next to the fit word so a staple with
   * few ties (Mind Stone in Zurgo) doesn't read as a bad card. Null below 60.
   */
  CS.STRONG_CARD = 60;
  CS.strengthWord = function (strength) {
    return typeof strength === "number" && strength >= CS.STRONG_CARD ? "strong in most decks" : null;
  };
  CS.fitTier = function (tieIn) {
    if (typeof tieIn !== "number" || !isFinite(tieIn)) return null;
    if (tieIn >= CS.FIT_TIERS.strong) return { key: "strong", word: "Strong fit" };
    if (tieIn >= CS.FIT_TIERS.some) return { key: "some", word: "Some fit" };
    return { key: "little", word: "Little fit" };
  };

  /**
   * A commander's name short enough for a one-line stat (cycle 21): the part
   * before a comma, the whole name when it's short or starts with "The",
   * otherwise the first word ("Zurgo Stormrender" -> "Zurgo").
   */
  CS.shortCommander = function (name) {
    var n = String(name || "").split(" // ")[0].trim();
    if (!n) return "";
    if (n.indexOf(",") > 0) return n.split(",")[0].trim();
    if (n.length <= 14 || /^the /i.test(n)) return n;
    return n.split(/\s+/)[0];
  };
  CS.blendFit = function (fit, str) {
    var out = {};
    Object.keys(fit || {}).forEach(function (k) {
      out[k] = fit[k];
    });
    var tie = fit && typeof fit.score === "number" ? fit.score : 0;
    var st = str && typeof str.score === "number" ? str.score : 0;
    out.tieIn = tie;
    out.strength = st;
    out.score = Math.round((1 - CS.FIT_STRENGTH_SHARE) * tie + CS.FIT_STRENGTH_SHARE * st);
    // tie-in reasons first; a strength reason fills a free slot (or the last one)
    var reasons = ((fit && fit.reasons) || []).slice(0, 3);
    var sr = (str && str.reasons && str.reasons[0]) || null;
    if (sr) {
      if (reasons.length >= 3) reasons[2] = sr;
      else reasons.push(sr);
    }
    out.reasons = reasons;
    out.strengthReasons = (str && str.reasons) || [];
    return out;
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
   * Returns {score (tie-in average), plan: [{label, noun, gives, wants}],
   * weakest: [{name, score}], staples: [name], scored: n, fits: {id: tie-in},
   * strengths: {id: strength}, blend (the deck's Fit with strength, cycle 15)}.
   */
  CS.deckSynergy = function (profile, slims) {
    var byId = {};
    (slims || []).forEach(function (s) {
      if (s) byId[s.id] = s;
    });
    var scored = [];
    var staples = [];
    var fits = {};
    var strengths = {};
    var blendSum = 0;
    var blendN = 0;
    profile.cards.forEach(function (c) {
      if (c.commander || c.land || !byId[c.id]) return;
      var gk = CS.gameKinds(c, byId[c.id]); // cycle 18
      var f = CS.fitScore(byId[c.id], profile, c.id);
      fits[c.id] = f.score;
      // cycle 15: the deck's Fit, as shown on cards, blends in strength
      var st = CS.strength(byId[c.id], c);
      strengths[c.id] = st.score;
      blendSum += CS.blendFit(f, st).score;
      blendN++;
      // a big card the deck cheats into play is a payload: its one job is
      // the commander's plan, so it's judged like a role card
      // cycle 18: a finisher (Nexus of Fate) has a job in the game plan whatever the themes
      var isRole = Object.keys(c.roles).length > 0 || CS.isCheatPayload(c, profile) || gk.win.length > 0;
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
        // copying abilities supports any plan; it isn't one (cycle 15)
        return plan[l].gives > 0 && plan[l].wants > 0 && l !== "copyab";
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
    // cycle 16 (Nick: the panel needs context): two named examples on each side
    // of each plan: the best tie-ins, not the commander (it's in most plans;
    // named only when it's the one card on that side) and, where possible,
    // not a card already named for an earlier plan.
    var named = {};
    planList.forEach(function (x) {
      ["gives", "wants"].forEach(function (side) {
        var pool = profile.cards
          .filter(function (c) {
            return c[side][x.label] && !c.land;
          })
          .sort(function (a, b) {
            return (a.commander ? 1 : 0) - (b.commander ? 1 : 0) || (named[a.id] ? 1 : 0) - (named[b.id] ? 1 : 0) || (fits[b.id] || 0) - (fits[a.id] || 0);
          });
        pool = pool.filter(function (c) {
          return !c.commander || pool.length === 1;
        }).slice(0, 2);
        pool.forEach(function (c) {
          named[c.id] = true;
        });
        x[side === "gives" ? "giveNames" : "wantNames"] = pool.map(function (c) {
          return CS.frontName(c.name);
        });
      });
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
      strengths: strengths,
      blend: blendN ? Math.round(blendSum / blendN) : 0, // every nonland card, role cards included
      game: CS.gamePlan(profile, byId, fits), // cycle 18
    };
  };


  /**
   * Cycle 18 (a friend of Nick's who has played a long time: "the machine is
   * unable to grasp the concept of a gameplan"; his decks take a bunch of game
   * actions to build an overwhelming advantage, with value and protection).
   * Themes (CS.deckSynergy's plan) say what cards share; the game plan says
   * what each card is for: the engine (permanents that keep making cards,
   * mana or creatures, or double what other cards do), protection that keeps
   * it alive, tutors that find the pieces, and the cards that win.
   * Per card: {engine: [kind], win: [why]}; kinds are cards, mana, creatures, doubling.
   */
  var ENGINE_KINDS = [
    ["cards", /(\bwhenever\b|\bat the beginning of\b|(^|\n)[^\n:]*\{[^}]*\}[^\n:]*:|(^|\n)[+-]?[0-9x]+:)[^.\n]*\bdraws? (a|an|one|two|three|four|five|six|seven|x|that many|\d+|cards equal)\b|(^|\n)[^\n:]*:[^.\n]*\bexile the top card of your library\b[^.]*\.\s*put (that|the exiled) card into your hand\b|\byou may (play|cast) [^.]*\bfrom the top of your library\b|\bplay lands from the top of your library\b|\bwhenever [^.]*\binvestigate\b/], // cycle 19: a cast trigger ("when you cast ~, draw") happens once, so it isn't an engine
    ["mana", /\bwhenever [^.]*\badd (one|two|three|x|\{)|\bwhenever [^.]*\bcreate [^.]*\btreasure\b|\badds? an additional\b|\badds? (one|two) additional mana\b|\{t\}[^:\n]*: add [^.\n]*\b(for each|equal to|where x is)\b|\{t\}[^:\n]*: add \{[wubrgc]\}\{[wubrgc]\}\{[wubrgc]\}|\bcreatures you control have "\{t\}: add|\bwhenever you tap [^.]*\bfor mana\b|\buntap (all|target|another target)( other)? (artifacts?|permanents?|lands?)\b|\}: untap ~/],
    ["creatures", /(\bwhenever\b|\bat the beginning of\b|(^|\n)[^\n:]*\{[^}]*\}[^\n:]*:|(^|\n)[+-]?[0-9x]+:)[^.\n]*\bcreates? [^.\n]*\bcreature tokens?\b|\bcreate a token that'?s a copy of\b|\bwhenever [^\n]*\bif it'?s a creature card, put it onto the battlefield\b/],
    ["doubling", /\benters? as a copy of (any|a|an|another|target) (creature|artifact or creature|creature or planeswalker)\b|\btriggers? an additional time\b|\bplay (an|two|three|up to (two|three)) additional lands?\b|\bcopy (that|target|it|the) (activated or triggered |triggered |activated )?abilit(y|ies)\b|\bplay lands from your graveyard\b|\bwhenever you cast [^.]*\bcopy (it|that spell)\b/],
  ];
  ENGINE_KINDS.push(["removal", /\bwhenever [^.]*, (each (other player|opponent)|target (player|opponent)|that player) sacrifices (a|an) (creature|nonland permanent|permanent)\b/]); // cycle 23 (Grave Pact)
  var WIN_KINDS = [
    ["wins the game outright", /\byou win the game\b|\beach opponent loses the game\b/],
    ["takes extra turns", /\btake an extra turn\b|\bextra turn after this one\b/],
    ["drains the table", /\beach opponent loses (x|that much|life equal)\b|\bloses x life, where x is\b|\bwhenever [^.]*\beach opponent loses \d+ life\b|\bwhenever (an opponent|a player) loses life, you gain\b|\bwhenever you gain life, (target|each) opponent loses\b/],
    ["pumps your whole team", /\bcreatures you control get \+(x|\d+)\/\+(x|\d+)[^.]*\b(and gain|and have)\b[^.]*\b(haste|trample|double strike)\b|\bcreatures you control (also )?(gain|have|get [^.]*and have) [^.]*\bdouble strike\b|\bcreatures you control get \+x\/\+x\b|\bcreatures you control gain [^.]*\band get \+x\/\+x\b|\bcreatures you control have base power and toughness x\/x\b/],
    ["grows with your board", /\bpower and toughness are each equal to the number of\b|\bpower is equal to the number of\b/],
    ["hits every opponent", /\bdamage to each opponent\b/],
    ["attacks using toughness", /\bassigns combat damage equal to its toughness\b/],
    ["turns spare mana into damage", /\bremove a \+1\/\+1 counter from ~: (it|~) deals \d damage to any target\b/],
    // cycle 32 (Archidekt: owners file Torment of Hailfire 12 times and Crackle with Power 5 as finishers)
    ["turns spare mana into damage", /\brepeat the following process x times\b[^.]*\.[^.]*\b(each opponent|that player)\b|\b(x|twice x|five times x|x times) damage to (each opponent|each of up to x targets|each of any number of target)\b/],
  ];

  CS.gameKinds = function (traits, slim) {
    var out = { engine: [], win: [] };
    if (!traits || traits.land) return out;
    var bare = String(traits.text || "").replace(/\([^)]*\)/g, "");
    var types = String((slim && (slim.typeLine || slim.types)) || "").toLowerCase();
    var permanent = /\b(creature|artifact|enchantment|planeswalker|battle)\b/.test(types.split("//")[0]);
    if (permanent)
      ENGINE_KINDS.forEach(function (k) {
        if (k[1].test(bare)) out.engine.push(k[0]);
      });
    // cycle 19: a cast trigger repeats only on a commander (recast from the command zone: Kozilek, the Great Distortion)
    if (permanent && traits.commander && out.engine.indexOf("cards") === -1 && /\bwhen you cast (~|this spell), [^.]*\bdraw\b/.test(bare)) out.engine.push("cards");
    WIN_KINDS.forEach(function (k) {
      if (k[1].test(bare)) out.win.push(k[0]);
    });
    // cycle 20: Tagger marks alternate wins, extra turns and poison the regexes miss
    if (!out.win.length && traits.tagJobs && traits.tagJobs.win) out.win.push("wins another way (an alternate win, extra turns or poison)");
    return out;
  };

  /**
   * The deck's game plan. `profile`: CS.deckProfile; `byId`: slim cards by
   * id; `fits`: tie-in by id (CS.deckSynergy). Returns {engine: [{name, kinds}],
   * engineCount, kinds: {cards: [names]...}, protection: [names],
   * tutors: [names], wins: [{name, why}], ramp, removal, wipes, bigMana,
   * ids: {id: "engine"|"win"}, notes: [text]}.
   */
  /**
   * Cycle 19 (Nick's Rayami deck: "the voltron nature of the deck seems to be missed"): how a deck
   * wins when the plan is one creature, the commander, dealing the damage. A creature commander plus
   * 6 or more Equipment and Auras that make it hit harder or get through, or a commander that pays off
   * connecting, wearing gear or borrowing keywords plus 6 or more Equipment, Auras and spells that
   * target your creature. (Zurgo's tools for a tokens deck, Skullclamp and Greaves among them, aren't
   * a Voltron plan.) `cards`: profile cards;
   * `slims`: the deck's slim cards. Returns {kind: "voltron", gear, heroic} or null.
   */
  /**
   * Cycle 25 (outcome check: Ygra, Wolverine, Tifa, Hulk win by commander damage with no gear):
   * a commander that grows itself or hits extra times is a commander-damage threat by itself.
   * `cmd`: the commander's traits. Returns the reason or null.
   */
  CS.selfGrows = function (cmd) {
    if (!cmd) return null;
    var bare = String(cmd.text || "").replace(/\([^)]*\)/g, "");
    if (/\bput (a|an|one|two|three|four|x|that many|\d+) \+1\/\+1 counters? on (~|him|her)(?![a-z])/.test(bare) ||
      /(^|[^a-z])~ enters with (x|\d+|that many) \+1\/\+1 counters\b/.test(bare)) return "grows itself with counters";
    if (/(^|[^a-z])~ gets \+(\d+|x)\/\+(\d+|x) for each\b|(^|[^a-z])~ gets \+\d+\/\+0 for each\b|(^|[^a-z])~'s power (and toughness )?(is|are each) equal to\b/.test(bare)) return "grows with the game";
    if (/\bdouble ~'s power\b|\bdouble all (combat )?damage ~ would deal\b/.test(bare)) return "doubles its own damage";
    if (/\badditional combat phase\b/.test(bare) && /\bwhenever ~ (attacks|becomes blocked|deals combat damage|is dealt damage)\b|\bif (he|she|it)'s attacking\b/.test(bare)) return "takes extra combats";
    return null;
  };

  var VOLTRON_CREATURE_CAP = 28; // cycle 32: tagged voltron decks run 3-27 other creatures, mostly under 25
  function voltronRoute(cards, slims) {
    var cmd = (cards || []).filter(function (c) {
      return c.commander;
    })[0];
    if (!cmd) return null;
    var cs = (slims || []).filter(function (s) {
      return s && s.id === cmd.id;
    })[0];
    var ct = String((cs && (cs.frontType || cs.typeLine)) || "").toLowerCase();
    if (!/\bcreature\b/.test(ct.split("//")[0])) return null;
    var gear = 0;
    var threatGear = 0; // gear that makes its wearer hit harder or get through (not Greaves, Skullclamp, Blade of Selves)
    var heroic = 0;
    cards.forEach(function (c) {
      if (c.commander || c.land) return;
      if (c.gives.gear) {
        gear++;
        var gt = String(c.text || "").replace(/\([^)]*\)/g, "");
        if (/\b(gets|get) \+\d+\/\+\d+|\+1\/\+1 counters?\b|\bdouble strike\b|\badditional combat\b|\bcan't be blocked\b|\bhas flying\b|\btrample\b|\bdeals combat damage to a player\b/.test(gt) &&
          !/\bwhenever equipped creature dies\b|\bmyriad\b/.test(gt))
          threatGear++;
      } else if (c.gives.heroic) heroic++;
    });
    var bare = String(cmd.text || "").replace(/\([^)]*\)/g, "");
    // cycle 23 (Shroofus: "whenever a Saproling you control deals combat damage to a player, create that
    // many"): when the commander is that type, pumping it is the plan
    var typeHit = /\bwhenever (a|an|another) ([a-z]+) you control deals combat damage to (a player|an opponent)\b/.exec(bare);
    var selfHit = !!(typeHit && typeHit[2] !== "creature" && (cmd.subtypes || {})[typeHit[2]]);
    var threat = selfHit || cmd.wants.gear || cmd.wants.keywords || cmd.wants.heroic ||
      /\bwhenever ~ deals (combat )?damage to (a player|an opponent|one or more players)\b/.test(bare);
    // cycle 32 (Archidekt: Satoru, Morska, Jin, Ezio decks with 28+ creatures read Voltron; owners tagged their
    // ninjas, clues and assassins, and they win by commander damage 1-34% of the time): a deck with that many
    // other creatures spreads its gear, unless the commander itself wants gear or pump spells, or is the type it pumps
    var creatures = cards.filter(function (c) {
      var s = (slims || []).filter(function (x) { return x && x.id === c.id; })[0];
      return !c.commander && !c.land && s && /\bcreature\b/.test(String(s.frontType || s.typeLine || "").toLowerCase().split("//")[0]);
    }).length;
    if (threatGear < 6 && creatures >= VOLTRON_CREATURE_CAP && !selfHit && !cmd.wants.gear && !cmd.wants.heroic) return null; // (6+ damage gear still says Voltron: Eight-and-a-Half-Tails)
    // cycle 32 (Archidekt tag test: Brago, Gonti, Lathril decks with Swords and protection read Voltron through
    // the commander's combat-damage trigger, a value trigger there): when that trigger is the only sign, the
    // path needs at least 3 pieces of gear that make the wearer hit harder or get through
    var hitOnly = !selfHit && !cmd.wants.gear && !cmd.wants.keywords && !cmd.wants.heroic;
    if (threatGear >= 6 || (threat && gear + heroic >= 6 && (!hitOnly || threatGear >= 3))) return { kind: "voltron", gear: gear, heroic: heroic };
    return null;
  };

  /**
   * Cycle 20: the deck's route by archetype (Nick: lessons were applied one card at a time; read the
   * plan the way a deck is built). Each route has labels that point to it; a card counts once per route,
   * the commander counts 12. Kindred needs the commander to share or name the type. Combo is the cEDH
   * shape (tutors + fast mana + free spells, average mana value 2.9 or less) and is the main route only
   * when the deck has no strong theme of its own or is very fast (20+). Voltron keeps cycle 19's rule.
   * Measured on 73 hand-labeled benchmark decks (tools/benchmark/plans.js) and the 56 cEDH Decklist
   * Database lists (combo or spells for 50 of them). Returns {kind, also: [up to 2], scores, power} or null.
   */
  var ROUTE_SIG = {
    lands: [["landfall", "landyard", "landhand"], ["landfall", "landyard", "landhand"]],
    aristocrats: [["deaths", "dietrig"], ["fodder", "deaths", "dietrig"]],
    "go-wide": [["bodies", "defender"], ["bodies", "defender"]],
    spells: [[], ["spells", "instant", "bigspell", "xspells"]],
    counters: [["counters"], ["counters"]],
    artifacts: [[], ["artifacts"]],
    enchantments: [[], ["enchantments", "sagas"]],
    graveyard: [["graveyard"], ["graveyard"]],
    blink: [["blink"], ["etb", "blink"]],
    lifegain: [["lifegain"], ["lifegain"]],
    drain: [["drain", "burn", "lifeloss"], ["drain", "burn"]],
    mill: [["oppmill"], ["oppmill"]],
    theft: [["theft", "exile"], ["theft", "exile"]],
    superfriends: [[], ["walkers"]],
    stax: [["stax"], []],
    pillowfort: [["deter"], ["deter"]],
    "group-hug": [["hug", "oppdraw"], ["hug"]],
    wheels: [["oppdraw"], ["oppdraw"]],
    dungeon: [["dungeon"], ["dungeon"]],
    aggro: [[], ["attacks", "evasion", "oneturn", "forced"]],
  };
  CS.ROUTE_WORDS = {
    voltron: "Voltron (one creature suited up for commander damage)", lands: "lands and landfall", aristocrats: "aristocrats (sacrifice and death triggers)",
    "go-wide": "going wide with tokens and creatures", spells: "spells (instants and sorceries)", counters: "+1/+1 counters", artifacts: "artifacts",
    enchantments: "enchantments", graveyard: "the graveyard", blink: "blink (enter-the-battlefield triggers)", lifegain: "life gain", drain: "draining and burning opponents",
    mill: "milling opponents", theft: "playing opponents' cards", superfriends: "planeswalkers", stax: "stax (taxing and locking opponents)", pillowfort: "pillow fort (keeping attackers away)",
    "group-hug": "group hug", wheels: "wheels and punishing draws", dungeon: "dungeons and the initiative", aggro: "attacking", kindred: "a creature type", big: "big creatures and big mana",
    combo: "fast combo (the cEDH shape)",
  };
  var GROW_SKIP = { etb: true, copyab: true, untapc: true, tap: true, targets: true };
  CS.deckRoute = function (cards, slims) {
    var volt = voltronRoute(cards, slims);
    var cmd = (cards || []).filter(function (c) {
      return c.commander;
    })[0];
    if (!cmd) return volt;
    var byId = {};
    (slims || []).forEach(function (s) {
      if (s) byId[s.id] = s;
    });
    var deck = (cards || []).filter(function (c) {
      return !c.land && !c.commander;
    });
    var typeOf = function (c) {
      var s = byId[c.id];
      return String((s && (s.frontType || s.typeLine)) || "").toLowerCase().split("//")[0];
    };
    var has = function (c, sig) {
      return sig[0].some(function (l) {
        return c.gives[l] && !(c.typeOnly && c.typeOnly[l]);
      }) || sig[1].some(function (l) {
        return c.wants[l];
      });
    };
    var score = {};
    Object.keys(ROUTE_SIG).forEach(function (r) {
      score[r] = deck.filter(function (c) {
        return has(c, ROUTE_SIG[r]);
      }).length + (has(cmd, ROUTE_SIG[r]) ? 12 : 0);
    });
    var count = function (re) {
      return deck.filter(function (c) {
        return re.test(typeOf(c));
      }).length;
    };
    score.spells += Math.max(0, count(/\b(instant|sorcery)\b/) - 18);
    score.artifacts += Math.max(0, count(/\bartifact\b/) - 15);
    score.enchantments += Math.max(0, count(/\benchantment\b/) - 12);
    score.superfriends += 2 * count(/\bplaneswalker\b/);
    // kindred: the deck's most common creature type, when the commander shares or names it
    var tc = {};
    deck.forEach(function (c) {
      Object.keys(c.subtypes || {}).forEach(function (t) {
        tc[t] = (tc[t] || 0) + 1;
      });
    });
    var top = Object.keys(tc).sort(function (a, b) {
      return tc[b] - tc[a];
    })[0];
    score.kindred = 0;
    if (top) {
      var plural = /(f|fe)$/.test(top) ? top.replace(/fe?$/, "ves") : top + "s";
      var named = new RegExp("\\b(" + top + "|" + plural + ")\\b").test(String(cmd.text || ""));
      if (named || (cmd.subtypes || {})[top]) score.kindred = tc[top] + (named ? 8 : 0);
    }
    // combo: the cEDH shape
    var tutors = deck.filter(function (c) {
      return c.roles.tutors;
    }).length;
    var fast = deck.filter(function (c) {
      // cycle 23: a land dropper (Sakura-Tribe Scout) is ramp but not fast mana
      return c.roles.ramp && byId[c.id] && byId[c.id].cmc != null && byId[c.id].cmc <= 1 && /\badds?\b/.test(String(c.text || ""));
    }).length;
    var free = deck.filter(function (c) {
      return /\brather than pay (this spell's|its) mana cost\b/.test(String(c.text || ""));
    }).length;
    var mvs = deck.map(function (c) {
      return (byId[c.id] && byId[c.id].cmc) || 0;
    });
    var avg = mvs.reduce(function (a, b) {
      return a + b;
    }, 0) / Math.max(1, mvs.length);
    var power = { tutors: tutors, fast: fast, free: free, avg: Math.round(avg * 100) / 100, total: tutors + fast + free };
    score.combo = power.total >= 14 && avg <= 2.9 ? power.total * 2 : 0;
    // big: a commander that cheats big things in or costs 7+, or 8+ creatures at 6+ mana
    var big = deck.filter(function (c) {
      return byId[c.id] && byId[c.id].cmc >= 6 && /\bcreature\b/.test(typeOf(c));
    }).length;
    var cmdCmc = (byId[cmd.id] && byId[cmd.id].cmc) || 0;
    score.big = (cmd.wants.big ? 12 : 0) + (big >= 8 ? big : 0) + (cmdCmc >= 7 ? cmdCmc * 2 : 0);
    // cycle 25: a creature commander that grows itself wins by commander damage without gear
    var grows = !volt && /\bcreature\b/.test(String((byId[cmd.id] && (byId[cmd.id].frontType || byId[cmd.id].typeLine)) || "").toLowerCase().split("//")[0]) ? CS.selfGrows(cmd) : null;
    if (grows) {
      var suits = deck.filter(function (c) {
        return c.roles.protection || c.gives.gear || c.gives.heroic; // protection, gear and pump spells
      }).length;
      var fed = deck.filter(function (c) {
        // the cards that feed its growth (life gain for Karlov)
        return !(c.roles.protection || c.gives.gear || c.gives.heroic) && Object.keys(c.gives).some(function (l) {
          return cmd.wants[l] && !GROW_SKIP[l];
        });
      }).length;
      // the fuel is already counted by the theme it comes from (spells for a spells commander), so it can
      // lift Voltron next to that theme but not past it (cycle 25: a spells deck read Voltron first)
      var topOther = Math.max.apply(null, Object.keys(score).map(function (k) {
        return score[k];
      }));
      score.voltron = Math.min(12 + suits + fed, Math.max(12 + suits, Math.floor(0.95 * topOther)));
      // cycle 32 (Archidekt: Animar, Helga, Eshki and Sisay decks with 28+ creatures read Voltron first; real
      // commander-damage wins 3-19%): with that many creatures, self-growth is a second plan, not the main one
      var others = deck.filter(function (c) {
        return /\bcreature\b/.test(typeOf(c));
      }).length;
      if (others >= VOLTRON_CREATURE_CAP) score.voltron = Math.min(score.voltron, Math.floor(0.95 * topOther));
    }
    var ranked = Object.keys(score).map(function (k) {
      return [k, score[k]];
    }).sort(function (a, b) {
      return b[1] - a[1];
    });
    var theme = ranked.filter(function (x) {
      return x[0] !== "combo";
    })[0];
    if (score.combo && theme && theme[1] >= 30 && power.total < 20) {
      ranked = ranked.map(function (x) {
        return x[0] === "combo" ? ["combo", Math.min(score.combo, theme[1] - 1)] : x;
      }).sort(function (a, b) {
        return b[1] - a[1];
      });
    }
    var out = ranked.filter(function (x) {
      return x[1] >= 8;
    });
    var kind = volt ? "voltron" : out.length ? out[0][0] : null;
    if (!kind) return null;
    var lead = volt ? (out[0] ? out[0][1] : 0) : out[0][1];
    var also = out.map(function (x) {
      return x[0];
    }).filter(function (k) {
      return k !== kind && score[k] >= 0.6 * lead;
    }).slice(0, 2);
    var res = { kind: kind, also: also, scores: score, power: power };
    if (grows && (kind === "voltron" || also.indexOf("voltron") !== -1)) res.grows = grows;
    if (volt) {
      res.gear = volt.gear;
      res.heroic = volt.heroic;
    }
    return res;
  };

  /**
   * Cycle 20: a card that closes the game for the deck's route, though its text isn't a finisher by itself:
   * death drains in an aristocrats deck, team pumps in a wide deck, spell burn in a spells deck, life-gain
   * drains, milling, land-drop damage. Returns the reason or null.
   */
  CS.routeWin = function (traits, slim, route) {
    if (!traits || traits.land || !route) return null;
    var r = {};
    [route.kind].concat(route.also || []).forEach(function (k) {
      r[k] = true;
    });
    var g = traits.gives, w = traits.wants;
    var bare = String(traits.text || "").replace(/\([^)]*\)/g, "");
    var hurts = g.drain || g.burn;
    if ((r.aristocrats || r["go-wide"] || r.kindred) && hurts && w.deaths) return "drains the table as creatures die";
    if ((r.lifegain || r.drain) && hurts && w.lifegain) return "turns life gain into lost life";
    if ((r.spells || r.drain) && hurts && w.spells) return "deals damage as you cast spells";
    if ((r.drain || r.wheels) && hurts && w.oppdraw) return "punishes opponents for drawing";
    if (r.lands && w.landfall && (hurts || g.bodies)) return "turns land drops into damage or an army";
    if ((r.drain || r.lands || r.artifacts || r["go-wide"]) && /\bdeals? \d+ damage to each opponent\b|\beach opponent loses \d+ life\b/.test(bare) && /\bwhenever\b/.test(bare)) return "hits every opponent again and again";
    if (r.mill && g.oppmill) return "mills opponents out";
    // cycle 32 (Archidekt: owners file Aurelia, Aggravated Assault, Karlach and Relentless Assault as finishers)
    if ((r.aggro || r["go-wide"] || r.kindred || r.voltron || r.counters || r.big) && /\badditional combat phase\b/.test(bare)) return "gives an extra combat";
    // cycle 32 (Archidekt: Kaldra Compleat, Colossus Hammer): gear that makes the commander lethal in a few hits
    if (r.voltron && g.gear && /\b(equipped|enchanted) creature gets \+([4-9]|\d\d)\/|\b(equipped|enchanted) creature (has|gains) [^.]*\bdouble strike\b/.test(bare)) return "makes your commander lethal";
    // cycle 32 (Archidekt: Cyberdrive Awakener, filed as a finisher 13 times): artifacts that become an army
    if (r.artifacts && /\beach noncreature artifact you control becomes\b|\bnoncreature artifacts you control (are|become) [^.]*\bcreatures?\b/.test(bare)) return "turns your artifacts into an army";
    if ((r["go-wide"] || r.kindred || r.aggro || r.counters) && /\b(other )?(creatures|[a-z]+s) you control get \+(\d+|x)\/\+(\d+|x)\b/.test(bare)) return "pumps the team";
    if (r.big && /\bcreature\b/.test(String(slim.frontType || slim.typeLine || "").toLowerCase()) && typeof slim.power === "number" && slim.power >= 6 && /\b(flying|trample)\b/.test(bare)) return "a huge flier or trampler";
    return null;
  };

  /** Cycle 19: a creature that wins by itself once it's on the battlefield (annihilator, 10+ power, big infect). */
  CS.isBigBody = function (traits, slim) {
    if (!traits || traits.land || !slim) return false;
    var types = String(slim.frontType || slim.typeLine || "").toLowerCase().split("//")[0];
    if (!/\bcreature\b/.test(types)) return false;
    var bare = String(traits.text || "").replace(/\([^)]*\)/g, "");
    var pw = typeof slim.power === "number" ? slim.power : null;
    return /\bannihilator\b/.test(bare) || (pw != null && pw >= 10) || (pw != null && pw >= 6 && /\binfect\b/.test(bare));
  };

  /**
   * Cycle 19: a card's job in the deck's game plan, when it has one beyond its role:
   * "win" (a finisher, or a big body the deck puts into play for free), "voltron" (Equipment, an
   * Aura or a spell that suits up the commander, when the deck wins that way), "fuel" (makes the
   * commander's own ability go: extra land drops for Zimone, keyword donors for Rayami), or null.
   */
  CS.planJobFor = function (traits, slim, profile) {
    if (!traits || traits.land || !profile) return null;
    var g = CS.gameKinds(traits, slim);
    if (g.win.length || (CS.isBigBody(traits, slim) && CS.isCheatPayload(traits, profile))) return "win";
    var cmd = profile.commander;
    if (profile.route && profile.route.kind === "voltron" && (traits.gives.gear || traits.gives.heroic)) return "voltron";
    if (cmd && cmd.id !== traits.id && Object.keys(traits.gives).some(function (l) {
      // cycle 20: a card's type counts when the commander pays off that type (Sagas for Tom Bombadil,
      // Auras for Light-Paws); measured on the plan labels, fuel found 42% -> 49%
      return cmd.wants[l] && l !== "etb";
    }))
      return "fuel";
    return null;
  };

  var DRAIN_ROUTES = { drain: true, aristocrats: true, lifegain: true, spells: true, wheels: true };
  var SMALL_DRAIN_WHY = { "drains the table": true, "hits every opponent": true, "turns spare mana into damage": true };
  var DRAIN_SCALES = /\brepeat the following process x times\b|\btimes x damage\b|\b(loses|deals) x\b|\bx (life|damage)\b|\bthat much\b|\b(life|damage) equal to\b|\bfor each\b|\bwhere x is\b|\bhalf (their|his or her)\b/;
  var DRAIN_STACK = 4; // cycle 25: this many small drains add up to a finisher (outcome check: 3, 4 and 5 keep 95%, 94% and 94% of real drain decks)
  CS.gamePlan = function (profile, byId, fits) {
    var engine = [];
    var wins = [];
    var protection = [];
    var tutors = [];
    var kinds = { cards: [], mana: [], creatures: [], removal: [], doubling: [], fuel: [] };
    var ids = {};
    var manaCards = 0; // mana engines whether or not they tie in: what the deck was built to do with mana
    var byFit = function (a, b) {
      return (b.commander ? 1 : 0) - (a.commander ? 1 : 0) || (fits[b.id] || 0) - (fits[a.id] || 0);
    };
    var cards = profile.cards.filter(function (c) {
      return !c.land;
    }).slice().sort(byFit);
    cards.forEach(function (c) {
      var g = CS.gameKinds(c, byId[c.id]);
      if (g.engine.indexOf("mana") !== -1) manaCards++;
      // an engine piece is part of this deck's engine only when it ties in (an off-plan engine is just a card)
      if (g.engine.length && (c.commander || (fits[c.id] || 0) >= 40)) {
        engine.push({ name: c.name, id: c.id, kinds: g.engine, commander: !!c.commander });
        g.engine.forEach(function (k) {
          kinds[k].push(CS.frontName(c.name));
        });
        ids[c.id] = "engine";
      }
      if (g.win.length) {
        wins.push({ name: c.name, id: c.id, why: g.win[0], commander: !!c.commander });
        ids[c.id] = ids[c.id] || "win";
      } else if (!c.commander && profile.route && (fits[c.id] || 0) >= 20 && CS.routeWin(c, byId[c.id], profile.route)) {
        // cycle 20: a finisher for this deck's route (Blood Artist in aristocrats, an anthem in a wide deck)
        wins.push({ name: c.name, id: c.id, why: CS.routeWin(c, byId[c.id], profile.route), commander: false });
        ids[c.id] = ids[c.id] || "win";
      } else if (!c.commander && CS.isBigBody(c, byId[c.id]) && CS.isCheatPayload(c, profile)) {
        // cycle 19 (Kozilek, Butcher of Truth in Zimone): a huge creature the deck puts into play for free
        wins.push({ name: c.name, id: c.id, why: "a huge body, put into play for free", commander: false });
        ids[c.id] = ids[c.id] || "win";
      }
      if (!c.commander && !ids[c.id]) {
        var job = CS.planJobFor(c, byId[c.id], profile);
        if (job === "voltron") ids[c.id] = "voltron";
        else if (job === "fuel" && (fits[c.id] || 0) >= 40) {
          ids[c.id] = "fuel";
          kinds.fuel.push(CS.frontName(c.name));
        }
      }
      if (!c.commander && c.roles.protection) protection.push(CS.frontName(c.name));
      if (!c.commander && c.roles.tutors) tutors.push(CS.frontName(c.name));
    });
    var rc = profile.roleCount || {};
    var cmd = profile.commander;
    var cmdSlim = cmd ? byId[cmd.id] : null;
    var cmdCmc = cmdSlim && typeof cmdSlim.cmc === "number" ? cmdSlim.cmc : 0;
    // built to make a lot of mana: many sources on purpose, or mana engines, or a huge commander
    var manaRamp = profile.cards.filter(function (c) {
      return !c.land && c.roles.ramp && /\badds?\b/.test(String(c.text || "")); // cycle 23: a land dropper is ramp, not a mana maker
    }).length;
    var bigMana = manaRamp >= 18 || manaCards >= 3 || cmdCmc >= 7;
    var notes = [];
    var cmdEngine = engine.some(function (e) {
      return e.commander;
    });
    var selfProtect = !!(cmd && cmd.roles && cmd.roles.protection);
    if (protection.length + (selfProtect ? 1 : 0) < 3)
      notes.push(
        "Only " + protection.length + (protection.length === 1 ? " card protects" : " cards protect") + " the engine" +
          (cmdEngine ? ", and the commander is part of it" : "") + "; decks that build an engine usually run 3 or more (counterspells, hexproof, phasing).",
      );
    if (engine.length < 4)
      notes.push("Few repeat engines (" + engine.length + "): most of the deck's advantage comes from one-time cards.");
    var route = profile.route || null;
    // cycle 25 (outcome check: 952 of 1,497 decks got a drain finisher, most from one ping card such as Impact
    // Tremors in an artifacts deck): a small repeat drain or ping closes games only when the deck is built to
    // drain (its route) or runs several that add up. One that scales (X, "that much") or the commander still
    // counts. The others stay finishers (they can close a game, and the cut ideas keep them) but as backup:
    // listed after the main ones, so the plan reads "wins in combat, with Sanctum Seeker as backup".
    // cycle 26 (Tyvar: Bloodthirsty Conqueror "drains the table"): "whenever an opponent loses life, you gain that
    // much" is half of a loop (Exquisite Blood + Sanguine Bond). Alone it only gains life, so it's a finisher only
    // when the deck has the other half ("whenever you gain life, an opponent loses that much").
    var cardText = function (w) {
      return String((byId[w.id] && byId[w.id].text) || "").toLowerCase().replace(/\([^)]*\)/g, "");
    };
    var LOSS_TO_GAIN = /\bwhenever (an opponent|a player) loses life, you gain\b/;
    var GAIN_TO_LOSS = /\bwhenever you gain life, (target|each|that) (opponent|player)s? loses?\b/;
    var gainToLoss = profile.cards.some(function (c) {
      return !c.land && GAIN_TO_LOSS.test(String(c.text || "").replace(/\([^)]*\)/g, ""));
    });
    if (!gainToLoss) {
      var halves = wins.filter(function (w) {
        var t = cardText(w);
        return w.why === "drains the table" && LOSS_TO_GAIN.test(t) && !/\beach opponent loses\b|\btarget (opponent|player) loses\b/.test(t);
      });
      wins = wins.filter(function (w) {
        return halves.indexOf(w) === -1;
      });
      halves.forEach(function (w) {
        if (ids[w.id] === "win") delete ids[w.id];
      });
    }
    var drainRoute = route && [route.kind].concat(route.also || []).some(function (k) {
      return DRAIN_ROUTES[k];
    });
    if (!drainRoute) {
      var pings = wins.filter(function (w) {
        return !w.commander && SMALL_DRAIN_WHY[w.why] && !DRAIN_SCALES.test(String((byId[w.id] && byId[w.id].text) || "").toLowerCase().replace(/\([^)]*\)/g, ""));
      });
      if (pings.length < DRAIN_STACK) {
        pings.forEach(function (w) {
          w.backup = true;
        });
        wins = wins.filter(function (w) {
          return !w.backup;
        }).concat(pings);
      }
    }
    if (route && route.kind === "voltron" && cmd) {
      var suit = route.gear + " Equipment and Auras" + (route.heroic ? " and " + route.heroic + " spells that target it" : "");
      wins.unshift({ name: cmd.name, id: cmd.id, why: route.grows && !route.gear ? "attacking for commander damage (it " + route.grows + ")" : "attacking for commander damage, suited up by " + suit, commander: true });
    } else if (route && route.grows && cmd) {
      wins.unshift({ name: cmd.name, id: cmd.id, why: "attacking for commander damage (it " + route.grows + ")", commander: true });
    }
    return {
      engine: engine,
      engineCount: engine.length,
      kinds: kinds,
      protection: protection,
      tutors: tutors,
      route: route,
      wins: wins,
      ramp: rc.ramp || 0,
      removal: rc.removal || 0,
      wipes: rc.wipes || 0,
      bigMana: bigMana,
      ids: ids,
      notes: notes,
    };
  };

  var KIND_WORDS = { cards: "cards", mana: "mana", creatures: "creatures", removal: "opponents sacrifice", doubling: "double what other cards do" };

  /** The game plan as short lines for the Your deck panel and run.js; `combos`: complete combos in the deck. */
  CS.gamePlanLines = function (g, combos) {
    if (!g) return [];
    var short = function (n) {
      return String(n).split(",")[0];
    };
    var two = function (list) {
      return list.slice(0, 2).map(short).join(" and ");
    };
    var lines = [];
    // cycle 20: the route first
    if (g.route && g.route.kind) {
      var rw = function (k) {
        return CS.ROUTE_WORDS[k] || k;
      };
      var pw = g.route.power;
      var plan = "Plan: " + rw(g.route.kind) + (g.route.also && g.route.also.length ? ", with " + g.route.also.map(rw).join(" and ") : "");
      if (g.route.kind === "combo" && pw) plan += " (" + pw.tutors + " tutors, " + pw.fast + " fast mana, " + pw.free + " free spells, average mana value " + pw.avg + ")";
      lines.push(plan + ".");
    }
    var parts = [];
    ["cards", "mana", "creatures", "removal"].forEach(function (k) {
      if ((g.kinds[k] || []).length) parts.push(KIND_WORDS[k] + " (" + two(g.kinds[k]) + ")");
    });
    var eng = "Engine: " + g.engineCount + (g.engineCount === 1 ? " card keeps" : " cards keep") + " making " +
      (parts.length ? parts.join(", ") : "an advantage");
    if (g.kinds.doubling.length) eng += "; " + g.kinds.doubling.length + " double what other cards do (" + two(g.kinds.doubling) + ")";
    // cycle 19: cards that make the commander's own ability go (Exploration for Zimone)
    if (g.kinds.fuel && g.kinds.fuel.length) eng += "; " + g.kinds.fuel.length + " feed the commander (" + two(g.kinds.fuel) + ")";
    lines.push(eng + ".");
    lines.push("Protection: " + g.protection.length + (g.protection.length ? " (" + g.protection.slice(0, 3).map(short).join(", ") + (g.protection.length > 3 ? " and others" : "") + ")" : "") + ".");
    lines.push("Tutors to find the pieces: " + g.tutors.length + (g.tutors.length ? " (" + g.tutors.slice(0, 3).map(short).join(", ") + (g.tutors.length > 3 ? " and others" : "") + ")" : "") + ".");
    lines.push("Mana: " + g.ramp + " sources" + (g.ramp >= 18 && g.bigMana !== false ? ", built to make a lot of mana" : g.kinds.mana.length >= 3 ? ", plus " + g.kinds.mana.length + " mana engines" : "") +
      ". Interaction: " + g.removal + " removal, " + g.wipes + " board wipes.");
    var main = g.wins.filter(function (x) {
      return !x.backup;
    });
    var backup = g.wins.filter(function (x) {
      return x.backup;
    });
    var w = main.slice(0, 3).map(function (x) {
      return short(x.name) + " (" + x.why + ")";
    });
    // cycle 25: a lone ping or drain outside a drain plan is a backup finisher
    if (backup.length) w.push("backup " + two(backup.map(function (x) { return x.name; })) + (backup.length > 2 ? " and " + (backup.length - 2) + " more" : ""));
    var comboWords = combos === 1 ? "the 1 combo in the deck" : "one of " + combos + " combos in the deck";
    var win = "Wins with: " + (w.length ? w.join(", ") + (combos ? ", or " + comboWords : "") : combos ? comboWords : "no clear finisher found, so combat or the engine's advantage");
    lines.push(win + ".");
    return lines;
  };

  /**
   * Cycle 16 (Nick: "Your deck" needs context): where a deck's Fit sits next
   * to 57 well-liked Moxfield decks (cycles 10-12 benchmark, scored by the
   * cycle 16 core.js): lowest 31, middle half 45-51, highest 56. Cycle 18's core.js: 32, 45-52, 56.
   */
  CS.DECK_FIT_BENCH = { n: 57, min: 32, low: 45, high: 52, max: 56 }; // cycle 18 rescore (was 31, 45, 51, 56)
  CS.deckFitWords = function (score) {
    var b = CS.DECK_FIT_BENCH;
    var where =
      score > b.max ? "higher than all " + b.n :
      score > b.high ? "higher than most of the " + b.n :
      score >= b.low ? "about the same as most of the " + b.n :
      score >= b.min ? "lower than most of the " + b.n :
      "lower than all " + b.n;
    return where + " well-liked Moxfield decks we've measured (most score " + b.low + "-" + b.high + ")";
  };

  /** "light", "about right" or "heavy" for a role count against its rough target. */
  CS.roleWord = function (have, target) {
    if (have < target * 0.75) return "light";
    if (have > target * 1.25) return "heavy";
    return "about right";
  };

  /**
   * Cycle 16: combos that make the same thing and need the same kind of card,
   * and differ in one named card, as one line ("Cathars' Crusade + a persist
   * creature + any one of: Ashnod's Altar, Viscera Seer, ..."). Each group:
   * {common, oneOf, needs, produces, bracketN, bracketLabel, ids}.
   */
  CS.groupCombos = function (list) {
    var groups = [];
    (list || []).forEach(function (c) {
      var key = (c.produces || []).slice().sort().join("|") + "#" + (c.needs || []).slice().sort().join("|");
      var cards = c.others || c.cards || [];
      var g = null;
      for (var i = 0; i < groups.length && !g; i++) {
        var h = groups[i];
        if (h.key !== key || h.size !== cards.length) continue;
        var shared = h.common.filter(function (n) {
          return cards.indexOf(n) !== -1;
        });
        if (shared.length >= h.size - 1 && shared.length >= 1) g = h;
      }
      if (!g) {
        groups.push({ key: key, size: cards.length, common: cards.slice(), oneOf: [], needs: c.needs || [], produces: c.produces || [], bracketN: c.bracketN, bracketLabel: c.bracketLabel, ids: [c.id], first: c });
        return;
      }
      var common = g.common.filter(function (n) {
        return cards.indexOf(n) !== -1;
      });
      g.common.concat(cards).forEach(function (n) {
        if (common.indexOf(n) === -1 && g.oneOf.indexOf(n) === -1) g.oneOf.push(n);
      });
      g.common = common;
      g.ids.push(c.id);
      if (c.bracketN > g.bracketN) {
        g.bracketN = c.bracketN;
        g.bracketLabel = c.bracketLabel;
      }
    });
    return groups;
  };

  // ---------------------------------------------------------------- cut suggestions

  // Roles a deck shouldn't drop below (taxonomy: ramp, card advantage,
  // targeted and mass disruption). A card that keeps one of these at or
  // under its typical count isn't suggested as a cut, unless the card being
  // added does the same job.
  var KEEP_ROLES = { ramp: true, draw: true, removal: true, wipes: true };
  var BASIC_COLOR = { plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G", wastes: "C" };

  function basicColor(name) {
    var m = /(plains|island|swamp|mountain|forest|wastes)\s*$/i.exec(CS.frontName(name || ""));
    return m ? BASIC_COLOR[m[1].toLowerCase()] : null;
  }

  /**
   * Cycle 15: what a land does for a deck, from its text.
   * Returns {tapped: "always" | "sometimes" | null, colors: {W: true...},
   * any: bool (any color), utility: bool (does something besides mana)}.
   */
  CS.landInfo = function (slim) {
    var t = CS.synText(slim).replace(/\([^)]*\)/g, "");
    var types = String((slim && (slim.typeLine || slim.types)) || "").toLowerCase();
    var tapped = null;
    var m = /(^|\n|\. )~ enters (the battlefield )?tapped([^.\n]*)/.exec(t);
    if (m) tapped = /\bunless\b|\bif you\b/.test(m[3]) ? "sometimes" : "always";
    if (/\bif you don't, (it|~) enters tapped\b/.test(t)) tapped = "sometimes"; // shock lands
    var colors = {};
    var any = /\bmana of any (one )?color\b|\bany color in your commander\b|\bmana of any type\b/.test(t);
    var add = t.match(/\badd [^.\n]*/g) || [];
    add.forEach(function (a) {
      (a.match(/\{([wubrgc])\}/g) || []).forEach(function (x) {
        colors[x.charAt(1).toUpperCase()] = true;
      });
    });
    Object.keys(BASIC_COLOR).forEach(function (b) {
      if (new RegExp("\\b" + b + "\\b").test(types)) colors[BASIC_COLOR[b]] = true;
    });
    // fetch lands: the colors of the land types they find
    var f = /\bsearch your library for [^.]*/.exec(t);
    if (f) {
      if (/\bbasic land card\b|\bland card\b/.test(f[0]) && !/\b(plains|island|swamp|mountain|forest)\b/.test(f[0])) any = true;
      Object.keys(BASIC_COLOR).forEach(function (b) {
        if (new RegExp("\\b" + b + "\\b").test(f[0])) colors[BASIC_COLOR[b]] = true;
      });
    }
    // anything left once mana and entering tapped are taken out is a utility
    var rest = t
      .replace(/(^|\n)\{t\}: add [^\n]*/g, "")
      .replace(/(^|\n|\. )~ enters (the battlefield )?tapped[^.\n]*\.?/g, "")
      .replace(/\bas ~ enters, you may pay \d+ life\. if you don't, it enters tapped\./g, "")
      .replace(/\{t\}, pay 1 life: add [^\n]*/g, "")
      .replace(/[^.\n]*\bsearch your library for [^\n]*/g, "")
      .replace(/\bwhen ~ enters, (you gain 1 life|scry 1|surveil 1)\./g, "") // gain lands and scry lands are plain mana
      .replace(/[\s.]+/g, "");
    return { tapped: tapped, colors: colors, any: any, utility: rest.length > 0 };
  };

  /** Colored mana symbols across the deck's nonland cards: {W: n, ...} (hybrid counts half). */
  function deckPips(slims) {
    var pips = {};
    (slims || []).forEach(function (s) {
      if (!s || /\bland\b/i.test(String(s.frontType || "").split("//")[0])) return;
      (String(s.manaCost || "").match(/\{[^}]+\}/g) || []).forEach(function (sym) {
        var cs = sym.replace(/[{}]/g, "").split("/").filter(function (c) {
          return /^[WUBRG]$/.test(c);
        });
        cs.forEach(function (c) {
          pips[c] = (pips[c] || 0) + 1 / cs.length;
        });
      });
    });
    return pips;
  }

  /**
   * Cycle 15: the deck's land count and roughly how many it wants. Fitted to
   * the 57 benchmark decks: they run 36 lands on average (most within 2-3 of
   * that), a little more with a higher curve (34 + 0.6 x the average mana
   * value of the spells); the ramp count made no difference. Counts basics
   * from the export lines (with copies) and nonbasic lands from the profile;
   * cards already cut drop out. Returns {count, target}.
   */
  CS.landCount = function (profile, deckCards, cuts, slims) {
    var landNames = {};
    ((profile && profile.cards) || []).forEach(function (c) {
      if (c.land) landNames[CS.nameKey(c.name)] = true;
    });
    var cutBy = {};
    Object.keys(cuts || {}).forEach(function (n) {
      cutBy[CS.nameKey(n)] = (cutBy[CS.nameKey(n)] || 0) + cuts[n];
    });
    var count = 0;
    var seen = {};
    (deckCards || []).forEach(function (c) {
      var k = CS.nameKey(c.name);
      if (!CS.isBasicLand(c.name) && !landNames[k]) return;
      count += c.qty || 1;
      if (!seen[k]) {
        seen[k] = true;
        count -= Math.min(cutBy[k] || 0, c.qty || 1);
      }
    });
    var sum = 0;
    var n = 0;
    var cheapById = {};
    (slims || []).forEach(function (s) {
      if (!s || typeof s.cmc !== "number" || landNames[CS.nameKey(s.name)] || CS.isBasicLand(s.name)) return;
      sum += s.cmc;
      n++;
      if (s.cmc <= 2) cheapById[s.id] = true;
    });
    // cycle 26 (Nick: land cuts should weigh the deck's mana value, ramp and lands): Frank Karsten's 99-card
    // regression (ChannelFireball, 2022), lands = 31.42 + 3.13 x average mana value - 0.28 x cheap ramp and
    // card draw (mana value 2 or less). It was 34.2 + 0.6 x average, which ignored ramp. Casual guides run more
    // (Playgroup: 38-42, ramp on top), so it's kept between 31 and 42.
    var cheap = ((profile && profile.cards) || []).filter(function (c) {
      return !c.land && !c.commander && cheapById[c.id] && (c.roles.ramp || c.roles.draw);
    }).length;
    var target = Math.round(31.42 + 3.13 * (n ? sum / n : 3) - 0.28 * cheap);
    return { count: count, target: Math.max(31, Math.min(42, target)), cheap: cheap, avg: n ? Math.round((sum / n) * 100) / 100 : null };
  };

  /**
   * Cycle 15: every card in the deck as a possible cut, with how much the
   * deck wants to keep it. One model for Cut ideas, the prompt after an Add
   * and the back-to-100 list:
   *   keep = 45% tie-in (Fit's synergy part) + 30% strength + 25% how often
   *   decks with this commander run it (EDHREC inclusion, full marks at 40%).
   * Without EDHREC numbers: 60% tie-in + 40% strength. Lands are judged on
   * what they do (enters tapped every time, colorless only, a utility that
   * ties in). Then the cut score adds a role the deck has too many of, a
   * 6+ drop that isn't part of the plan, and a Game Changer past 3 (bracket 4).
   * Never a candidate: the commander, protected combo pieces, cards already
   * cut, basic lands (they're handled from the export lines).
   * `syn`: CS.deckSynergy result; `slims`: the deck's slim cards;
   * opts: {protect: {nameKey: true}, cuts: {name: n}, edhrec: {nameKey: {inclusion}}, deckCards}.
   * Returns [{id, name, cut (higher = better cut), keep, tie, strength, inc,
   * reasons, roles, cmc, land, landInfo, locked (a role at or under its
   * typical count), staple}] in deck order.
   */
  CS.CUT_WEIGHTS = { tie: 0.5, str: 0.2, inc: 0.3, offPage: 0.15, noEdhTie: 0.65, noEdhStr: 0.35 };
  // cycle 19: a card in its first year has little play history yet (EDHREC pages, popularity)
  CS.NEW_CARD_DAYS = 365;
  function dayNum(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
  }
  function newestRelease(slims) {
    var best = null;
    (slims || []).forEach(function (s) {
      if (s && s.released && (!best || s.released > best)) best = s.released;
    });
    return best;
  }
  function isNewCard(slim, today) {
    var a = dayNum(slim && slim.released);
    var b = dayNum(today);
    return a != null && b != null && b - a <= CS.NEW_CARD_DAYS && b >= a;
  }
  CS.isNewCard = isNewCard;
  CS.cutCandidates = function (profile, syn, slims, opts) {
    var W = CS.CUT_WEIGHTS;
    var o = opts || {};
    var protect = o.protect || {};
    var edh = o.edhrec || null;
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
    var cmd = profile.commander || null;
    var cmdTypes = cmd ? namedTypes(cmd.text, profile.typeCount, true) : [];
    var protectPlan = !!(cmd && (cmd.gives.protect || cmd.wants.protect || cmd.wants.gear));
    var cmdCmc = cmd && byId[cmd.id] && typeof byId[cmd.id].cmc === "number" ? byId[cmd.id].cmc : 0;
    var gcCount = 0;
    profile.cards.forEach(function (c) {
      if (byId[c.id] && byId[c.id].gameChanger) gcCount++;
    });
    var colorCount = cmd && byId[cmd.id] ? (byId[cmd.id].colorIdentity || []).length : 0;
    // cycle 18: the game plan (engine pieces and finishers are the deck's job; a deck built for lots of mana isn't over on ramp)
    var game = (syn && syn.game) || null;
    // cycle 19 (Graduation Day in Elsha): EDHREC's numbers say how popular a card is, not how well it fits.
    // A card new to Magic has no EDHREC history yet, and a card that ties in at or above the deck's
    // average isn't marked down for being missing from the commander's page.
    var avgTie = syn && typeof syn.score === "number" ? syn.score : 50;
    var today = o.today || newestRelease(slims);
    var gameIds = (game && game.ids) || {};
    function tiesToCommander(c) {
      if (!cmd) return false;
      return Object.keys(c.gives).some(function (l) {
        return cmd.wants[l];
      }) || Object.keys(c.wants).some(function (l) {
        return cmd.gives[l];
      });
    }
    var out = [];
    var listed = {};
    profile.cards.forEach(function (c) {
      if (c.commander) return;
      var key = CS.nameKey(c.name);
      if (protect[key] || cutKeys[key] || listed[key]) return;
      listed[key] = true;
      var slim = byId[c.id] || { id: c.id, name: c.name };
      var fit = syn && syn.fits && typeof syn.fits[c.id] === "number" ? syn.fits[c.id] : null;
      if (fit == null) fit = CS.fitScore(slim, profile, c.id).score; // lands aren't in the deck score
      var str = CS.strength(slim, c).score;
      var inc = edh ? (edh[key] && typeof edh[key].inclusion === "number" ? edh[key].inclusion : 0) : null;
      var roles = Object.keys(c.roles);
      var cmc = typeof slim.cmc === "number" ? slim.cmc : null;
      var payload = CS.isCheatPayload(c, profile);
      var feeds = cmd && Object.keys(c.gives).some(function (l) {
        return cmd.wants[l];
      });
      var kin = cmdTypes.some(function (t) {
        return c.subtypes[t]; // a Dragon in a Dragon commander's deck is the plan
      });
      var inPlan = kin || planLabels.some(function (l) {
        return c.gives[l] || c.wants[l];
      });
      var reasons = [];
      // ---- how much the deck wants to keep it, 0-1
      var tie = fit / 100;
      if (feeds || kin || payload) tie = Math.min(1, tie + 0.15); // part of the commander's own engine
      // a role card does its job whatever the theme (taxonomy "staple damping"),
      // so a low tie-in counts for less
      if (roles.length) tie = Math.max(tie, 0.5);
      var planJob = gameIds[c.id] || null; // cycle 18: "engine" (ties in, so it's this deck's engine) or "win"; cycle 19: "voltron", "fuel"
      if (planJob === "win" || planJob === "voltron") tie = Math.max(tie, 0.4); // a finisher has a job, even when it ties in to little
      var isNew = !c.land && isNewCard(slim, today);
      var fuel = !c.land && CS.planJobFor(c, slim, profile) === "fuel"; // makes the commander's own ability go
      var li = null;
      var keepBase;
      // a spell that can be played as a land (Hagra Mauling // Hagra Broodpit): a flexible land
      var mdfc = c.land && /\/\//.test(slim.name || "") && !/\bland\b/i.test(String(slim.frontType || "").split("\u2014")[0]);
      if (c.land && !mdfc) {
        li = CS.landInfo(slim);
        var widely = CS.popularity(slim) >= 0.4; // Ancient Tomb, Gaea's Cradle
        var q = 0.6;
        var produced = Object.keys(li.colors).filter(function (x) {
          return x !== "C";
        }).length;
        if (li.tapped === "always") q -= li.utility ? 0.15 : 0.3;
        else if (li.tapped === "sometimes") q -= 0.05;
        if (!li.any && !produced && colorCount >= 2 && !li.utility && !widely) q -= 0.25;
        if (li.any || produced >= 2) q += 0.1;
        if (li.utility && fit >= 40) q += 0.15;
        keepBase = { q: Math.max(0, Math.min(1, q)) };
        if (li.tapped === "always") reasons.push(li.utility ? "Enters tapped every time (it does have another use)" : "Enters tapped every time");
        if (!li.any && !produced && colorCount >= 2 && !li.utility && !widely) reasons.push("Makes only colorless mana in a " + colorCount + "-color deck");
      } else if (mdfc) {
        keepBase = { q: 0.7 };
      }
      var keep;
      // EDHREC lists few lands, so its numbers can vouch for a land but not count against one
      if (c.land) {
        keep = 0.65 * keepBase.q + 0.35 * (str / 100);
        if (inc) keep = Math.max(keep, 0.5 * keepBase.q + 0.25 * (str / 100) + 0.25 * Math.min(1, inc / 0.4));
      }
      else if (inc != null && isNew)
        keep = W.tie * tie + W.str * (Math.max(str, 30) / 100) + W.inc * tie; // a new card: its own fit stands in for EDHREC, and its low popularity isn't held against it
      else if (inc != null)
        keep = W.tie * tie + W.str * (str / 100) + W.inc * (inc > 0 ? Math.min(1, inc / 0.4) : fit >= avgTie && fit >= 40 ? tie : W.offPage);
      else keep = W.noEdhTie * tie + W.noEdhStr * ((isNew ? Math.max(str, 30) : str) / 100);
      // ---- concrete reasons it could go
      var surplus = 0;
      var surplusRole = null;
      roles.forEach(function (r) {
        if (!KEEP_ROLES[r] && !(r === "protection" && !protectPlan)) return;
        if (cmd && r === "draw" && (cmd.wants.drawing || cmd.wants.oppdraw)) return; // Sheoldred, Nekusar
        if (cmd && r === "removal" && cmd.wants.oppsac) return; // Tergrid
        var t = roleInfo[r].target;
        if (r === "ramp" && cmdCmc >= 6) t += cmdCmc - 4; // Gishath, Sauron
        if (r === "ramp" && game && game.bigMana) return; // cycle 18: Kozilek, Kinnan, a lands deck: mana is the plan
        if (r === "ramp" && fuel) return; // cycle 19: Exploration and Farseek in Zimone feed landfall, not spare ramp
        // an engine that ties in (Lotus Cobra in a landfall deck) is the plan; cycle 23: any role, when it ties in
        // well and works with the commander (Grave Pact in Wilhelt); a weak or off-plan engine can still be spare (cut test)
        if (planJob === "engine" && (r === "ramp" || (tiesToCommander(c) && fit >= Math.min(avgTie, 60)))) return;
        var x = Math.min(1, Math.max(0, ((roleCount[r] || 0) - 1.25 * t) / t)); // a quarter over
        if (x > surplus) {
          surplus = x;
          surplusRole = r;
        }
      });
      // cycle 18 (Reprieve: draw and protection): protection keeps the engine alive, so a protection card
      // (or a tutor) is never "more X than the deck needs", whatever else it does
      if (roles.indexOf("protection") !== -1 || roles.indexOf("tutors") !== -1) {
        surplus = 0;
        surplusRole = null;
      }
      var offCurve = !c.land && cmc != null && cmc >= 6 && fit < 60 && !payload && !inPlan && !planJob ? 1 : 0;
      var gc = slim.gameChanger ? 1 : 0;
      var locked = roles.some(function (r) {
        return (KEEP_ROLES[r] || r === "protection" || r === "tutors") && (roleCount[r] || 0) <= roleInfo[r].target;
      });
      var staple = roles.length > 0 && str >= 70;
      var cut = 1 - keep + 0.25 * surplus * (1 - keep) + 0.15 * offCurve + (gc && gcCount > 3 ? 0.1 : 0);
      if (!c.land && fit < 40 && !roles.length && !payload && planJob === "win")
        reasons.push("A finisher, though it ties in to little else here (tie-in " + fit + " of 100)");
      else if (!c.land && fit < 40 && !roles.length && !payload && planJob === "voltron")
        reasons.push("Suits up your commander, though it ties in to little else here (tie-in " + fit + " of 100)");
      else if (!c.land && fit < 40 && !roles.length && !payload)
        reasons.push(
          // cycle 16 (Nick: explanations need context): plain words, the number second
          (tiesToCommander(c) ? "Works with your commander but little else here" : "Works with almost nothing else in this deck") +
            " (tie-in " + fit + " of 100)",
        );
      var note = null; // informational: shown, but not a reason on its own
      if (inc != null && inc < 0.1 && fit < 60 && (fit < avgTie || fit < 40) && !isNew && !c.land) {
        if (inc > 0) reasons.push("Only " + Math.round(inc * 100) + "% of this commander's EDHREC decks run it");
        else note = "Few decks with this commander run it (it isn't on the commander's EDHREC page)";
      }
      // cycle 19: not for a finisher or a piece that suits up the commander (its job is the plan, not the role)
      // (nor for an engine piece that ties in at or above the deck's average: Electro for Elsha)
      if (!c.land && roles.length && !payload && planJob !== "win" && planJob !== "voltron" && !(planJob === "engine" && fit >= Math.min(avgTie, 60))) {
        if (isNew && CS.strength(slim, c).quality < 45) reasons.push("There are cheaper or better cards for its job (it's new, so few decks run it yet)");
        else if (!isNew && str < 30) reasons.push("There are stronger cards for its job (strength " + str + " of 100)");
      }
      if (surplusRole && surplus > 0)
        reasons.push(
          "More " + roleInfo[surplusRole].label.toLowerCase() + " than the deck needs: " + roleCount[surplusRole] +
            " cards, most decks run about " + roleInfo[surplusRole].target,
        );
      if (offCurve) reasons.push("Costs " + cmc + " and isn't part of the deck's plan");
      if (gc)
        reasons.push(
          gcCount > 3
            ? "Game Changer: the deck has " + gcCount + " (over 3 means bracket 4)"
            : "Game Changer: the deck has " + gcCount + " (any means bracket 3 or higher)",
        );
      if (note) reasons.push(note);
      out.push({
        id: c.id,
        name: c.name,
        cut: Math.round(cut * 1000) / 1000,
        keep: Math.round(keep * 1000) / 1000,
        tie: fit,
        strength: str,
        inc: inc,
        fit: fit,
        reasons: reasons,
        roles: roles,
        cmc: cmc,
        land: !!c.land,
        landInfo: li,
        locked: locked,
        staple: staple,
        engine: !!(feeds || kin || payload), // feeds the commander, is its creature type, or a payload
        planJob: planJob,
        subtypes: c.subtypes,
        gives: c.gives,
        wants: c.wants,
      });
    });
    return out;
  };

  /**
   * Cut ideas for the deck as a whole, best idea first (cycle 15: from
   * CS.cutCandidates). Left out: lands while the deck has no more than it
   * wants, role keepers (ramp, draw, removal, wipes at or under the typical
   * count), strong role cards (strength 70+), tie-in 75+, and cards the deck
   * clearly wants (keep 0.7+).
   * A card needs a concrete reason, or a cut score of 0.55 or more.
   * Returns [{id, name, score (0-100), fit, reasons, roles, cmc, ...}].
   */
  CS.cutSuggestions = function (profile, syn, slims, opts) {
    var o = opts || {};
    var cands = CS.cutCandidates(profile, syn, slims, o);
    var lands = o.deckCards ? CS.landCount(profile, o.deckCards, o.cuts, slims) : null;
    var spareLands = lands ? lands.count - lands.target : 0;
    var out = cands.filter(function (x) {
      if (x.land && spareLands < 1) return false;
      if (x.locked || x.staple || x.keep >= 0.7 || x.tie >= 75) return false; // strong tie-ins stay (as before cycle 15)
      var concrete = x.reasons.some(function (r) {
        return !/^Game Changer: the deck has \d+ \(any|^Few decks with this commander run it/.test(r);
      });
      if (concrete) return true;
      // no concrete reason: only a plain card (no role, not the commander's
      // engine) that ties in less than the deck's average
      if (x.roles.length || x.engine || x.land) return false;
      if ((x.planJob === "win" || x.planJob === "voltron") && x.tie >= 50) return false; // cycle 18: a finisher that ties in (Assault Formation for walls)
      // cycle 19 (Graduation Day): a card at or above the deck's average tie-in stays, however few decks run it
      if (syn && typeof syn.score === "number" && x.tie >= syn.score) return false;
      return x.cut >= 0.55;
    });
    out.forEach(function (x) {
      x.score = Math.round(Math.min(1, x.cut) * 100);
      // cycle 19: a note (few decks run it, a Game Changer under 4) is never the reason on its own
      var hasConcrete = x.reasons.some(function (r) {
        return !/^Game Changer: the deck has \d+ \(any|^Few decks with this commander run it/.test(r);
      });
      // cycle 26 (Nick: Mirri's Guile and Roil Elemental called weak in Zimone): for a card with no role, strength
      // is only how widely it's played, so say that instead of calling it weak
      if (!hasConcrete)
        x.reasons.unshift(
          x.roles.length || x.land
            ? "Tie-in " + x.tie + " and strength " + x.strength + ": lower than most of the deck"
            : "Ties in less than most of the deck (tie-in " + x.tie + "), and few decks play it",
        );
    });
    out.sort(function (a, b) {
      return b.cut - a.cut || a.fit - b.fit || (a.name < b.name ? -1 : 1);
    });
    return out;
  };

  /**
   * Cycle 14: enough cut ideas to bring the deck back to 100. When
   * CS.cutSuggestions has fewer than `need`, adds the cards with the lowest
   * Fit left (non-role cards first, then role cards). Never the commander,
   * a land, a protected combo piece or a card already cut.
   * `ideas`: CS.cutSuggestions result; `opts` as for CS.cutSuggestions.
   * Returns ideas plus fillers [{id, name, score: 0, fit, reasons, roles, cmc, filler: true}].
   */
  CS.fillCuts = function (ideas, profile, syn, slims, opts, need) {
    var out = (ideas || []).slice();
    if (!need || out.length >= need) return out;
    var o = opts || {};
    var protect = o.protect || {};
    var skip = {};
    out.forEach(function (x) {
      skip[CS.nameKey(x.name)] = true;
    });
    Object.keys(o.cuts || {}).forEach(function (n) {
      skip[CS.nameKey(n)] = true;
    });
    var cmcById = {};
    (slims || []).forEach(function (s) {
      if (s) cmcById[s.id] = typeof s.cmc === "number" ? s.cmc : null;
    });
    var rest = [];
    profile.cards.forEach(function (c) {
      if (c.commander || c.land) return;
      var key = CS.nameKey(c.name);
      if (protect[key] || skip[key]) return;
      skip[key] = true;
      var fit = syn && syn.fits && typeof syn.fits[c.id] === "number" ? syn.fits[c.id] : null;
      rest.push({ c: c, fit: fit, roles: Object.keys(c.roles) });
    });
    rest.sort(function (a, b) {
      var ra = a.roles.length ? 1 : 0;
      var rb = b.roles.length ? 1 : 0;
      var fa = a.fit == null ? 101 : a.fit;
      var fb = b.fit == null ? 101 : b.fit;
      return ra - rb || fa - fb || (a.c.name < b.c.name ? -1 : 1);
    });
    for (var i = 0; i < rest.length && out.length < need; i++) {
      var r = rest[i];
      out.push({
        id: r.c.id,
        name: r.c.name,
        score: 0,
        fit: r.fit,
        reasons: [
          "One of the weakest cards left in the deck" + // cycle 21: no Fit number in the reason
            (r.roles.length ? " (it fills a role, so check it)" : ""),
        ],
        roles: r.roles,
        cmc: cmcById[r.c.id] != null ? cmcById[r.c.id] : null,
        filler: true,
      });
    }
    return out;
  };

  /**
   * What to cut for a card just added (cycle 15: one model for every kind of
   * card). Each candidate starts from its cut score (CS.cutCandidates), then:
   * - like for like: a land pairs with a land and a nonland with a nonland,
   *   unless the land count says otherwise (a land added to a deck short on
   *   lands takes a spell's place; ramp added to a deck with lands to spare
   *   can take a land's place);
   * - a card doing the same job (removal for removal) pairs best, more so
   *   when the new one is cheaper or stronger; a shared theme and a similar
   *   mana value help a little;
   * - a role keeper or a strong role card is only offered for a card that
   *   does its job.
   * Basic lands come from the export lines: the one the deck has the most
   * of compared with what its spells' colors need, and one of a color the
   * new land makes when that's close.
   * `added`: slim card; `cands`: CS.cutCandidates result (cut ideas from
   * CS.cutSuggestions also work); `deckCards`: parsed export lines; `cuts`:
   * current cuts; `opts.slims`: the deck's slim cards (for colors and the land target).
   * Returns up to 3 [{name, id (null for a basic), why}].
   */
  CS.swapSuggestions = function (added, cands, profile, deckCards, cuts, opts) {
    if (!added) return [];
    var o = opts || {};
    var me = CS.cardTraits(added);
    var myRoles = Object.keys(me.roles); // cycle 19: main roles only (Kozilek's cast-trigger draw is a side job)
    CS.applyCastSide(me, profile.cards);
    myRoles = Object.keys(me.roles);
    var myJob = CS.planJobFor(me, added, profile);
    var jobWords = { win: "a finisher", voltron: "suits up your commander", fuel: "feeds your commander" };
    var myLabels = Object.keys(me.gives).concat(Object.keys(me.wants));
    var myStr = CS.strength(added, me).score;
    var myTie = CS.fitScore(added, profile).score; // cycle 19
    var cmc = typeof added.cmc === "number" ? added.cmc : null;
    var roleLabel = {};
    CS.SYN_ROLES.forEach(function (r) {
      roleLabel[r.key] = r.label.toLowerCase();
    });
    var lands = CS.landCount(profile, deckCards, cuts, o.slims);
    var short = lands.count < lands.target - 4; // before this pick; good decks run 2-3 either side of the target
    var spare = lands.count - lands.target;
    var meLand = !!me.land;
    var myColors = meLand ? CS.landInfo(added) : null;
    var list = [];
    // basics, from the export lines
    var cutLeft = cuts || {};
    var basics = {};
    (deckCards || []).forEach(function (c) {
      if (!CS.isBasicLand(c.name)) return;
      var cutN = 0;
      Object.keys(cutLeft).forEach(function (n) {
        if (CS.nameKey(n) === CS.nameKey(c.name)) cutN += cutLeft[n];
      });
      var b = basics[c.name] || (basics[c.name] = { name: c.name, have: 0, cut: cutN });
      b.have += c.qty || 1;
    });
    var pips = deckPips(o.slims);
    var pipTotal = 0;
    Object.keys(pips).forEach(function (c) {
      pipTotal += pips[c];
    });
    var basicTotal = 0;
    Object.keys(basics).forEach(function (n) {
      basicTotal += Math.max(0, basics[n].have - basics[n].cut);
    });
    Object.keys(basics).forEach(function (n) {
      var b = basics[n];
      var left = b.have - b.cut;
      if (left <= 0) return;
      var col = basicColor(n);
      var share = basicTotal ? left / basicTotal : 0;
      var need = pipTotal && col && pips[col] ? pips[col] / pipTotal : col === "C" ? 0 : 0.1;
      var over = share - need; // more of this basic than its color's share of the spells
      var makes = myColors && col && (myColors.any || myColors.colors[col]);
      var cut = 0.45 + 0.6 * over + (makes ? 0.08 : 0) + (left === 1 ? -0.1 : 0);
      var why = over > 0.05 && left >= 2
        ? "a basic " + CS.frontName(n).replace(/^Snow-Covered /, "") + ": you have " + left + ", more than its color's share of your spells"
        : makes
          ? "a basic of a color " + added.name + " also makes"
          : "a basic land, for a land";
      list.push({ name: b.name, id: null, land: true, basic: true, cut: cut, why: why, roles: [], reasons: [] });
    });
    (cands || []).forEach(function (y) {
      var isLand = typeof y.land === "boolean" ? y.land : false;
      list.push({
        name: y.name,
        id: y.id,
        land: isLand,
        basic: false,
        cut: typeof y.cut === "number" ? y.cut : (y.score || 0) / 100,
        y: y,
        roles: y.roles || [],
        reasons: y.reasons || [],
      });
    });
    var out = [];
    list.forEach(function (x) {
      var y = x.y || {};
      var pair = x.cut;
      var why = x.why || null;
      var sameRole = myRoles.filter(function (r) {
        return x.roles.indexOf(r) !== -1;
      })[0];
      if (meLand) {
        // cycle 31: when short of lands, a spell makes room first (a land for a basic leaves the deck short);
        // before, a spare basic could outrank every spell, and only a very weak spell (Reconnaissance read
        // as tie-in 0) put a spell first
        if (x.land) pair += short ? -0.3 : 0.5;
        else if (short) pair += 0.2; // the deck needed this land; a spell makes room
        else return; // like for like: a land for a land
        if (x.land && !x.basic && !why)
          why = (y.reasons && y.reasons[0] ? y.reasons[0].charAt(0).toLowerCase() + y.reasons[0].slice(1) : "one of your weaker lands for this deck");
      } else {
        if (x.land) {
          if (spare >= 2 && me.roles.ramp) {
            why = why || "a land: with " + lands.count + " lands and more ramp coming, the deck can spare one";
          } else if (spare >= 3) {
            why = why || "a land: " + lands.count + " lands, about " + lands.target + " fits this curve and ramp";
            pair -= 0.2;
          } else return; // like for like: don't cut a land for a spell
        }
        if (!x.land) {
          if ((y.locked || y.staple) && !sameRole) return; // a role the deck needs, and the new card doesn't do it
          // cycle 19 (They Came from the Pipes offered Kozilek as "the same job (card draw)"): a finisher or a
          // piece that suits up the commander goes only for a card that does the same job in the plan
          var samePlan = !!(myJob && myJob !== "fuel" && y.planJob === myJob);
          if ((y.planJob === "win" || y.planJob === "voltron") && !samePlan) return;
          if (samePlan && !sameRole) {
            pair += 0.15;
            why = "does the same job in your game plan (" + jobWords[myJob] + ")" + (myStr >= (y.strength || 0) + 10 ? ", and " + added.name + " is stronger" : "");
          }
          var cheaper = cmc != null && y.cmc != null && cmc < y.cmc;
          var stronger = myStr >= (y.strength || 0) + 10;
          var fitsBetter = myTie >= (typeof y.tie === "number" ? y.tie : 0) + 10;
          var notWeaker = myStr >= (y.strength || 0) - 15;
          // cycle 19 (They Came from the Pipes offered Aesi and Rhystic Study as the same job): like for like
          // still holds (cycle 15), but a strong staple or a piece of the game plan goes only for a pick that
          // does the job better: stronger, or a better fit (or cheaper, for a staple) and not much weaker
          var keeper = !!(y.staple || y.planJob);
          // (an engine piece or the commander's fuel goes only for a stronger card: Aesi feeds Zimone and draws)
          var better = stronger || (!y.planJob && notWeaker && (fitsBetter || cheaper));
          if (sameRole && keeper && !better) return; // keep the staple; the new card doesn't do its job better
          if (sameRole && (!keeper || better)) {
            pair += 0.2;
            if (cheaper || stronger) pair += 0.15;
            why = "does the same job (" + roleLabel[sameRole] + ")" +
              (keeper && stronger ? ", and " + added.name + " is stronger" : keeper && fitsBetter && !cheaper ? ", and " + added.name + " fits this deck better" :
                cheaper ? ", and " + added.name + " costs less" : stronger ? ", and " + added.name + " is stronger" : ", and works less well with this deck");
          }
          var sameTheme = myLabels.some(function (l) {
            return (y.gives && y.gives[l]) || (y.wants && y.wants[l]);
          });
          if (sameTheme) pair += 0.15;
          if (cmc != null && y.cmc != null) pair += 0.05 * (1 - Math.min(Math.abs(cmc - y.cmc), 4) / 4);
        }
      }
      // cycle 19: a note (few decks run it, a Game Changer count) is never the swap's reason on its own
      var firm = x.reasons.filter(function (r) {
        return !/^Game Changer: the deck has \d+ \(any|^Few decks with this commander run it/.test(r);
      })[0];
      if (!why) why = firm ? (/^Game Changer/.test(firm) ? firm : firm.charAt(0).toLowerCase() + firm.slice(1)) :
        typeof y.tie === "number" ? "one of the weaker cards in the deck (tie-in " + y.tie + " of 100)" : "one of the weaker cards in the deck";
      out.push({ name: x.name, id: x.id, why: why, pair: pair });
    });
    out.sort(function (a, b) {
      return b.pair - a.pair || (a.name < b.name ? -1 : 1);
    });
    return out.slice(0, 5).map(function (x) { // cycle 16: 5, so the prompt has other options
      return { name: x.name, id: x.id, why: x.why };
    });
  };

  /**
   * Cycle 15: the back-to-100 list. Each pick still waiting for a cut gets
   * its own best swap (lands for lands, the same job for the same job),
   * newest pick first, each cut used once; then, if the deck is over 100
   * for other reasons, the best cut ideas fill the rest.
   * `picks`: slim cards; `need`: how many cuts get the deck to 100.
   * Returns [{name, id, why, forName, forId}].
   */
  CS.cutsForPicks = function (picks, cands, profile, deckCards, cuts, need, opts) {
    var o = opts || {};
    var taken = {};
    Object.keys(cuts || {}).forEach(function (n) {
      taken[n] = cuts[n];
    });
    var out = [];
    var used = {};
    var list = (picks || []).slice().reverse();
    for (var i = 0; i < list.length && out.length < need; i++) {
      var left = (cands || []).filter(function (y) {
        return !used[CS.nameKey(y.name)];
      });
      var s = CS.swapSuggestions(list[i], left, profile, deckCards, taken, o)[0];
      if (!s) continue;
      out.push({ name: s.name, id: s.id, why: s.why, forName: list[i].name, forId: list[i].id });
      if (s.id) used[CS.nameKey(s.name)] = true;
      taken[s.name] = (taken[s.name] || 0) + 1; // a basic: one fewer left
    }
    if (out.length < need) {
      var ideas = (o.ideas || []).filter(function (y) {
        return !used[CS.nameKey(y.name)];
      });
      for (var j = 0; j < ideas.length && out.length < need; j++) {
        var y = ideas[j];
        used[CS.nameKey(y.name)] = true;
        out.push({ name: y.name, id: y.id, why: y.reasons[0] || "", forName: null, forId: null });
      }
    }
    return out;
  };

  /**
   * Cycle 16 (Nick: "give more options than just what's over 100"): other
   * cuts to choose from instead of the ones already listed (`chosen`, by
   * name). Each pick's next like-for-like options first, then cut ideas,
   * then the deck's other easiest cuts. Returns up to n {name, id, why, forName, forId}.
   */
  CS.cutAlternates = function (picks, cands, profile, deckCards, cuts, chosen, n, opts) {
    var o = opts || {};
    var used = {};
    (chosen || []).forEach(function (nm) {
      used[CS.nameKey(nm)] = true;
    });
    var out = [];
    var add = function (x, forName, forId) {
      if (out.length >= n || !x || !x.name || used[CS.nameKey(x.name)]) return;
      used[CS.nameKey(x.name)] = true;
      out.push({ name: x.name, id: x.id, why: x.why || (x.reasons && x.reasons[0]) || "", forName: forName || null, forId: forId || null });
    };
    (picks || []).slice().reverse().forEach(function (p) {
      CS.swapSuggestions(p, cands, profile, deckCards, cuts, o)
        .slice(0, 3)
        .forEach(function (x) {
          add(x, p.name, p.id);
        });
    });
    (o.ideas || []).forEach(function (x) {
      add(x);
    });
    // cycle 26 (Nick: Imp's Mischief offered as "one of the weaker ties to its plan", though its job is
    // protection; Craterhoof and Green Sun's Zenith got the same line): the deck's other easy cuts, each with a
    // reason that's true of it. A card with a concrete reason uses it. Otherwise only a plain card (no role,
    // no finisher's job) that ties in below the deck's average. A role card is judged by its role, so it's
    // offered only when the cut ideas give it a reason (more of that role than the deck needs).
    var avg = o.avgTie != null ? o.avgTie : null;
    (cands || [])
      .filter(function (c) {
        if (c.locked || c.engine || c.land) return false;
        if (c.reasons && c.reasons.length) return true;
        if ((c.roles || []).length || c.planJob === "win" || c.planJob === "voltron") return false;
        return avg == null || c.tie < avg;
      })
      .sort(function (a, b) {
        return b.cut - a.cut;
      })
      .forEach(function (c) {
        add({ name: c.name, id: c.id, why: c.reasons[0] || "Ties in less than most of the deck (tie-in " + c.tie + ")" });
      });
    return out;
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
   * Whether a card passes the filters. An empty type list means every type.
   * Cycle 29: price never filters. `maxPrice` stays in the settings format
   * (read as before, written as null by the page), so `v` is unchanged.
   */
  CS.passesFilters = function (slim, settings) {
    var s = settings || CS.defaultSettings();
    if (!slim) return false;
    if (s.hideGameChangers && slim.gameChanger) return false;
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

  /**
   * Sort orders for the open pile (cycle 17). "rec" keeps the pile's own
   * order. Each other order says which way is best first; a card without the
   * number (not on EDHREC, details not loaded) goes last. Cycle 29: no
   * Cheapest order (price never counts; Nick proxies).
   */
  CS.SORTS = [
    { key: "rec", label: "Recommended", say: "the recommended order" },
    { key: "fit", label: "Fits your deck", dir: -1, say: "best fit with your deck first" }, // cycle 21: plain words; the page sorts by tie-in, then Fit
    { key: "played", label: "Most played", dir: -1, say: "most played on EDHREC first" },
    { key: "synergy", label: "EDHREC synergy", dir: -1, say: "highest EDHREC synergy first" },
    { key: "cmc", label: "Mana value", dir: 1, say: "lowest mana value first" },
  ];

  /**
   * The number a sort uses for one card, or null when the card has none.
   * `rec` is the pile entry (EDHREC numbers when onEdhrec), `info` the slim
   * card, `fit` the card's Fit score.
   */
  CS.sortValue = function (key, rec, info, fit) {
    var num = function (x) {
      return typeof x === "number" && isFinite(x) ? x : null;
    };
    var edh = rec && rec.onEdhrec ? rec : null;
    if (key === "fit") return num(fit);
    if (key === "played") return edh ? num(edh.inclusion) : null;
    if (key === "synergy") return edh ? num(edh.synergy) : null;
    if (key === "cmc") return info ? num(info.cmc) : null;
    return null;
  };

  /**
   * A pile's cards in another order, as a new array (the pile is untouched,
   * so swipes and counts don't change). `lookup(card)` returns
   * { rec, info, fit } for the card. Ties and cards without the number keep
   * the pile's own order.
   */
  CS.sortCards = function (cards, key, lookup) {
    var list = (cards || []).slice();
    var spec = CS.SORTS.filter(function (x) {
      return x.key === key;
    })[0];
    if (!spec || !spec.dir) return list;
    var rows = list.map(function (c, i) {
      var l = (lookup && lookup(c)) || {};
      return { c: c, i: i, v: CS.sortValue(key, l.rec || c, l.info, l.fit) };
    });
    rows.sort(function (a, b) {
      if (a.v == null || b.v == null) {
        if (a.v == null && b.v == null) return a.i - b.i;
        return a.v == null ? 1 : -1;
      }
      return (a.v - b.v) * spec.dir || a.i - b.i;
    });
    return rows.map(function (r) {
      return r.c;
    });
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

  // ---------------------------------------------------------- start over (cycle 30)

  /**
   * What Start over would clear for the deck on screen (Nick's picks 3A and
   * 6A): this deck's save (v2, and its v1 save if it has one) plus every
   * other save for the same commander that would carry into this list
   * (the carry-over rule: 60%+ of cards shared, not empty). Another deck
   * with the same commander shares less than that and is left alone.
   * `keys`: CS.deckKeys of the deck on screen; `state`: its swipes now.
   * Returns {deckId, keys: [storage keys], counts: {add, maybe, skip, cuts}}.
   */
  CS.startOverPlan = function (store, slug, deckId, keys, state) {
    var out = [];
    var own = [CS.deckKey(deckId), CS.oldDeckKey(deckId)];
    own.forEach(function (k) {
      if (store.get(k, null) != null) out.push(k);
    });
    var newSet = {};
    (keys || []).forEach(function (k) {
      newSet[k] = true;
    });
    var prefix = CS.deckKey(slug + "-");
    CS.savedDecksFor(store, slug).forEach(function (e) {
      if (out.indexOf(e.key) !== -1) return;
      if (!/^[0-9a-f]{8}$/.test(e.key.slice(prefix.length))) return; // another commander's slug
      var s = e.state;
      if (!s.cards) return; // v1: never carried
      if (!Object.keys(s.decisions).length && !Object.keys(s.cuts || {}).length)
        return;
      var shared = s.cards.filter(function (k) {
        return newSet[k];
      }).length;
      var size = Math.max(s.cards.length, (keys || []).length);
      if (size && shared / size >= CARRY_MIN) out.push(e.key);
    });
    var counts = { add: 0, maybe: 0, skip: 0, cuts: 0 };
    var d = (state && state.decisions) || {};
    Object.keys(d).forEach(function (id) {
      if (counts[d[id]] != null) counts[d[id]]++;
    });
    var cuts = (state && state.cuts) || {};
    Object.keys(cuts).forEach(function (n) {
      counts.cuts += cuts[n] || 0;
    });
    return { deckId: String(deckId), keys: out, counts: counts };
  };

  /**
   * Clears the saves in `plan` and returns the copy needed to undo it:
   * {v: 1, deckId, at, saves: {key: saved value}, failed: [keys not removed]}.
   * Nothing is lost until that copy is dropped (the page keeps it for the
   * tab's life). `older`: an undo copy from an earlier Start over on the
   * same deck that wasn't undone; its values win, so one Undo goes all the
   * way back (review Should 1).
   */
  CS.startOver = function (store, plan, deckId, now, older) {
    var prev = CS.checkStartOverBackup(older, deckId);
    var backup = {
      v: 1,
      deckId: String(deckId),
      at: prev ? prev.at : now || 0,
      saves: {},
      failed: [],
    };
    plan.keys.forEach(function (k) {
      var v = store.get(k, null);
      if (v != null) backup.saves[k] = v;
    });
    Object.keys(backup.saves).forEach(function (k) {
      if (!store.remove(k)) backup.failed.push(k);
    });
    if (prev) {
      Object.keys(prev.saves).forEach(function (k) {
        backup.saves[k] = prev.saves[k];
      });
      if (prev.state) backup.state = prev.state;
    }
    return backup;
  };

  /** Checks an undo copy from tab storage; null if it can't be used. */
  CS.checkStartOverBackup = function (b, deckId) {
    if (!b || typeof b !== "object" || b.v !== 1) return null;
    if (deckId != null && b.deckId !== String(deckId)) return null;
    if (!b.saves || typeof b.saves !== "object" || Array.isArray(b.saves))
      return null;
    var ok = Object.keys(b.saves).every(function (k) {
      return /^deck2?:/.test(k);
    });
    return ok ? b : null;
  };

  /**
   * Puts the cleared saves back. Swipes made since the start over on this
   * deck are replaced by the old ones. Returns true if every save went back.
   */
  CS.undoStartOver = function (store, backup) {
    var b = CS.checkStartOverBackup(backup, null);
    if (!b) return false;
    var all = true;
    Object.keys(b.saves).forEach(function (k) {
      if (!store.set(k, b.saves[k])) all = false;
    });
    return all;
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
