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

  /** Scryfall's search for a role pile, inside the commander's colors. */
  CS.ROLES = [
    { key: "removal", label: "Removal", tag: "removal" },
    { key: "ramp", label: "Ramp", tag: "ramp" },
    { key: "draw", label: "Card draw", tag: "draw" },
    { key: "protection", label: "Protection", tag: "protection" },
    { key: "wipes", label: "Board wipes", tag: "board-wipe" },
  ];

  CS.roleQuery = function (tag, colorIdentity) {
    var colors = (colorIdentity || []).join("").toLowerCase() || "c";
    return "id<=" + colors + " f:commander otag:" + tag + " order:edhrec";
  };

  CS.roleSearchUrl = function (tag, colorIdentity) {
    return (
      "https://api.scryfall.com/cards/search?q=" +
      encodeURIComponent(CS.roleQuery(tag, colorIdentity))
    );
  };

  CS.edhrecUrl = function (commanderName) {
    return (
      "https://json.edhrec.com/pages/commanders/" +
      CS.commanderSlug(commanderName) +
      ".json"
    );
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
