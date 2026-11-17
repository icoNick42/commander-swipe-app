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

  /**
   * Reads a Moxfield Export.
   * Returns {cards: [{qty, name, set, number, lineNo}], unread: [{lineNo, text}]}.
   * Blank lines, // comments and section headers ("SIDEBOARD:") are skipped
   * quietly; any other line that isn't a card goes in `unread`.
   */
  CS.parseExport = function (text) {
    var cards = [];
    var unread = [];
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
          });
          return;
        }
        var bare = line.replace(/:$/, "").trim();
        if (/:$/.test(line) || SECTION_WORDS.test(bare)) return; // section header
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
   * "tutors"). Tags checked on Scryfall 2026-11-17.
   */
  CS.ROLES = [
    { key: "removal", label: "Removal", tag: "removal" },
    { key: "ramp", label: "Ramp", tag: "ramp" },
    { key: "draw", label: "Card draw", tag: "draw" },
    { key: "protection", label: "Protection", tag: "protection" },
    { key: "wipes", label: "Board wipes", tag: "board-wipe" },
    { key: "tutors", label: "Tutors", tag: "tutor", extra: "-t:land" },
    { key: "recursion", label: "Recursion", tag: "recursion" },
    { key: "sac", label: "Sacrifice outlets", tag: "sacrifice-outlet" },
    { key: "tokens", label: "Token makers", tag: "repeatable-token-generator" },
    { key: "haste", label: "Haste", tag: "gives-haste" },
    { key: "anthems", label: "Anthems", tag: "anthem" },
    { key: "combats", label: "Extra combats", tag: "extra-combat" },
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

  // [label, regex] pairs. Order doesn't matter.
  var GIVES = [
    // creature bodies: tokens and anything that makes extra creatures
    ["bodies", /\bcreate\b[^.]*\bcreature tokens?\b/],
    ["bodies", /\b(myriad|mobilize|squad|populate|amass|incubate|afterlife|fabricate|embalm|eternalize|encore)\b/],
    ["bodies", /\bcreate\b[^.]*\btokens? that'?s? (are |is )?(a )?cop(y|ies)\b/],
    // fodder: bodies, plus creatures that are worth sacrificing
    ["fodder", /\bcreate\b[^.]*\bcreature tokens?\b/],
    ["fodder", /\b(myriad|mobilize|squad|populate|amass|afterlife|fabricate|persist|undying|escape)\b/],
    ["fodder", /\bwhen ~ dies\b/],
    // deaths: sacrifice outlets and wipes
    ["deaths", /\bsacrifice (a|an|another|one or more|x|two|three)( other)? (nontoken )?(creatures?|artifact or creature|creature or artifact|permanents?|nonland permanents?)\b/],
    ["deaths", /\b(destroy|exile) all (other )?(creatures|nonland permanents)\b/],
    ["deaths", /\bsacrifice (it|them) at (the beginning of the next end step|end of combat)\b|\bdecayed\b/],
    ["deaths", /\beach creature gets -|\ball creatures get -|\bdamage to each creature\b/],
    // attacks: attack triggers and things that make attacking better
    ["attacks", /\bwhenever (~|you|one or more (other )?creatures( you control)?|a creature you control|another creature you control|equipped creature|enchanted creature|a (\w+ )?token you control) attacks?\b/],
    ["attacks", /\bwhenever you attack\b|\b(myriad|mobilize|battle cry|exalted|melee|dethrone)\b/],
    ["attacks", /\b(have|has|gains?|gets?)\b[^.]*\bhaste\b/],
    ["attacks", /\badditional combat phase\b/],
    ["attacks", /\bcreatures you control (have|gain) [^.]*(menace|trample|flying|double strike|can't be blocked)/],
    ["attacks", /\bcreatures? can't block\b/],
    // treasure and other artifact tokens
    ["treasure", /\bcreates? [^.]*\btreasure\b/],
    ["artifacts", /\bcreate\b[^.]*\b(treasure|clue|food|blood|map|powerstone|gold|incubator)\b|\bartifact creature tokens?\b|\bartifact token\b/],
    // +1/+1 counters
    ["counters", /\bput[^.]*\+1\/\+1 counters? on\b|\benters with[^.]*\+1\/\+1 counters?\b|\bproliferate\b/],
    // life gain
    ["lifegain", /\byou gain (\d+|x|that much|life)\b|\bgain (\d+|x|that much) life\b|\blifelink\b/],
    // graveyard fillers
    ["graveyard", /\bmill\b|\bsurveil\b|\bdiscard (a|two|three|x|your hand|that many)\b/],
    // blink
    ["blink", /\bexile\b[^.]*\breturn (it|them|that card|those cards) to the battlefield\b/],
    // landfall enablers
    ["landfall", /\bsearch your library for [^.]*\bland\b[^.]*(onto|put)[^.]*battlefield\b|\bput [^.]*\blands? cards? [^.]*onto the battlefield\b|\bplay an additional land\b/],
  ];

  var WANTS = [
    // go-wide and token payoffs
    ["bodies", /\bcreature tokens? you control\b|\bwhenever you create (one or more )?(creature )?tokens?\b/],
    ["bodies", /\bfor each (other )?creature you control\b|\bnumber of (other )?creatures you control\b|\bcreatures you control get \+\d/],
    ["bodies", /\bwhenever (a|an|one or more|another)( other)?( nontoken)? creatures?( you control)?( with power \d or less)? enters?\b/],
    ["bodies", /\bconvoke\b/],
    // sacrifice outlets want fodder
    ["fodder", /\bsacrifice (a|an|another|one or more|x|two|three)( other)? (nontoken )?(creatures?|artifact or creature|creature or artifact)\b/],
    // death payoffs
    ["deaths", /\bwhenever (a|an|another|one or more)( other)?( nontoken)? creatures?( you control)?( or planeswalkers?)? (dies|die)\b/],
    ["deaths", /\bwhenever ~ or another creature dies\b|\ba creature dying\b|\bcreatures? (that )?(died|have died) this turn\b|\bwhenever equipped creature dies\b|\bput into a graveyard from the battlefield\b/],
    ["deaths", /\bcreature cards? [^.]*from your graveyard\b|\bfrom your graveyard to the battlefield\b/],
    ["deaths", /\bwhenever a creature token you control leaves\b/],
    // attack payoffs
    ["attacks", /\bwhenever (~|you|one or more (other )?creatures( you control)?|a creature you control|another creature you control|equipped creature|enchanted creature|a (\w+ )?token you control) attacks?\b/],
    ["attacks", /\bwhenever you attack\b|\b(myriad|mobilize|battle cry|exalted|melee|dethrone)\b|\battacking creatures?\b|\bdeals? combat damage to (a player|an opponent)\b|\bif it was attacking\b|\b(equipped|enchanted) creature is attacking\b/],
    // treasure and artifact payoffs
    ["treasure", /\bsacrifice (a|an|x|one or more|two) (treasures?|artifacts?)\b|\bsacrifice an artifact\b|\bwhenever you sacrifice\b/],
    ["artifacts", /\bartifacts? you control\b|\bwhenever (an|one or more) artifacts? (you control )?enters?\b|\bfor each artifact\b|\baffinity for artifacts\b|\bimprovise\b|\bmetalcraft\b/],
    // counters payoffs
    ["counters", /\bwith (a|one or more) \+1\/\+1 counters?\b|\bwhenever one or more \+1\/\+1 counters\b|\bproliferate\b|\bfor each \+1\/\+1 counter\b|\bnumber of \+1\/\+1 counters\b/],
    // life gain payoffs
    ["lifegain", /\bwhenever you gain life\b|\bif you gained life\b|\bgained life this turn\b|\bamount of life you gained\b/],
    // graveyard payoffs
    ["graveyard", /\bfrom your graveyard\b|\b(escape|flashback|unearth|aftermath|embalm|eternalize|disturb|delve|jump-start|retrace)\b/],
    // blink payoffs: the card's own enter trigger
    ["blink", /\bwhen ~ enters\b/],
    // landfall payoffs
    ["landfall", /\bwhenever a land (you control )?enters\b|\blandfall\b/],
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
    artifacts: { g: "Makes artifacts", w: "Pays off artifacts", b: "Makes and pays off artifacts", short: "artifacts" },
    counters: { g: "Adds +1/+1 counters", w: "Uses +1/+1 counters", b: "Adds and uses +1/+1 counters", short: "+1/+1 counters" },
    lifegain: { g: "Gains life", w: "Pays off life gain", b: "Gains life and pays it off", short: "life gain" },
    graveyard: { g: "Fills your graveyard", w: "Uses your graveyard", b: "Fills and uses your graveyard", short: "graveyard" },
    blink: { g: "Blinks creatures", w: "Has an enter trigger", b: "Blinks and has an enter trigger", short: "blink" },
    landfall: { g: "Puts extra lands out", w: "Pays off lands entering", b: "Ramps lands and pays it off", short: "landfall" },
    gear: { g: "Equipment or Aura", w: "Pays off Equipment and Auras", b: "Equipment payoff", short: "Equipment" },
    spells: { g: "Instant or sorcery", w: "Pays off instants and sorceries", b: "Spell payoff", short: "spells" },
  };

  /** "Makes creature tokens; 15 of your cards use them" and the like. */
  CS.reasonFor = function (label, link) {
    var lab = CS.SYN_LABELS[label];
    var n = link.n;
    var cards = n === 1 ? "1 of your cards" : n + " of your cards";
    if (label === "attacks") return "Rewards attacking, like " + cards;
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
    { key: "ramp", label: "Ramp", target: 10, re: /\{t\}[^:]*: add \{|\badd (one|two|three) mana\b|\badd \{[wubrgc]\}|\bsearch your library for [^.]*\blands? cards?\b[^.]*battlefield|\bcreate (a|two|x|that many) treasure|\bplay an additional land\b/ },
    { key: "draw", label: "Card draw", target: 10, re: /\bdraws? (a|an|one|two|three|four|x|that many|\d+) cards?\b|\bdraw cards equal\b|\bexile the top [^.]*\. (until [^.]*, )?you may play\b/ },
    { key: "removal", label: "Removal", target: 8, re: /\b(destroy|exile) (up to (one|two) )?target (creature|artifact|enchantment|planeswalker|permanent|nonland|attacking)|\bdeals? (\d+|x) damage to (any target|target (creature|attacking|blocking))|\btarget creature (an opponent controls )?gets -|\btarget creature gets -x\/-x/ },
    { key: "wipes", label: "Board wipes", target: 3, re: /\b(destroy|exile) all (other )?(creatures|nonland permanents|nontoken|artifacts|enchantments|permanents)|\beach creature gets -|\ball creatures get -|\bdamage to each creature\b/ },
    { key: "tutors", label: "Tutors", target: 2, re: /\bsearch your library for (a|an|up to (one|two)) (?![^.]*\bland\b)[^.]*\bcards?\b/ },
    { key: "protection", label: "Protection", target: 3, re: /\b(creatures|permanents) you control (gain|have|get)[^.]*\b(indestructible|hexproof|shroud|protection)\b|\bequipped creature has[^.]*\b(shroud|hexproof|indestructible|protection)\b|\btarget (creature|permanent) you control gains[^.]*\b(indestructible|hexproof|protection)\b|\b(enchanted|equipped) creature (gets [^.]*and )?has [^.]*\b(shroud|hexproof|indestructible|protection)\b|\bprevent all combat damage\b|\bphase out\b/ },
  ];

  var COMMON_TYPES = { human: true }; // too common to count as a tribe

  /**
   * Reads one card: its gives/wants labels, roles, creature types and the
   * creature types its text cares about. Lands get labels but no roles.
   */
  CS.cardTraits = function (slim) {
    var text = CS.synText(slim);
    var types = synTypes(slim);
    var gives = {};
    var wants = {};
    GIVES.forEach(function (g) {
      if (g[1].test(text)) gives[g[0]] = true;
    });
    WANTS.forEach(function (w) {
      if (w[1].test(text)) wants[w[0]] = true;
    });
    var isLand = /\bland\b/.test(types.split("\u2014")[0]) && !/\bcreature\b/.test(types);
    if (/\b(equipment|aura)\b/.test(types)) gives.gear = true;
    else if (/\bequipped creature\b|\bwhenever (an|one or more) (equipment|auras?)\b|\b(equipment|auras?) you control\b|\bfor each (aura|equipment)\b|\bequip abilities\b/.test(text))
      wants.gear = true;
    if (/\b(instant|sorcery)\b/.test(types)) gives.spells = true;
    if (/\bwhenever you cast (an|a|your)[^.]*(instant|sorcery|noncreature)\b|\bprowess\b|\bmagecraft\b/.test(text))
      wants.spells = true;
    // a card only pays off its own label when it says so for others too
    var roles = {};
    if (!isLand)
      CS.SYN_ROLES.forEach(function (r) {
        if (r.re.test(text)) roles[r.key] = true;
      });
    // creature types: from creature type lines, and from tokens it makes
    var subtypes = {};
    types.split("//").forEach(function (face) {
      var parts = face.split("\u2014");
      if (parts.length > 1 && /\bcreature\b/.test(parts[0]))
        parts[1].trim().split(/\s+/).forEach(function (s) {
          if (s) subtypes[s] = true;
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
    (deckSlims || []).forEach(function (s) {
      if (!s || seen[s.id]) return;
      seen[s.id] = true;
      if (CS.isBasicLand(s.name)) return;
      var t = CS.cardTraits(s);
      t.id = s.id;
      t.name = s.name;
      t.commander = cmdKey !== "" && CS.nameKey(s.name) === cmdKey;
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

  /**
   * Scores one card against a deck profile. Returns
   * {score (0-100), raw, reasons: [string], links: {label: count}}.
   * `skipId` leaves one deck card out (for scoring the deck's own cards).
   */
  CS.fitScore = function (slim, profile, skipId) {
    var me = CS.cardTraits(slim);
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
    // tribal: shares a type the deck cares about, or cares about a type the deck has
    var tribal = null;
    var cares = {};
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
    profile.cards.forEach(function (c) {
      if (c.commander || c.land || !byId[c.id]) return;
      var f = CS.fitScore(byId[c.id], profile, c.id);
      var isRole = Object.keys(c.roles).length > 0;
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
        return Math.min(b.gives, b.wants) - Math.min(a.gives, a.wants) ||
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
    };
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

  CS.newDeckState = function (commanderName, now) {
    return {
      v: 1,
      commander: commanderName,
      decisions: {},
      history: [],
      updated: now || 0,
    };
  };

  /**
   * Checks a saved deck state. Returns a clean v1 state, or null if it
   * can't be used (then the page starts fresh for that deck). When the
   * format changes, convert older versions here.
   */
  CS.migrateDeckState = function (saved) {
    if (!saved || typeof saved !== "object" || saved.v !== 1) return null;
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
    return {
      v: 1,
      commander: typeof saved.commander === "string" ? saved.commander : "",
      decisions: decisions,
      history: history,
      updated: typeof saved.updated === "number" ? saved.updated : 0,
    };
  };

  function copyState(state) {
    return {
      v: 1,
      commander: state.commander,
      decisions: Object.assign({}, state.decisions),
      history: state.history.slice(),
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
   * "Copy for Moxfield" text: one "1 Card Name" per line, nothing else.
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

  /** Loads a deck's saved swipes, or a fresh state. */
  CS.loadDeckState = function (store, deckId, commanderName) {
    return (
      CS.migrateDeckState(store.get("deck:" + deckId, null)) ||
      CS.newDeckState(commanderName)
    );
  };

  CS.saveDeckState = function (store, deckId, state) {
    return store.set("deck:" + deckId, state);
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
