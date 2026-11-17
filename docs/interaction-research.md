# Score Commander Synergy Through Events, Not Keywords

Almost every card interaction in Commander reduces to one repeatable shape: some cards **produce** a game event or resource (a token, a death, a land drop, a spell cast, a counter), other cards **consume** it (trigger on it or count it), and a small set of **multipliers** (doublers) and **stoppers** (hosers) scale it up or switch it off. This report turns that shape into a taxonomy of **57 strategic themes** (each split into enablers, payoffs and glue), **19 game events** with exact producer and consumer wording, density-gated **typal, card-type and keyword axes**, a **combo layer** taken straight from Commander Spellbook, a **nonbo table** built on one rule (symmetric "players/each player" hosers hurt you, "opponents" hosers don't), and a **bracket layer** that works as filters and badges rather than score penalties. For Commander Swipe, the best quality-for-effort design is a rule-based scorer over Scryfall data: download Scryfall's `oracle_cards` and the new **`oracle_tags` bulk file (about 6.1 MB compressed)** in a build step, call the live Scryfall API from the browser (it sends `Access-Control-Allow-Origin: *` and asks for about 10 requests per second), and use Commander Spellbook's free combo data for "completes a combo" and bracket estimates. EDHREC stays optional, because it has no documented public API. The same scoring functions then run in reverse to produce a cut list and a paired one-for-one swap. Two cautions frame everything below: the regex patterns are design proposals grounded in verified Oracle wording but not yet run against the full card pool, and all scoring weights are untested starting points to tune with swipe data.

A note on terms used throughout. **Oracle text** is the official, up-to-date rules text of a card (what Scryfall stores in `oracle_text`), which can differ from what is printed. A **regex** (regular expression) is a text-matching pattern. An **enabler** creates a resource; a **payoff** rewards it; **glue** protects, finds, or multiplies the engine. A **nonbo** is two cards that look like they belong together but work against each other.

## Four free data layers cover almost everything the app needs

The functional vocabulary the app needs already exists in its main data source. Scryfall's community **Tagger** project labels cards by what they do ("oracle tags", searched as `otag:`), and as of November 2026 the live `/bulk-data` endpoint lists **seven** bulk files, including `oracle_tags` (about 6.1 MB gzipped JSON Lines, meaning one JSON object per line) and `art_tags` (about 13.4 MB), alongside `oracle_cards` (about 25.5 MB gzipped) ([Scryfall bulk-data API](https://api.scryfall.com/bulk-data)). The public docs page still lists only the five older files and says file URLs change daily, so the app must read URLs from `api.scryfall.com/bulk-data` rather than hard-coding them ([Scryfall bulk-data docs](https://www.scryfall.com/docs/api/bulk-data)). Scryfall's API rules are friendly to a browser app: it returned **`access-control-allow-origin: *`** on a live check, asks for **50–100 ms between requests (about 10 per second)**, answers excess traffic with HTTP 429 and can ban abusive IPs, encourages caching for at least 24 hours, forbids paywalling or simply re-hosting its data, and requires that software "create additional value for end-users" ([Scryfall API docs](https://scryfall.com/docs/api)). A recommender clearly adds value, but a trimmed derived file on GitHub Pages should stay app-specific rather than a mirror. Card objects also carry a **`game_changer` boolean**, and `is:gamechanger` returns **53 cards** today, so the official Game Changers list never needs to be hard-coded ([Scryfall search is:gamechanger](https://api.scryfall.com/cards/search?q=is%3Agamechanger)).

The oracle tags are hierarchical in practice: `removal` (6,490 cards) contains `spot-removal` (5,438), and `ramp` (2,355) contains `mana-rock`, `mana-dork` and `land-ramp`. Several slugs a developer would guess **do not exist**, including `aristocrats`, `proliferate`, `tokens`, `stax`, `etb-trigger`, `spellslinger` and `reanimation` (the real slug is `reanimate`) ([Scryfall otag searches](https://api.scryfall.com/cards/search?q=otag%3Aramp)). Tags describe function, not archetype, so the app needs its own theme layer on top. The ecosystem is converging on these tags: Archidekt began showing Scryfall oracle tags per card and letting users turn them into deck categories in July 2026 ([Archidekt update](https://archidekt.com/news/24799503)). Treat a missing tag as "unknown", because community tagging of new sets lags.

**Commander Spellbook** is the combo layer. It is free, MIT-licensed, and powers EDHREC's combo feature; it lists **26,949 combos expanding to 123,293 concrete card-level "variants"**, of which 4,060 use exactly two cards ([Spellbook About](https://commanderspellbook.com/about), [Spellbook Metrics](https://commanderspellbook.com/metrics/)). Its public, no-login REST API includes `/variants/`, `/find-my-combos` (POST a decklist, get combos it already has and combos it is one card away from), and `/estimate-bracket`; the docs ask clients to use the bulk file `json.commanderspellbook.com/variants.json.gz` for full exports, to stay around **80 requests per minute**, to back off on 429, to name the service in the User-Agent, and to credit commanderspellbook.com ([Spellbook API docs](https://spacecowmedia.github.io/commander-spellbook-backend/api.html)). Browser CORS for Spellbook was **not verified** (the research sandbox blocked the host), so the safe design precomputes a card-to-variant index from the bulk file at build time and treats live calls as an optional enhancement.

**EDHREC** is optional enrichment only. It has no documented public API; `json.edhrec.com` is an undocumented internal endpoint whose shape and CORS headers could not be checked, and third-party paid scrapers exist precisely because no official route does ([EDHREC "From Synergy to Lift"](https://edhrec.com/articles/from-synergy-to-lift-the-math-behind-edhrecs-new-era), [Apify EDHREC scraper](https://apify.com/parseforge/edhrec-mtg-commander-scraper)). Two EDHREC-derived numbers are available without touching EDHREC at all: Scryfall's `edhrec_rank` field (a popularity prior) and MTGJSON's **`edhrecSaltiness`** and `edhrecRank` per card, plus `isGameChanger` ([MTGJSON Card (Atomic)](https://mtgjson.com/data-models/card/card-atomic/)). EDHREC's vocabulary is still worth borrowing: its theme index lists about **285 theme tags** with deck counts (Tokens 209,104; +1/+1 Counters 168,353; Artifacts 114,125; Spellslinger 88,823; Aristocrats 68,846; Voltron 61,834, and so on) that make natural labels for the swipe UI ([EDHREC Theme Tags](https://edhrec.com/tags/themes)).

| Source | Use in app | Access and limits | Status |
|---|---|---|---|
| Scryfall API `api.scryfall.com` | Live card lookups, search queries, candidate retrieval | CORS `*` (verified); 50–100 ms between calls; cache ≥24 h; no re-hosting as a mirror | Required |
| Scryfall bulk `oracle_cards` (~25.5 MB gz) | Build-time card table (text, types, keywords, `all_parts`, `produced_mana`, `game_changer`, `edhrec_rank`, prices) | URLs change daily; read from `/bulk-data`; `data.scryfall.io` CORS unverified, so download in a build step | Required |
| Scryfall bulk `oracle_tags` (~6.1 MB gz, JSONL) | Role tags and theme seeds joined by `oracle_id` | File schema (field names, parent/child links) not yet inspected | Strongly recommended |
| Commander Spellbook bulk `variants.json.gz` | Combo index: card → variants, features, bracket tag | Prefer bulk over API for exports; credit + User-Agent | Strongly recommended |
| Commander Spellbook API | `/find-my-combos`, `/estimate-bracket` per deck import | ~80 req/min safe; CORS unverified | Optional |
| MTGJSON AtomicCards | `edhrecSaltiness` for salt badges | License and size not confirmed | Optional |
| EDHREC | Theme names; optional lift/inclusion data | No public API; CORS and terms unverified | Optional, link out |

One practical caveat sits upstream of all of this. Whether a **Moxfield export includes the user's own per-card tags**, and in what syntax, was not confirmed; the app should be tested against a real export before relying on user tags as input.

## Normalize the 2024 templating before matching anything

Oracle wording changed under every pattern a developer might copy from older guides. With Bloomburrow (Oracle update of **August 8, 2024**), "enters the battlefield" became **"enters"** on several thousand cards; "leaves the battlefield" was deliberately left alone because "leave" is also used for graveyards ([Scryfall errata notice](https://scryfall.com/blog/errata-notice-bloomburrow-enters-229), [MTG Wiki: Enter the battlefield](https://mtg.wiki/page/Enter_the_battlefield)). That 2024 notice said control wording seemed unchanged, but live data in November 2026 shows it has since changed too: among Commander-legal cards, `o:"enters the battlefield"` matches **exactly one card**, while `o:"you control enters"` matches **820** ([Scryfall search](https://scryfall.com/search?q=o%3A%22you+control+enters%22+f%3Acommander)). Cathars' Crusade now reads "Whenever a creature you control enters…" ([Scryfall: Cathars' Crusade](https://api.scryfall.com/cards/named?exact=Cathars%27%20Crusade)). Self-references moved too: non-legendary cards now say "this creature" or "this enchantment" (Baleful Strix: "When this creature enters, draw a card"), while legendary cards still use their names or short names ([Scryfall: Baleful Strix](https://api.scryfall.com/cards/named?exact=Baleful%20Strix)). The same update renamed "precombat/postcombat main phase" to "first/second main phase" and "as long as it's not your turn" to "during turns other than yours" ([Scryfall errata notice](https://scryfall.com/blog/errata-notice-bloomburrow-enters-229)).

Structured fields carry several traps. Scryfall's `keywords` array lists keywords a card **has or uses**, mixing 224 keyword abilities, 80 keyword actions (Scry, Treasure, Food, Proliferate) and 74 ability words (Landfall, Constellation), but it **omits keywords a card grants**: Archetype of Imagination ("Creatures you control have flying") has `keywords: []` ([Scryfall: Archetype of Imagination](https://api.scryfall.com/cards/named?exact=Archetype%20of%20Imagination), [keyword catalog](https://api.scryfall.com/catalog/keyword-abilities)). Multi-face cards (Rooms, modal double-faced cards, battles) have no top-level `oracle_text`; their text lives in `card_faces[*].oracle_text` ([Scryfall: Unholy Annex](https://api.scryfall.com/cards/named?fuzzy=Unholy%20Annex)). `all_parts` with `component: "token"` names the exact tokens a card makes (Tireless Provisioner → Treasure and Food), which is a cleaner producer signal than parsing text ([Scryfall: Tireless Provisioner](https://api.scryfall.com/cards/named?fuzzy=Tireless%20Provisioner)). `produced_mana` reports what a card could produce, so "any color" rocks and Treasure makers return all five colors and should not be read as color fixing on their own ([Scryfall: Arcane Signet](https://api.scryfall.com/cards/named?exact=Arcane%20Signet)).

Color identity is a hard filter, not a score. It includes mana symbols in the cost **and rules text**, color indicators and back faces, but ignores reminder text; hybrid counts as both colors ([MTG Wiki: Color identity](https://mtg.wiki/page/Color_identity)). Scryfall's `color_identity` plus `legalities.commander` handle this; partners and Backgrounds use the union of both commanders' identities.

### Pattern conventions for the JSON taxonomy

Every pattern in this report follows one format so it can be converted mechanically. The app builds one **normalized text** per card and runs patterns on it.

```yaml
normalization:
  steps:
    - text = oracle_text, or join card_faces[*].oracle_text with "\n" when top-level oracle_text is missing
    - payoff_text = text with parenthesized reminder text removed; keep original text for keyword-action inference
    - 'replace self-references with "~": the full card name, the short name before the first comma (e.g. "Drivnod"), and "this (creature|artifact|enchantment|land|planeswalker|saga|vehicle|equipment|aura|spacecraft|permanent|card|spell)"'
    - do NOT lowercase; compile every pattern with the JavaScript flags "i" and "u"
  macros:   # expanded before compiling
    '%ANY%':    '[^.]*?'                                   # same-sentence wildcard; never use .* (it crosses sentences)
    '%ENTERS%': 'enters?(?: the battlefield)?(?: under your control)?'   # fallback keeps old/cached wording matching
    '%NUM%':    '(?:a|an|one|two|three|four|five|six|seven|x|\d+|that many|twice that many)'
    '%TYPE%':   'a creature subtype, expanded from the plural table as (?<!non-)(?:elf|elves)\b'
    '%KIND%':   'a card type or subtype word: artifact|enchantment|land|creature|planeswalker|equipment|aura|vehicle|saga|room|legendary|historic|snow|instant|sorcery|noncreature'
    '%COLORS%': 'the commander color identity letters, used only inside Scryfall queries'
  yaml_quoting: single-quoted strings; backslashes are literal; an apostrophe is written as two ('')
  list_semantics: 'a list of strings matches if ANY string matches; an item {all: [...]} matches only if EVERY string matches'
  keywords_field: names in "keywords" lists are matched exactly (case-insensitive) against Scryfall's keywords[] array
  scryfall_queries: written without the base filter; the app prepends 'f:commander id<=%COLORS% ' to every query
  scryfall_or: lowercase 'or' inside parentheses, e.g. '(kw:cascade or kw:discover)'
```

## Fifty-seven themes split into enablers, payoffs and glue

No single official archetype list exists; EDHREC's theme tags are the de facto standard, so each entry below records the matching EDHREC display name(s) in `edhrec_tag` (exact names from EDHREC's index; URL slugs follow its lowercase-hyphen pattern, such as `plus-1-plus-1-counters`, but derive and check them before linking) ([EDHREC Theme Tags](https://edhrec.com/tags/themes), [EDHREC themes without a precon](https://edhrec.com/articles/which-commander-themes-still-dont-have-a-precon/)). The `otag` field lists **only slugs verified live** against Scryfall; anything else is left out rather than guessed. Seed cards are well-known examples for unit tests and should be spot-checked; they are not "best card" claims. The catalog is grouped into six engine families because themes inside a family share resources and chain naturally.

A deck **pursues** a theme when the commander's own text matches one of its patterns (weight it about **3×**, since the commander is always available), or when roughly **8–10 nonland cards** match the theme with both enablers and payoffs present. These thresholds are practitioner judgment, not sourced numbers, and are listed in the scoring config as tunable values.

### Body engine: creatures, bodies and combat

```yaml
themes:
- id: tokens
  name: Tokens / Go-wide
  edhrec_tag: [Tokens, Go Wide, Anthems]
  enablers:
    regex: ['create[sd]? %ANY%tokens?', '\bpopulate\b']
    keywords: [Populate, Amass, Myriad, Offspring, Fabricate, Afterlife, Incubate, Mobilize]
    structured: 'all_parts[component=token] whose token type_line contains Creature'
  payoffs:
    regex: ['creatures you control get \+\d+/\+\d+', 'whenever (?:a|one or more) %ANY%tokens? (?:you control )?%ENTERS%', 'for each creature you control', 'creature tokens you control (?:get|have)']
  glue: [doubler:token-replacement, doubler:etb-trigger]
  scryfall: {enabler: 'o:/create.*creature token/', payoff: 'o:"creatures you control get +"'}
  otag: [synergy-token, anthem]
  seeds: {enabler: [Avenger of Zendikar, Tendershoot Dryad, Secure the Wastes, Bitterblossom], payoff: [Intangible Virtue, Craterhoof Behemoth, Cathars' Crusade, Beastmaster Ascension]}

- id: aristocrats
  name: Aristocrats / Sacrifice
  edhrec_tag: [Aristocrats, Sacrifice]
  enablers:
    regex: ['sacrifice (?:a|an|another|one or more) (?:\w+ )?(?:creature|permanent|artifact)s?:', 'return ~ from your graveyard']
    keywords: [Exploit, Casualty, Persist, Undying, Blitz, Decayed]
  payoffs:
    regex: ['whenever (?:~ or )?(?:a|another|one or more) (?:nontoken )?creatures? (?:you control )?dies?', 'whenever you sacrifice']
    keywords: [Morbid]
  glue:
    regex: ['whenever a creature you control dies, each opponent sacrifices']
    refs: [doubler:death-trigger]
  scryfall: {enabler: 'o:/sacrifice (a|another) creature:/', payoff: 'o:/whenever (a|another) (nontoken )?creature (you control )?dies/'}
  otag: [sacrifice-outlet, death-trigger, synergy-sacrifice]
  seeds: {enabler: [Viscera Seer, Carrion Feeder, Ashnod's Altar, Goblin Bombardment], payoff: [Blood Artist, Zulaport Cutthroat, Cruel Celebrant, Bastion of Remembrance]}

- id: blink
  name: Flicker / Blink / ETB value
  edhrec_tag: [Blink, ETB]
  enablers:
    regex: ['exile %ANY%(?:creature|permanent)s? you control%ANY%return (?:it|that card|them|those cards) to the battlefield', 'return (?:it|that card|them|those cards) to the battlefield %ANY%at the beginning of the next end step']
    keywords: [Airbend]   # Avatar 2025 keyword action; confirm exact catalog string
  payoffs:
    regex: ['when(?:ever)? ~ %ENTERS%', 'whenever (?:another )?(?:nontoken )?creature (?:you control )?%ENTERS%']
  glue: [doubler:etb-trigger]
  scryfall: {enabler: 'o:/exile .* return (it|that card|them) to the battlefield/', payoff: 't:creature o:/when (~|this creature) enters/'}
  otag: [blink]
  seeds: {enabler: [Ephemerate, Restoration Angel, Conjurer's Closet, "Brago, King Eternal"], payoff: [Mulldrifter, Cloudblazer, Archaeomancer, Solemn Simulacrum]}

- id: clones
  name: Copy / Clone
  edhrec_tag: [Clones]
  enablers:
    regex: ['(?:enter|%ENTERS%) as a copy of', 'becomes? a copy of', 'create a token that''s a copy of']
    keywords: [Myriad, Encore, Embalm, Eternalize, Offspring]
  payoffs:
    regex: ['when(?:ever)? ~ %ENTERS%']   # copies are best on ETB creatures
  glue:
    regex: ['legend rule%ANY%doesn''t apply', 'isn''t legendary']
  scryfall: {enabler: 'o:/(token that''s a copy|enter as a copy|becomes a copy)/'}
  otag: [copy]
  seeds: {enabler: [Spark Double, Clone, Phantasmal Image, Helm of the Host, "Kiki-Jiki, Mirror-Breaker", Mirage Mirror], payoff: ["Esix, Fractal Bloom", "Brudiclad, Telchor Engineer", Riku of Two Reflections]}

- id: lifegain
  name: Lifegain
  edhrec_tag: [Lifegain]
  enablers:
    regex: ['(?:you )?gain %NUM% life', 'whenever (?:another )?creature %ENTERS%%ANY%gain %NUM% life']
    keywords: [Lifelink, Food]
  payoffs:
    regex: ['whenever you gain life', 'if you would gain life%ANY%instead', 'if you gained life this turn']
  scryfall: {enabler: 'o:/you gain (\d+|x|that much) life/', payoff: 'o:"whenever you gain life"'}
  otag: [lifegain, synergy-lifegain]
  seeds: {enabler: [Soul Warden, Cleric of Life's Bond], payoff: [Ajani's Pridemate, "Heliod, Sun-Crowned", Archangel of Thune, Rhox Faithmender]}

- id: lifedrain
  name: Lifedrain / Pingers / Burn
  edhrec_tag: [Lifedrain, Pingers, Burn, Group Slug]
  enablers:
    regex: ['each opponent loses %NUM% life', 'deals %NUM% damage to each opponent', '\{T\}: ~ deals 1 damage to any target', 'whenever (?:a|another) creature (?:you control )?%ENTERS%,%ANY%deals? %NUM% damage']
    keywords: [Extort]
  payoffs:
    regex: ['deals? double that damage', 'that much damage plus 1', 'whenever an opponent loses life']
  scryfall: {enabler: 'o:"each opponent loses"', payoff: 'o:"whenever an opponent loses life"'}
  otag: [burn]
  seeds: {enabler: [Impact Tremors, Warstorm Surge, Blood Artist, Prodigal Pyromancer], payoff: ["Torbran, Thane of Red Fell", Fiery Emancipation, Dictate of the Twin Gods, Exquisite Blood, Sanguine Bond]}

- id: voltron
  name: Voltron (Auras / Equipment)
  edhrec_tag: [Voltron, Equipment, Auras]
  enablers:
    regex: ['equipped creature gets', 'enchanted creature gets', 'equip \{0\}', 'equip costs? %ANY%less']
    type_line: [Equipment, Aura]
  payoffs:
    regex: ['whenever (?:an )?(?:aura|equipment) (?:spell )?(?:you control )?(?:becomes attached|%ENTERS%)', 'whenever you cast an (?:aura|equipment)', 'for each (?:aura|equipment) attached']
  glue:
    regex: ['(?:has|have|gains?) (?:hexproof|indestructible|protection from)', 'can''t be blocked']
  scryfall: {enabler: 't:equipment o:"equipped creature gets"', payoff: 'o:/whenever you cast an (aura|equipment)/'}
  otag: [protection, evasion]
  seeds: {enabler: [Sword of Feast and Famine, Colossus Hammer, Ethereal Armor, Rancor], payoff: ["Sram, Senior Edificer", Puresteel Paladin, Kor Spiritdancer], glue: [Lightning Greaves, Swiftfoot Boots, Mother of Runes]}

- id: attack-triggers
  name: Attack Triggers
  edhrec_tag: [Attack Triggers, Aggro]
  enablers:
    regex: ['(?:have|has|gains?) haste']
  payoffs:
    regex: ['whenever (?:~|a creature you control|one or more creatures you control) attacks?', 'whenever you attack']
    keywords: [Myriad, Exalted, Mobilize, Melee, Battle cry, Annihilator, Raid, Battalion]
  glue: [doubler:attack-trigger]
  scryfall: {payoff: 'o:"whenever you attack"'}
  otag: [gives-haste]
  seeds: {payoff: ["Najeela, the Blade-Blossom", Hellrider, "Karlach, Raging Tiefling"], glue: ["Isshin, Two Heavens as One"]}

- id: extra-combats
  name: Extra Combats
  edhrec_tag: [Extra Combats]
  enablers:
    regex: ['(?:an )?additional combat phase', 'untap all (?:creatures|attacking creatures)']
  payoffs: {refs: [theme:attack-triggers]}
  scryfall: {enabler: 'o:"additional combat phase"'}
  seeds: {enabler: [Aggravated Assault, Relentless Assault, "Moraug, Fury of Akoum", Combat Celebrant, Port Razer, Seize the Day]}

- id: goad
  name: Goad / Forced Combat
  edhrec_tag: [Forced Combat]
  enablers:
    regex: ['\bgoads?\b', 'attacks? each combat if able']
  payoffs:
    regex: ['whenever (?:a creature )?(?:an opponent controls|a goaded creature) attacks (?:one of your opponents|a player other than you)']
  scryfall: {enabler: 'o:goad'}
  seeds: {enabler: [Disrupt Decorum, Vengeful Ancestor, "Marisi, Breaker of the Coil", Agitator Ant, Shiny Impetus], payoff: ["Kardur, Doomscourge", "Karazikar, the Eye Tyrant", "Breena, the Demagogue"]}

- id: power-matters
  name: Power Matters / Fling
  edhrec_tag: [Power Matters, Power, Fling]
  enablers:
    regex: ['double (?:its|target creature''s) power']
  payoffs:
    regex: ['(?:with )?power \d+ or greater', '\bferocious\b', 'equal to (?:its|that creature''s|the greatest) power']
    keywords: [Formidable]
  scryfall: {payoff: 'o:/power (4|5) or greater/'}
  seeds: {payoff: [Garruk's Uprising, Elemental Bond, Return of the Wildspeaker, Shamanic Revelation, Rishkar's Expertise, Greater Good]}

- id: toughness-matters
  name: Toughness Matters / Defenders
  edhrec_tag: [Toughness Matters, Defenders]
  enablers:
    regex: ['gets \+0/\+\d+']
    keywords: [Defender]
  payoffs:
    regex: ['assigns? combat damage equal to its toughness rather than its power', '(?:creatures with defender|defenders) (?:you control )?can attack', 'for each creature (?:you control )?with defender', 'equal to (?:its|the greatest) toughness']
  scryfall: {enabler: 'kw:defender', payoff: 'o:"combat damage equal to its toughness"'}
  seeds: {enabler: [Wall of Roots, Overgrown Battlement, Axebane Guardian], payoff: ["Doran, the Siege Tower", "Arcades, the Strategist", Assault Formation, Belligerent Brontodon, High Alert]}

- id: keyword-soup
  name: Keyword Soup / Keyword Counters
  edhrec_tag: [Keywords]
  enablers:
    regex: ['put an? (?:flying|first strike|deathtouch|lifelink|indestructible|trample|vigilance|menace|hexproof|reach) counter']
    structured: 'keywords[] intersected with the synergy-keyword whitelist has length >= 3'
  payoffs:
    regex: ['the same is true for (?:flying|first strike)', 'for each (?:keyword|ability) among']
  seeds: {enabler: [Akroma's Memorial, Majestic Myriarch], payoff: ["Odric, Lunarch Marshal", Concerted Effort, "Kathril, Aspect Warper"]}

- id: mutate
  name: Mutate
  edhrec_tag: [Mutate]
  enablers: {keywords: [Mutate]}
  payoffs:
    regex: ['whenever (?:~|a creature you control) mutates', 'mutated creatures?']
  scryfall: {enabler: 'kw:mutate'}
  seeds: {enabler: [Gemrazer, "Nethroi, Apex of Death", "Brokkos, Apex of Forever"], payoff: ["Vadrok, Apex of Thunder", "Snapdax, Apex of the Hunt", "Otrimi, the Ever-Playful"]}

- id: party
  name: Party
  edhrec_tag: [Party]
  enablers: {structured: 'type_line subtype in [Cleric, Rogue, Warrior, Wizard] or keyword Changeling'}
  payoffs:
    regex: ['for each creature in your party', 'full party']
  scryfall: {enabler: 'is:party'}
  seeds: {payoff: ["Tazri, Beacon of Unity", Archpriest of Iona, "Linvala, Shield of Sea Gate"]}

- id: sneak-attack
  name: Cheat Big Creatures into Play
  edhrec_tag: [Sneak Attack]
  enablers:
    regex: ['put (?:a|an|target) (?:\w+ )?creature card %ANY%from your hand onto the battlefield', 'search your library for an? (?:\w+ )?creature card%ANY%onto the battlefield']
  payoffs: {structured: 'type_line contains Creature and cmc >= 7 and value is not a cast trigger'}
  scryfall: {enabler: 'o:/put (a|an) .*creature card from your hand onto the battlefield/', payoff: 't:creature mv>=7'}
  seeds: {enabler: [Sneak Attack, Elvish Piper, Quicksilver Amulet, Kaalia of the Vast, Defense of the Heart], payoff: [Craterhoof Behemoth, Terastodon, Hellkite Tyrant, Archon of Cruelty]}
```

### Counter engine: anything that puts counters on things

```yaml
themes:
- id: plus-1-plus-1-counters
  name: +1/+1 Counters
  edhrec_tag: [+1/+1 Counters, Counters Matter]
  enablers:
    regex: ['put %NUM% \+1/\+1 counters? on']
    keywords: [Evolve, Adapt, Outlast, Bolster, Support, Modular, Graft, Riot, Training, Backup, Mentor, Increment, Earthbend]   # Increment (2026) and Earthbend (2025): confirm catalog strings
  payoffs:
    regex: ['with (?:a|one or more) \+1/\+1 counters? on (?:it|them)', 'for each \+1/\+1 counter', 'whenever one or more \+1/\+1 counters are put on']
  glue: [doubler:counter-replacement]
  scryfall: {enabler: 'o:"+1/+1 counter"', payoff: 'o:"whenever one or more +1/+1 counters"'}
  otag: [counters-matter]
  seeds: {enabler: [Cathars' Crusade, Walking Ballista, The Ozolith], payoff: [Inspiring Call, Bred for the Hunt, Herd Baloth, Shalai and Hallar], glue: [Hardened Scales, Doubling Season]}

- id: minus-1-minus-1-counters
  name: -1/-1 Counters / Blight / Wither
  edhrec_tag: [-1/-1 Counters, Blight]
  enablers:
    regex: ['put %NUM% -1/-1 counters? on', '\bblight \d+']
    keywords: [Wither, Infect, Persist]
  payoffs:
    regex: ['whenever (?:you put )?one or more -1/-1 counters (?:are )?put on', 'for each -1/-1 counter']
  glue:
    regex: ['remove (?:a|all) -1/-1 counters?']
  scryfall: {enabler: '(o:"-1/-1 counter" or o:/blight \d/)'}
  seeds: {enabler: [Black Sun's Zenith, "Hapatra, Vizier of Poisons", Grim Poppet, Contagion Engine], payoff: [Nest of Scarabs, Obelisk Spider, The Scorpion God]}

- id: proliferate
  name: Proliferate
  edhrec_tag: [Proliferate]
  enablers: {keywords: [Proliferate]}
  payoffs: {refs: [theme:plus-1-plus-1-counters, theme:minus-1-minus-1-counters, theme:superfriends, theme:infect, theme:energy, theme:sagas]}
  scryfall: {enabler: 'kw:proliferate'}   # otag:proliferate does NOT exist
  seeds: {enabler: [Evolution Sage, Flux Channeler, Tezzeret's Gambit, Contentious Plan, Karn's Bastion]}

- id: superfriends
  name: Superfriends (Planeswalkers)
  edhrec_tag: [Planeswalkers]
  enablers:
    regex: ['put %NUM% loyalty counters?', 'empower jace']
    type_line: [Planeswalker]
  payoffs:
    regex: ['whenever you activate a loyalty ability', 'loyalty abilities of planeswalkers you control', 'planeswalkers you control (?:have|get)', 'for each planeswalker']
  scryfall: {enabler: 't:planeswalker', payoff: 'o:"planeswalkers you control"'}
  seeds: {payoff: [Oath of Teferi, The Chain Veil, Carth the Lion, Doubling Season]}

- id: infect
  name: Poison / Infect / Toxic
  edhrec_tag: [Infect]
  enablers:
    regex: ['poison counters?', '(?:gains?|have) infect']
    keywords: [Infect, Toxic, Poisonous]
  payoffs:
    keywords: [Corrupted, Proliferate]
  scryfall: {enabler: '(kw:infect or kw:toxic or o:"poison counter")'}
  seeds: {enabler: [Blightsteel Colossus, "Skithiryx, the Blight Dragon", Tainted Strike, Triumph of the Hordes, Grafted Exoskeleton], payoff: ["Ixhel, Scion of Atraxa", Phyresis Outbreak, Contagion Engine]}

- id: energy
  name: Energy
  edhrec_tag: [Energy]
  enablers:
    regex: ['you get (?:\{E\})+', 'get %NUM% \{E\}']
  payoffs:
    regex: ['pay (?:\{E\})+', 'pay %NUM% \{E\}', 'for each \{E\}']
  scryfall: {enabler: 'o:"{E}"'}
  seeds: {both: [Aetherworks Marvel, Guide of Souls, Lightning Runner, Amped Raptor]}

- id: sagas
  name: Sagas / Class / Lore Counters
  edhrec_tag: [Sagas]
  enablers: {type_line: [Saga, Class]}
  payoffs:
    regex: ['whenever (?:one or more )?lore counters? (?:are )?put on', 'chapter abilit%ANY%trigger an additional time', 'sagas? you control']
  scryfall: {enabler: 't:saga', payoff: 'o:"sagas you control"'}
  seeds: {enabler: [The Eldest Reborn, Urza's Saga, Fable of the Mirror-Breaker, Barbarian Class], payoff: [Tom Bombadil, "Satsuki, the Living Lore"]}
```

### Graveyard engine: discard, mill and recursion

```yaml
themes:
- id: self-mill
  name: Self-mill / Graveyard Value
  edhrec_tag: [Self-Mill, Graveyard, Dredge]
  enablers:
    regex: ['(?:^|[.\n] ?)mill %NUM% cards?', 'put the top %NUM% cards of your library into your graveyard']
    keywords: [Surveil, Dredge]
  payoffs:
    regex: ['for each (?:\w+ )?card in your graveyard', 'cast %ANY%from your graveyard', 'you may play (?:lands and )?cards? from your graveyard', 'whenever one or more (?:creature )?cards? (?:are put into|leave) your graveyard']
    keywords: [Flashback, Escape, Delve, Threshold, Delirium, Disturb, Embalm, Eternalize, Jump-start, Retrace, Mayhem, Harmonize, Descend]
  scryfall: {enabler: '(o:/mill (two|three|four|five|x|\d+) cards/ -o:/(target|each) (player|opponent) mills/) or kw:surveil'}
  otag: [self-mill, recursion]
  seeds: {enabler: [Stitcher's Supplier, Satyr Wayfinder, Splinterfright], payoff: ["Muldrotha, the Gravetide", "Karador, Ghost Chieftain", The Gitrog Monster, "Syr Konrad, the Grim"]}

- id: reanimator
  name: Reanimator
  edhrec_tag: [Reanimator]
  enablers:
    regex: ['search your library for %ANY%put (?:it|them|that card|those cards) into your graveyard']
    refs: [theme:self-mill, theme:discard]
  payoffs:
    regex: ['return (?:target |enchanted )?(?:\w+ )?creature card %ANY%to the battlefield', 'put %ANY%creature cards?%ANY%from (?:a|your|all) graveyards? onto the battlefield']
    keywords: [Unearth, Encore]
  scryfall: {payoff: 'o:/return .* creature card .* graveyard to the battlefield/'}
  otag: [reanimate]
  seeds: {enabler: [Entomb, Buried Alive, Faithless Looting], payoff: [Reanimate, Animate Dead, Necromancy, Living Death, Meren of Clan Nel Toth]}

- id: discard
  name: Madness / Self-discard / Looting
  edhrec_tag: [Discard, Self-Discard, Madness, Looting]
  enablers:
    regex: ['draw %NUM% cards?, then discard', 'discard (?:a|%NUM%) cards?,? then draw', 'discard a card:']
    keywords: [Connive, Cycling, Blood]
  payoffs:
    regex: ['whenever you discard (?:a|one or more) (?:nonland )?cards?', 'whenever you cycle or discard']
    keywords: [Madness, Mayhem]
  variants: {opponent_discard_payoff: 'whenever an opponent discards'}
  scryfall: {payoff: '(o:"whenever you discard" or kw:madness)'}
  otag: [discard-outlet, loot]
  seeds: {enabler: [Faithless Looting, Cathartic Reunion, Wild Mongrel], payoff: [Anje Falkenrath, Drake Haven, Bone Miser, Fiery Temper, Archfiend of Ifnir]}

- id: cycling
  name: Cycling
  edhrec_tag: [Cycling]
  enablers: {keywords_regex: '\w*cycling'}   # Cycling, Landcycling, Basic landcycling, typecycling
  payoffs:
    regex: ['whenever you cycle (?:or discard )?(?:a|another) card', 'whenever (?:a player|you) cycles']
  scryfall: {enabler: 'kw:cycling', payoff: 'o:"whenever you cycle"'}
  seeds: {enabler: [Street Wraith, Shefet Monitor, Ash Barrens], payoff: [Drake Haven, Astral Drift, Archfiend of Ifnir, The Locust God, "Gavi, Nest Warden", Zenith Flare]}

- id: mill
  name: Mill (opponents)
  edhrec_tag: [Mill]
  enablers:
    regex: ['(?:target|each) (?:player|opponent) mills? %NUM% cards?']
  payoffs:
    regex: ['mills? %ANY%twice that many', 'for each card in (?:an opponent''s|target player''s) graveyard']
  scryfall: {enabler: 'o:/(target|each) (player|opponent) mills/'}
  otag: [mill]
  seeds: {enabler: [Maddening Cacophony, Fractured Sanity, Traumatize, Ruin Crab, Hedron Crab], payoff: [Bruvac the Grandiloquent, "Phenax, God of Deception", Mindcrank, Sewer Nemesis]}

- id: wheels
  name: Wheels / Draw-Punish
  edhrec_tag: [Wheels]
  enablers:
    regex: ['each player (?:discards their hand,? (?:then|and) )?draws', 'each player shuffles %ANY%then draws']
  payoffs:
    regex: ['whenever an opponent draws', 'whenever a player draws']
  scryfall: {enabler: 'o:/each player (discards their hand.*)?draws/', payoff: 'o:"whenever an opponent draws"'}
  otag: [wheel]
  seeds: {enabler: [Wheel of Fortune, Windfall, Echo of Eons, Reforge the Soul, Timetwister], payoff: ["Nekusar, the Mindrazer", Underworld Dreams, "Sheoldred, the Apocalypse"]}
  bracket_note: 'several top payoffs are Game Changers (Notion Thief, Orcish Bowmasters, Narset)'
```

### Cast engine: spells, free casts and timing

```yaml
themes:
- id: spellslinger
  name: Spellslinger (Instants/Sorceries, Storm, Copy)
  edhrec_tag: [Spellslinger, Storm, Spell Copy, Cantrips, Prowess]
  enablers:
    regex: ['instant and sorcery spells you cast cost \{\d\} less', 'return (?:target )?instant or sorcery card']
    type_line: [Instant, Sorcery]
    keywords: [Flashback]
  payoffs:
    regex: ['whenever you cast (?:or copy )?an instant or sorcery', 'whenever you cast a noncreature spell', 'whenever you cast your second spell each turn']
    keywords: [Magecraft, Prowess, Storm, Repartee, Opus]
  glue:
    regex: ['copy target instant or sorcery', 'copy (?:it|that spell)']
  scryfall: {payoff: '(o:"whenever you cast an instant or sorcery spell" or o:"whenever you cast a noncreature spell")'}
  otag: [cantrip, ritual]
  seeds: {enabler: [Ponder, Brainstorm, Goblin Electromancer, Past in Flames, Mizzix's Mastery], payoff: [Young Pyromancer, "Talrand, Sky Summoner", Guttersnipe, Storm-Kiln Artist, Archmage Emeritus, "Veyran, Voice of Duality"], glue: [Thousand-Year Storm, Dualcaster Mage, Reverberate, Twincast]}

- id: cascade
  name: Cascade / Discover
  edhrec_tag: [Cascade, Discover]
  enablers:
    regex: ['(?:gains|have) cascade']
    keywords: [Cascade, Discover, Ripple]
  payoffs:
    regex: ['whenever you cascade']
    refs: [event:spell-cast]
  scryfall: {enabler: '(kw:cascade or kw:discover)'}
  anti: [theme:x-spells, role:counterspell]   # cascaded X=0; counters often lack a target
  seeds: {enabler: [Bloodbraid Elf, Maelstrom Wanderer, Shardless Agent, Apex Devastator, Maelstrom Nexus], payoff: ["Averna, the Chaos Bloom", "Yidris, Maelstrom Wielder", "Imoti, Celebrant of Bounty"]}

- id: exile-cast
  name: Exile Matters / Cast from Exile
  edhrec_tag: [Exile, Impulse Draw, Foretell, Plot, Adventures, Suspend, Warp]
  enablers:
    regex:
      - {all: ['exile the top (?:card|%NUM% cards) of your library', 'you may (?:play|cast) (?:it|that card|them|those cards)']}
    keywords: [Foretell, Plot, Suspend, Warp, Rebound]
    type_line: [Adventure]
  payoffs:
    regex: ['whenever you cast a spell from exile', 'whenever you play a card from exile', 'from anywhere other than your hand', 'whenever (?:one or more )?cards? (?:are put into|you own are put into) exile', 'for each card you own in exile']
  scryfall: {enabler: '(kw:foretell or kw:plot or kw:warp or t:adventure)', payoff: 'o:/(cast a spell|play a card) from exile/'}
  seeds: {enabler: [Light Up the Stage, Bonecrusher Giant, Fable of the Mirror-Breaker], payoff: ["Prosper, Tome-Bound", "Laelia, the Blade Reforged", "Ranar the Ever-Watchful"]}

- id: flash
  name: Flash / Opponents' Turns
  edhrec_tag: [Flash]
  enablers:
    regex: ['as though (?:it|they) had flash', 'you may cast (?:creature )?spells as though']
    keywords: [Flash]
  payoffs:
    regex: ['whenever you cast (?:a|your first) spell during an opponent''s turn', 'during turns other than yours', 'as long as it''s not your turn', 'during each opponent''s turn']
  scryfall: {enabler: 'kw:flash', payoff: 'o:"during an opponent''s turn"'}
  seeds: {enabler: [Leyline of Anticipation, Vedalken Orrery, Emergence Zone, Borne Upon a Wind], payoff: ["Alela, Cunning Conqueror", "Nymris, Oona's Trickster"]}

- id: control
  name: Counterspells / Control
  edhrec_tag: [Control, Counterspells]
  enablers:
    regex: ['counter target (?:\w+ )?(?:spell|activated ability|triggered ability)', '(?:destroy|exile) all', 'return all %ANY%to their owners'' hands']
  payoffs:
    regex: ['whenever (?:a spell or ability you control counters|you counter) a spell']
    keywords: [Ward]
  scryfall: {enabler: '(otag:counterspell or otag:sweeper)'}
  otag: [counterspell, sweeper, removal]
  seeds: {enabler: [Counterspell, Mystic Remora], payoff: ["Baral, Chief of Compliance", "Talrand, Sky Summoner"]}

- id: x-spells
  name: X Spells / Mana Value Matters
  edhrec_tag: [X Spells]
  enablers: {structured: 'mana_cost contains {X}'}
  payoffs:
    regex: ['whenever you cast a spell with mana value \d+ or greater', '(?:double|twice) the value of x']
    keywords: [Increment, Opus]
  scryfall: {enabler: 'm:{X}'}
  seeds: {enabler: [Hydroid Krasis, Genesis Wave, Finale of Devastation, Walking Ballista, Torment of Hailfire, Exsanguinate], payoff: [Unbound Flourishing, Rosheen Meanderer, "Zaxara, the Exemplary", "Goreclaw, Terror of Qal Sisma"]}

- id: extra-turns
  name: Extra Turns
  edhrec_tag: [Extra Turns]
  enablers:
    regex: ['take an extra turn']
  glue:
    regex: ['return (?:target )?instant or sorcery']
  scryfall: {enabler: 'o:"take an extra turn"'}
  otag: [extra-turn]
  bracket_sensitive: true
  seeds: {enabler: [Time Warp, Temporal Mastery, Nexus of Fate, Karn's Temporal Sundering, Sage of Hours], glue: [Archaeomancer, Mnemonic Wall, Mizzix's Mastery]}
```

### Permanent-type engine: artifacts, enchantments, lands and mana

```yaml
themes:
- id: artifacts
  name: Artifacts Matter
  edhrec_tag: [Artifacts, Affinity]
  enablers:
    type_line: [Artifact]
    keywords: [Fabricate, Improvise, Affinity]
  payoffs:
    regex: ['whenever (?:an|another|one or more) (?:nontoken )?artifacts?(?: you control)? %ENTERS%', 'whenever you cast an artifact spell', 'for each artifact you control']
    keywords: [Metalcraft, Affinity]
  scryfall: {payoff: '(o:/whenever (you cast )?an artifact (spell|you control|enters)/ or o:"for each artifact you control")'}
  seeds: {enabler: [Sol Ring, Ornithopter, Thopter Spy Network, Whirler Rogue], payoff: ["Sai, Master Thopterist", "Padeem, Consul of Innovation", "Emry, Lurker of the Loch", Cranial Plating, Reckless Fireweaver]}

- id: artifact-tokens
  name: Treasure / Clues / Food / Blood / Maps / Powerstones / Heartwood
  edhrec_tag: [Treasure, Clues, Food, Blood]
  enablers:
    regex: ['create %NUM% (?:tapped )?(?:treasure|clue|food|blood|map|powerstone|incubator|gold|junk|lander|heartwood) tokens?']
    keywords: [Treasure, Food, Investigate, Blood]
    structured: 'all_parts[component=token] whose token type_line contains Artifact'
  payoffs:
    regex: ['whenever (?:you sacrifice )?(?:a|an|another) (?:treasure|clue|food|artifact)', 'whenever you create %ANY%token', 'for each (?:treasure|food|clue)']
  scryfall: {enabler: 'o:/create .* (Treasure|Clue|Food|Blood|Map) token/'}
  seeds: {enabler: [Tireless Tracker, "Gyome, Master Chef", Goldspan Dragon, Revel in Riches], payoff: [Pitiless Plunderer, Xorn, "Prosper, Tome-Bound", "Jolene, the Plunder Queen", "Chatterfang, Squirrel General"], glue: [Academy Manufactor]}

- id: vehicles
  name: Vehicles / Crew / Station
  edhrec_tag: [Vehicles]
  enablers:
    regex: ['crews? vehicles? as though', 'becomes an artifact creature']
    type_line: [Vehicle, Spacecraft]
    keywords: [Crew, Station]
  payoffs:
    regex: ['whenever (?:a|one or more) vehicles? (?:you control )?(?:attacks?|becomes crewed)', 'whenever you crew', 'vehicles you control (?:get|have)']
    keywords: [Exhaust]
  scryfall: {enabler: 't:vehicle', payoff: 'o:"vehicles you control"'}
  seeds: {enabler: [Smuggler's Copter, The Indomitable], payoff: ["Depala, Pilot Exemplar", "Greasefang, Okiba Boss", "Shorikai, Genesis Engine"]}

- id: enchantress
  name: Enchantments / Enchantress
  edhrec_tag: [Enchantress]
  enablers: {type_line: [Enchantment]}
  payoffs:
    regex: ['whenever you cast an enchantment spell', 'whenever (?:an|another) enchantment (?:you control )?%ENTERS%', 'for each enchantment you control']
    keywords: [Constellation, Eerie]
  scryfall: {payoff: 'o:/whenever (you cast an enchantment spell|an(other)? enchantment (you control )?enters)/'}
  seeds: {enabler: [Utopia Sprawl, Wild Growth, Ghostly Prison], payoff: [Argothian Enchantress, Enchantress's Presence, Satyr Enchantress, Setessan Champion, "Sythis, Harvest's Hand"]}

- id: rooms
  name: Rooms / Eerie
  edhrec_tag: [Rooms]
  enablers: {type_line: [Room]}
  payoffs:
    regex: ['whenever you (?:fully )?unlock', 'fully unlock']
    keywords: [Eerie]
  scryfall: {enabler: 't:room', payoff: '(o:"whenever you unlock a door" or o:"fully unlock")'}
  seeds: {enabler: [Unholy Annex // Ritual Chamber], payoff: [Marina Vendrell]}

- id: legends
  name: Legends Matter / Historic
  edhrec_tag: [Legends, Historic]
  enablers: {structured: 'type_line contains Legendary, or is:historic (artifact, legendary or Saga)'}
  payoffs:
    regex: ['whenever you cast a (?:historic|legendary) spell', 'legendary (?:creatures|spells|permanents) you control', 'for each legendary']
  glue:
    regex: ['legend rule%ANY%doesn''t apply']
  scryfall: {payoff: 'o:/whenever you cast a (historic|legendary) spell/'}
  seeds: {payoff: ["Jhoira, Weatherlight Captain", "Raff Capashen, Ship's Mage", "Kethis, the Hidden Hand", "Jodah, the Unifier", Arvad the Cursed]}

- id: snow
  name: Snow
  edhrec_tag: [Snow]
  enablers: {type_line: [Snow]}
  payoffs:
    regex: ['\{S\}', 'for each (?:other )?snow permanent', 'snow mana']
  scryfall: {enabler: 't:snow', payoff: '(o:{S} or o:"snow permanent")'}
  seeds: {payoff: [Abominable Treefolk, "Narfi, Betrayer King", Marit Lage's Slumber, Rime Tender, "Jorn, God of Winter"]}

- id: face-down
  name: Face-down (Morph / Disguise / Cloak / Manifest)
  edhrec_tag: [Morph]
  enablers:
    regex: ['\bmanifest(?: dread)?\b', '\bcloak\b']
    keywords: [Morph, Megamorph, Disguise, Cloak, Manifest, Manifest dread]
  payoffs:
    regex: ['whenever (?:a|another) (?:permanent|creature) (?:you control )?is turned face up', 'face-down (?:creatures|permanents) (?:you control )?(?:get|have)']
  scryfall: {enabler: '(kw:morph or kw:disguise or o:manifest or o:cloak)'}
  seeds: {payoff: ["Kadena, Slinking Sorcerer", "Yarus, Roar of the Old Gods", Ixidron, Trail of Mystery]}

- id: activated-abilities
  name: Activated Abilities / Untap
  edhrec_tag: [Activated Abilities, Tap / Untap]
  enablers:
    regex: ['\{T\}:', '\{Q\}']
    keywords: [Exhaust]
  payoffs:
    regex: ['untap (?:target|all|another) (?:creature|permanent|artifact)s?', 'activated abilities %ANY%cost \{\d\} less', 'whenever you activate an ability', 'copy target activated ability']
  otag: [untapper]
  seeds: {payoff: [Pemmin's Aura, Thousand-Year Elixir, Illusionist's Bracers, Rings of Brighthearth, Training Grounds, "Zirda, the Dawnwaker"]}

- id: landfall
  name: Landfall / Lands Matter
  edhrec_tag: [Landfall, Lands Matter, Land Animation]
  enablers:
    regex: ['play (?:an|two) additional lands?', 'search your library for %ANY%land cards?%ANY%onto the battlefield', 'play lands from your graveyard', 'return %ANY%land cards?%ANY%to the battlefield']
    keywords: [Earthbend]   # confirm catalog string
  payoffs:
    regex: ['whenever a land (?:you control )?%ENTERS%', 'for each land you control', 'lands you control (?:have|are)']
    keywords: [Landfall]
  glue:
    regex: ['target land (?:you control )?becomes a %ANY%creature']
  scryfall: {enabler: 'o:"additional land"', payoff: 'o:/whenever a land (you control )?enters/'}
  otag: [landfall, extra-land, land-ramp]
  seeds: {enabler: ["Azusa, Lost but Seeking", Exploration, Oracle of Mul Daya, Crucible of Worlds, Ramunap Excavator, Harrow], payoff: [Avenger of Zendikar, Lotus Cobra, "Tatyova, Benthic Druid", "Omnath, Locus of Creation", Scute Swarm]}

- id: ramp
  name: Ramp / Big Mana
  edhrec_tag: [Ramp, Big Mana, Mana Rocks, Mana Dorks]
  enablers:
    regex: ['add \{[WUBRGC]\}', 'search your library for %ANY%land%ANY%onto the battlefield', 'twice as much %ANY%mana']
    structured: 'nonland card with non-null produced_mana'
  payoffs:
    structured: 'cmc >= 7, or mana_cost contains {X}, or a repeatable mana sink'
  scryfall: {enabler: '(otag:ramp or (t:artifact o:"{T}: Add"))'}
  otag: [ramp, mana-rock, mana-dork, land-ramp, ritual, cost-reducer, extra-land]
  note: 'present in almost every deck; treat as a role first and a theme (Big Mana) only when payoffs exist'
  seeds: {enabler: [Sol Ring, Arcane Signet, Cultivate, Nature's Lore, Mana Reflection, Nyxbloom Ancient], payoff: [Hydroid Krasis, Finale of Devastation, Torment of Hailfire]}

- id: colors-matter
  name: Colors Matter (Domain / Converge / Devotion / Vivid)
  edhrec_tag: [Devotion, Multicolor Matters]
  payoffs:
    regex: ['for each color among permanents you control', 'for each color', 'devotion to', 'for each basic land type']
    keywords: [Domain, Converge, Vivid]
  scryfall: {payoff: '(o:"for each color" or o:domain or o:converge or o:"devotion to")'}
  scoring_note: 'domain = basic land types across deck lands; converge/for each color = colors in commander identity; devotion = pips on deck permanents'

- id: commander-matters
  name: Commander Matters
  edhrec_tag: [Commander Matters]
  payoffs:
    regex: ['commanders? you control', 'your commander', 'command zone', 'commander tax']
  seeds: {payoff: [Command Beacon]}
  scoring_note: 'worth more when the commander is expensive or often removed'
```

### Table engine: politics, restriction and randomness

```yaml
themes:
- id: group-hug
  name: Group Hug / Politics
  edhrec_tag: [Group Hug, Politics, Voting]
  enablers:
    regex: ['each player (?:draws|may draw|may put a land|adds?)', 'target (?:opponent|player) (?:draws|creates|gains)', 'council''s dilemma', 'will of the council']
    keywords: [Gift]
  payoffs:
    regex: ['whenever an opponent (?:draws|casts)', 'for each opponent']
  scryfall: {enabler: 'o:/each player (draws|may draw|adds)/'}
  seeds: {enabler: [Howling Mine, Rites of Flourishing, Kynaios and Tiro of Meletis, Collective Voyage, Phelddagrif], payoff: [Kami of the Crescent Moon, "Zedruu the Greathearted", "Edric, Spymaster of Trest"]}

- id: monarch
  name: Monarch / Initiative / Dungeons
  edhrec_tag: [Monarch, Dungeon]
  enablers:
    regex: ['you become the monarch', 'you take the initiative', 'venture into the dungeon']
  payoffs:
    regex: ['if you''re the monarch', 'whenever you (?:venture|complete a dungeon)']
  scryfall: {enabler: '(o:"become the monarch" or o:"take the initiative")'}
  seeds: {enabler: [Palace Jailer, Queen Marchesa, Court of Grace, Undermountain Adventurer, White Plume Adventurer, Seasoned Dungeoneer], payoff: [Court of Cunning, "Acererak the Archlich"]}

- id: stax
  name: Stax / Prison
  edhrec_tag: [Stax, Prison, Hatebears]
  enablers:
    regex: ['(?:spells|abilities)%ANY%cost \{\d\} more', '(?:don''t|doesn''t) untap during', 'can''t cast more than one spell', 'players can''t search']
  otag: [tax]
  bracket_sensitive: true
  seeds: {enabler: [Rule of Law, Winter Orb, "Thalia, Guardian of Thraben", Archon of Emeria]}

- id: pillow-fort
  name: Pillowfort
  edhrec_tag: [Pillow Fort]
  payoffs:
    regex: ['creatures can''t attack you (?:or planeswalkers you control )?unless their controller pays', 'can''t attack you', 'prevent all (?:combat )?damage that would be dealt to you']
  scryfall: {payoff: 'o:"can''t attack you"'}
  seeds: {payoff: [Propaganda, Ghostly Prison, Sphere of Safety, Solitary Confinement, Crawlspace, Norn's Annex]}

- id: land-destruction
  name: Land Destruction
  edhrec_tag: [Land Destruction]
  enablers:
    regex: ['destroy all lands', 'each player sacrifices %ANY%lands']
  otag: [mass-land-denial]
  bracket_sensitive: true   # mass land denial is barred in Brackets 1-3
  seeds: {enabler: [Armageddon, Ravages of War]}

- id: theft
  name: Theft / Steal
  edhrec_tag: [Theft]
  enablers:
    regex: ['gain control of (?:target|all|each)', 'you may cast (?:spells|cards)%ANY%you don''t own', 'untap (?:it|that creature)%ANY%gains haste']
  payoffs:
    regex: ['spells? you don''t own', '(?:permanents|cards) you control but don''t own']
  scryfall: {enabler: 'o:"gain control of target"'}
  otag: [theft]
  seeds: {enabler: [Treachery, Control Magic, Act of Treason, "Gonti, Lord of Luxury", Hellkite Tyrant, Thieving Skydiver], payoff: ["Thada Adel, Acquisitor", Hostage Taker, Brazen Collector]}

- id: chaos
  name: Chaos / Coin Flips / Dice
  edhrec_tag: [Chaos, Coin Flip, Die Roll]
  enablers:
    regex: ['flip a coin', 'roll (?:a|two|\w+) (?:six-sided|d\d+|\w+-sided) dic?e']
  payoffs:
    regex: ['whenever you (?:win a coin flip|roll (?:a|one or more) dic?e)', '\breroll\b', 'ignore the result']
  seeds: {enabler: [Krark's Thumb, "Okaun, Eye of Chaos", "Zndrsplt, Eye of Wisdom"], payoff: [Ancient Copper Dragon, "Vrondiss, Rage of Ancients"]}

- id: typal
  name: Typal (Tribal) - template, instantiated per creature subtype
  edhrec_tag: ['per type, from edhrec.com/typal']
  definition: 'see the typal block in the next section'
```

Set mechanics from 2025 and 2026 slot into these themes rather than becoming new ones. Lorwyn Eclipsed (January 2026) brought **Blight N** (put N −1/−1 counters on your own creature, sometimes as a cost), **Vivid** (counts colors among your permanents), and returned the Kindred card type and changelings ([MTG Wiki: Lorwyn Eclipsed](https://mtg.wiki/page/Lorwyn_Eclipsed)). Secrets of Strixhaven (April 2026) added **Prepare, Repartee, Opus, Infusion, Increment and Paradigm** ([Hipsters of the Coast](https://www.hipstersofthecoast.com/2026/03/everything-you-need-to-know-about-mtgs-secrets-of-strixhaven/)); Reality Fracture (October 2026) added **Empower Jace** and **Heartwood** mana tokens ([Wizards: Reality Fracture Mechanics](https://magic.wizards.com/en/news/feature/reality-fracture-mechanics)). EDHREC's 2025 mechanics roundup covers **Mayhem, Station, Warp, Airbend and Earthbend**, including cited chains such as Warp plus Starfield Vocalist plus Impact Tremors and Earthbend infinite combos with landfall commanders ([EDHREC: Top 5 Mechanics of 2025](https://edhrec.com/articles/the-top-5-mtg-mechanics-of-2025)). The Tarkir: Dragonstorm and Aetherdrift mappings for Mobilize, Behold, Flurry, Renew and Speed come from researcher knowledge rather than a fetched source and should be confirmed.

```yaml
mechanic_map:   # mechanic -> theme ids
  Blight: [minus-1-minus-1-counters, aristocrats]
  Vivid: [colors-matter]
  Prepare: [exile-cast, blink]
  Repartee: [spellslinger, voltron]
  Opus: [spellslinger, ramp, x-spells]
  Infusion: [lifegain]
  Increment: [plus-1-plus-1-counters, x-spells]
  Paradigm: [spellslinger, exile-cast]
  Book: [artifacts]
  Empower: [superfriends, proliferate]
  Heartwood: [ramp, artifact-tokens, artifacts]
  Station: [vehicles, power-matters, proliferate]
  Warp: [exile-cast, blink]
  Lander: [artifact-tokens, landfall]
  Mayhem: [discard, self-mill]
  Airbend: [blink, exile-cast, control]
  Earthbend: [landfall, plus-1-plus-1-counters]
  Mobilize: [tokens, attack-triggers]        # unverified mapping
  Harmonize: [self-mill, power-matters]
  Endure: [plus-1-plus-1-counters, tokens]
  Behold: [typal]                            # unverified mapping
  Exhaust: [activated-abilities, vehicles]
  Offspring: [tokens, blink, clones]
  Gift: [group-hug]
```

Themes chain into each other, which gives the scorer a way to reward a candidate that serves a neighbor of the deck's main theme. No published source gives a measured theme-to-theme matrix, so the weights below are researcher judgment (1.0 strong chain, 0.75 common, 0.5 occasional) that could later be replaced by counting shared cards across EDHREC theme pages.

```yaml
adjacency:   # symmetric unless marked '->'
  - [tokens, aristocrats, 1.0, '->']
  - [aristocrats, lifedrain, 1.0, '->']
  - [lifedrain, lifegain, 1.0]
  - [tokens, blink, 0.75]                 # each token entering feeds ETB payoffs
  - [artifact-tokens, aristocrats, 0.75, '->']
  - [artifact-tokens, artifacts, 0.75, '->']
  - [plus-1-plus-1-counters, proliferate, 1.0]
  - [minus-1-minus-1-counters, proliferate, 0.75]
  - [minus-1-minus-1-counters, infect, 0.75]
  - [superfriends, proliferate, 1.0]
  - [sagas, proliferate, 0.5, '->']
  - [discard, reanimator, 1.0, '->']
  - [cycling, discard, 1.0]
  - [self-mill, reanimator, 1.0, '->']
  - [self-mill, spellslinger, 0.75, '->']  # flashback
  - [self-mill, landfall, 0.5, '->']
  - [landfall, ramp, 1.0]
  - [landfall, tokens, 0.5, '->']
  - [blink, clones, 0.75]
  - [tokens, clones, 0.75]
  - [spellslinger, cycling, 0.75]
  - [spellslinger, flash, 0.75]
  - [spellslinger, control, 0.75]
  - [spellslinger, tokens, 0.75, '->']
  - [spellslinger, lifedrain, 0.75, '->']
  - [cascade, spellslinger, 0.5, '->']
  - [exile-cast, theft, 0.75]
  - [exile-cast, artifact-tokens, 0.5, '->']
  - [voltron, artifacts, 0.5]
  - [voltron, enchantress, 0.75]
  - [enchantress, pillow-fort, 0.75]
  - [pillow-fort, superfriends, 0.75]
  - [pillow-fort, control, 0.75]
  - [wheels, group-hug, 0.75]
  - [wheels, lifedrain, 0.75, '->']
  - [goad, pillow-fort, 0.75]
  - [goad, group-hug, 0.75]
  - [goad, monarch, 0.75]
  - [extra-combats, attack-triggers, 1.0]
  - [extra-combats, voltron, 0.75]
  - [vehicles, power-matters, 0.75]
  - [vehicles, artifacts, 0.75]
  - [typal, tokens, 0.5]
  - [ramp, x-spells, 0.75]
  - [ramp, sneak-attack, 0.75]
  - [sneak-attack, reanimator, 0.75]
  - [toughness-matters, ramp, 0.75]        # walls that tap for mana
  - [theft, aristocrats, 0.75, '->']
  - [mill, landfall, 0.5]
  - [mill, self-mill, 0.5]
chains:   # three-step chains worth modeling explicitly
  - [tokens, aristocrats, lifedrain]
  - [discard, reanimator, blink]
  - [ramp, landfall, tokens]
  - [spellslinger, tokens, attack-triggers]
  - [artifact-tokens, artifacts, aristocrats]
  - [blink, 'doubler:etb-trigger', lifedrain]
```

## Typal, card-type and keyword axes only count above a density threshold

These axes describe what a card **is**; they become synergy only when the deck has enough of the matching thing. The rename history matters for patterns: R&D adopted "typal" as internal shorthand in mid-2023, and the card type Tribal was renamed **Kindred** (it never says "typal" on cards); newer typal cards affect only their controller's creatures, while older lords were symmetric ([MTG Wiki: Typal](https://mtg.wiki/page/Typal)). The rename reached MTG Arena on December 12, 2023, alongside Naga becoming Snake ([AetherHub](https://aetherhub.com/Article/WOTC-Replaces-Several-MTG-Abilities-Card-Types-And-Subtypes-With-New-Names)). Today **73** Commander-legal cards are Kindred, **62** have changeling, **91** say "choose a creature type", and only **3** count "for each creature type" ([Scryfall t:kindred](https://scryfall.com/search?q=t%3Akindred+f%3Acommander), [changeling](https://scryfall.com/search?q=keyword%3Achangeling+f%3Acommander), [choose a creature type](https://scryfall.com/search?q=o%3A%22choose+a+creature+type%22+f%3Acommander)). Typal is also the most popular onramp: EDHREC counts **19,969** Dragon decks, **15,664** Elves and **14,460** Zombies, but some "typal" entries are other strategies wearing a costume, such as Saprolings (tokens), Hydras (counters) and Eldrazi (colorless ramp) ([EDHREC Typal](https://edhrec.com/typal)). Elvish Archdruid shows the canonical wording: "Other Elf creatures you control get +1/+1. {T}: Add {G} for each Elf you control" ([Scryfall: Elvish Archdruid](https://api.scryfall.com/cards/named?exact=Elvish%20Archdruid)).

```yaml
typal:
  detection:
    - 'commander type_line has subtype T, or commander text names T, or commander says "choose a creature type"'
    - 'or subtype T covers >= 30% of the deck''s creatures (practitioner threshold)'
    - 'verify real T-payoff text exists before giving typal weight (Saproling, Hydra, Eldrazi decks often lack it)'
  patterns:
    lord:           '(?:other )?%TYPE%(?: creatures?)? you control (?:get|have|gain)'
    lord_symmetric: '(?:all|other) %TYPE%(?: creatures)? get'      # older cards; also buffs opponents' creatures of T
    enters:         'whenever (?:a|an|another|one or more) (?:nontoken )?%TYPE%(?: you control)? %ENTERS%'
    cast:           'whenever you cast an? %TYPE% (?:creature )?spell'
    count:          ['for each %TYPE% (?:you control|on the battlefield)', 'number of %TYPE% you control']
    cost:           '%TYPE% spells you cast cost'
    tutor:          'search your library for an? %TYPE% (?:creature )?card'
    behold:         'behold an? %TYPE%'
    generic_payoff: {all: ['choose a creature type', 'of the chosen type']}   # fits any typal deck; weak signal
    omni_type:      ['is every creature type', '(?:gain|have) all creature types', 'in addition to (?:its|their) other (?:creature )?types']
    omni_keywords:  [Changeling]
    producer:       'all_parts[component=token] whose token type_line contains T'
  irregular_plurals: {Elf: Elves, Dwarf: Dwarves, Wolf: Wolves, Fungus: Fungi, Mouse: Mice, Octopus: Octopi, Sphinx: Sphinxes, Fox: Foxes, Ox: Oxen, Pegasus: Pegasi}
  singular_source: 'https://api.scryfall.com/catalog/creature-types'
  false_positive_words: [Human, Spirit, Construct, Advisor, Scout, Rogue, Citizen, Child, Ally]   # require type context; block "non-Human", "Spider-Man"
  support_tiers:   # researcher judgment combining EDHREC deck counts and payoff density
    tier1: [Dragon, Elf, Zombie, Vampire, Goblin, Human, Angel, Merfolk, Sliver, Wizard, Dinosaur]
    tier2: [Cat, Pirate, Faerie, Knight, Elemental, Rat, Demon, Soldier, Spirit, Bird, Ninja, Cleric, Warrior, Squirrel, Ally, Eldrazi, Phyrexian, Hydra]
    tier3: [Dwarf, Insect, Spider, Frog, Dog, Rogue, Horror, Shapeshifter, Mutant, Assassin, Saproling]
```

Card-type payoffs follow five templates, and live counts show which are real axes and which are nearly empty. Among Commander-legal cards, "whenever you cast an instant or sorcery spell" appears on **144**, "whenever a land you control enters" (the Landfall template) on **210**, "for each artifact you control" on **39**, and Vehicle payoffs on **30**; Class payoffs worded "class you control" and battle payoffs worded "battles you control" return **zero**, so those axes barely exist ([instant/sorcery](https://scryfall.com/search?q=o%3A%22whenever+you+cast+an+instant+or+sorcery+spell%22+f%3Acommander), [landfall](https://scryfall.com/search?q=o%3A%22whenever+a+land+you+control+enters%22+f%3Acommander), [artifacts](https://scryfall.com/search?q=o%3A%22for+each+artifact+you+control%22+f%3Acommander), [class](https://scryfall.com/search?q=o%3A%22class+you+control%22+f%3Acommander), [battles](https://scryfall.com/search?q=o%3A%22battles+you+control%22+f%3Acommander)). Phrases like "enchanted creature" (1,056 cards) and "equipped creature" (665) mostly mark the Auras and Equipment themselves, so they identify producers, not payoffs.

```yaml
card_type_axes:
  kinds: [artifact, enchantment, land, creature, planeswalker, equipment, aura, vehicle, saga, room, legendary, historic, snow, instant, sorcery, noncreature]
  templates:
    enters: 'whenever (?:a|an|another|one or more) (?:nontoken )?%KIND%s?(?: you control)? %ENTERS%'
    count:  ['for each %KIND% you control', 'the number of %KIND%s you control']
    anthem: '%KIND%s you control (?:get|have)'
    cast:   'whenever you cast (?:a|an) %KIND% spell'
    cost:   '%KIND% spells you cast cost \{\d\} less'
    graveyard_count: '%KIND% cards? in your graveyard'
  density_gate: 'score a type payoff by (deck count of that kind / nonland deck size); ignore below a tunable floor'
  spellslinger_rule_of_thumb: '25+ instants and sorceries (unsourced practitioner figure)'
  historic: 'artifact OR legendary OR Saga (Scryfall is:historic)'
  background: 'commander keyword "Choose a background" pairs with type_line "Legendary Enchantment - Background"'
```

Keywords need two layers because the `keywords` field only tells you what a card has. Odric, Lunarch Marshal names thirteen keywords in its text yet has an empty `keywords` array, and **192** Commander-legal cards grant common combat keywords through "creatures you control have…" text ([Scryfall: Odric](https://api.scryfall.com/cards/named?exact=Odric,%20Lunarch%20Marshal), [flying payoffs](https://scryfall.com/search?q=o%3A%22creatures+you+control+with+flying%22+f%3Acommander)). Keyword counters are a rules object of their own: a keyword counter grants its keyword, and the allowed set is flying, first strike, double strike, deathtouch, decayed, exalted, haste, hexproof, indestructible, lifelink, menace, reach, shadow, trample and vigilance ([MTG Wiki: Keyword counter](https://mtg.wiki/page/Keyword_counter)). Pairs like lifelink plus "whenever you gain life" (96 cards) are real interactions; two fliers sitting side by side are not ([whenever you gain life](https://scryfall.com/search?q=o%3A%22whenever+you+gain+life%22+f%3Acommander)).

```yaml
keyword_axes:
  layers:
    has:     'keywords[] contains K'
    grants:  '(?:have|has|gain|gains|get) %ANY%\bK\b'   # scope to "creatures you control", "target creature", "equipped creature"
    cares:   ['with K', 'has K']                       # in a condition clause
  synergy_whitelist: [Flying, First strike, Double strike, Deathtouch, Lifelink, Trample, Menace, Haste, Vigilance, Reach, Hexproof, Indestructible, Infect, Toxic, Prowess, Ward, Skulk, Shadow, Horsemanship, Fear, Intimidate, Landwalk]
  ignore_for_synergy: [Transform, Partner, Companion, Enchant, Equip, Crew, Cycling, Kicker]   # mechanics, not combat synergy
  keyword_pairs:
    - {a: Deathtouch, b: 'deals 1 damage to (?:any target|target creature)|fights|damage equal to its power', why: 'deathtouch applies to any damage'}
    - {a: Lifelink, b: 'whenever you gain life|if you gained life this turn'}
    - {a: Trample, b: 'gets \+X/\+0|double its power|\+1/\+1 counter'}
    - {a: Double strike, b: 'equipped creature gets|enchanted creature gets|deals combat damage to a player'}
    - {a: Haste, b: 'whenever %ANY%attacks|when(?:ever)? ~ %ENTERS%'}
  keyword_to_event:   # cheap, reliable structured signals
    Treasure: [token-created, sacrifice, mana-produced]
    Food: [token-created, sacrifice, life-gained]
    Investigate: [token-created, sacrifice, card-drawn]
    Blood: [token-created, discard]
    Landfall: {consumes: land-enters}
    Mill: {produces: card-to-graveyard}
    Surveil: {produces: card-to-graveyard}
    Dredge: {produces: card-to-graveyard}
    Proliferate: {multiplies: counter-placed}
    Afterlife: {produces: token-created}
    Fabricate: {produces: [token-created, counter-placed]}
    Amass: {produces: [token-created, counter-placed]}
    Incubate: {produces: token-created}
    Populate: {produces: token-created}
    Exploit: {produces: [sacrifice, dies]}
    Casualty: {produces: [sacrifice, dies]}
    Emerge: {produces: sacrifice}
    Devour: {produces: sacrifice}
    Bargain: {produces: sacrifice}
    Persist: {produces: dies}
    Undying: {produces: dies}
    Blitz: {produces: dies}
    Decayed: {produces: dies}
    Prowess: {consumes: spell-cast}
    Magecraft: {consumes: spell-cast}
    Constellation: {consumes: etb}
    Morbid: {consumes: dies}
    Raid: {consumes: attack}
    Battalion: {consumes: attack}
    Exert: {consumes: attack}
    Connive: {produces: [card-drawn, discard]}
    Madness: {consumes: discard}
    Cascade: {produces: spell-cast}
    Discover: {produces: spell-cast}
```

Color and mana-value axes are real but narrow. Commander-legal counts are **34** for "for each color", **56** for domain, **28** for converge and **61** for "devotion to", and **152** cards say "spells you cast cost" ([devotion](https://scryfall.com/search?q=o%3A%22devotion+to%22+f%3Acommander), [cost reducers](https://scryfall.com/search?q=o%3A%22spells+you+cast+cost%22+f%3Acommander)). A cost reducer naming the deck's type ("Dragon spells you cast cost…") is a strong signal; a generic one is mostly shape fit.

## Producer-consumer events and doublers carry the strongest signal

The most precise synergy signal is a **directional match on a shared game event**. If the deck has fifteen ways to make creatures die and a candidate says "whenever a creature you control dies", that is a direct mechanical interaction; two cards that both have flying are just similar. Doublers come in two kinds that must be kept apart. **Trigger doublers** use one template, "If [event] causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time", and multiply the event's *consumers*: Panharmonicon covers an artifact or creature entering, Elesh Norn, Mother of Machines covers any permanent entering (and shuts off opponents' enter triggers), Teysa Karlov and Drivnod cover a creature dying, and Isshin covers a creature attacking ([Panharmonicon](https://api.scryfall.com/cards/named?exact=Panharmonicon), [Elesh Norn](https://api.scryfall.com/cards/named?exact=Elesh%20Norn,%20Mother%20of%20Machines), [Teysa Karlov](https://api.scryfall.com/cards/named?exact=Teysa%20Karlov), [Isshin](https://api.scryfall.com/cards/named?exact=Isshin,%20Two%20Heavens%20as%20One)); **38** Commander-legal cards say "triggers an additional time" ([Scryfall search](https://scryfall.com/search?q=o%3A%22triggers+an+additional+time%22+f%3Acommander)). **Replacement doublers** multiply the event's *producers*: Parallel Lives and Anointed Procession double tokens, Doubling Season doubles tokens and counters, and Hardened Scales adds one +1/+1 counter ([Parallel Lives](https://api.scryfall.com/cards/named?exact=Parallel%20Lives), [Doubling Season](https://api.scryfall.com/cards/named?exact=Doubling%20Season), [Hardened Scales](https://api.scryfall.com/cards/named?exact=Hardened%20Scales)).

The rules details matter for scoring. Panharmonicon does not double "enters with counters" replacement effects, and **two Panharmonicons give three triggers, not four**; Doubling Season does double counters a permanent enters with and planeswalker starting loyalty, but **not loyalty-ability costs**, while two copies give ×4 ([Panharmonicon rulings](https://api.scryfall.com/cards/998d0cc8-ca2a-41c3-ab65-d05c26ab8278/rulings), [Doubling Season rulings](https://api.scryfall.com/cards/f2c4f80e-84a0-463b-82c3-5c6503809351/rulings)). Torpor Orb stops enter triggers but leaves replacement effects and "as this enters" effects untouched ([Torpor Orb rulings](https://api.scryfall.com/cards/dbf02a38-d10d-463e-ab99-e7fd848a1bd3/rulings)). Sanguine Bond triggers once per life-gain *event*, so "gain 1 life for each" is one event while each lifelink creature dealing combat damage is separate ([Sanguine Bond rulings](https://api.scryfall.com/cards/ad4de9f1-7a39-45af-828e-c59234d9e9b9/rulings)). The tagger therefore needs three classes of text: **triggered** ("when/whenever/at"), **replacement** ("if … would … instead", "enters with"), and **static**.

Specificity varies enormously, so phrases need weighting by rarity. "Whenever one or more tokens" appears on **9** cards and "whenever you create" on **5**, while "dies" appears on **1,260** and "put a +1/+1 counter" on **1,652** ([Scryfall: whenever one or more tokens](https://scryfall.com/search?q=o%3A%22whenever+one+or+more+tokens%22+f%3Acommander), [Scryfall: dies](https://scryfall.com/search?q=o%3Adies+f%3Acommander)). Weighting each phrase by inverse frequency across the card pool (an idea borrowed from search engines, where rare words count more than common ones) keeps broad phrases from swamping the score. Counts marked `(v)` below were verified live; the rest of the wording is templating knowledge to spot-check against bulk data.

```yaml
events:
- id: etb
  producers: ['type_line is a permanent (casting it)', 'create %ANY%tokens?', 'return %ANY%to the battlefield', 'put %ANY%onto the battlefield', 'exile %ANY%return %ANY%to the battlefield']
  consumers: ['when(?:ever)? ~ %ENTERS%', 'whenever (?:a|an|another|one or more) (?:nontoken )?creatures? you control %ENTERS%', 'whenever another creature %ENTERS%']   # (v) 230 / 109 for creature-you-control forms
  consumer_keywords: [Constellation]
- id: dies
  producers: ['sacrifice (?:a|an|another) (?:\w+ )?(?:creature|permanent)s?:', '(?:destroy|exile) (?:all|target)', 'each (?:player|opponent) sacrifices', '\bfights?\b']   # (v) 148 "sacrifice a creature:"
  producer_keywords: [Persist, Undying, Decayed, Blitz, Casualty, Exploit]
  consumers: ['whenever (?:~ or )?(?:a|another|one or more) (?:nontoken )?creatures? (?:you control )?dies?', 'whenever a creature dies']   # (v) 65 / 37
  consumer_keywords: [Morbid]
- id: token-created
  producers: ['create %ANY%tokens?', 'all_parts[component=token]']
  producer_keywords: [Treasure, Food, Investigate, Amass, Incubate, Populate, Fabricate, Afterlife, Offspring, Myriad, Mobilize]
  consumers: ['whenever (?:a|one or more) %ANY%tokens? (?:you control )?%ENTERS%', 'whenever you create', 'creature tokens you control (?:get|have)', 'for each token']   # (v) 9 / 5
  also_counts_as: [etb]
- id: counter-placed
  producers: ['put %NUM% \+1/\+1 counters? on']   # (v) 1,652
  producer_keywords: [Proliferate, Evolve, Outlast, Adapt, Bolster, Training, Backup, Modular]
  consumers: ['whenever one or more \+1/\+1 counters are put on', 'for each creature you control with a \+1/\+1 counter', 'with (?:a|one or more) counters? on (?:it|them)']   # (v) 27
- id: card-drawn
  producers: ['draw %NUM% cards?', 'each player discards their hand, then draws']
  producer_keywords: [Investigate]
  consumers: ['whenever you draw (?:a|your second) card', 'whenever an opponent draws', 'for each card in your hand']   # (v) 117 / 23
- id: spell-cast
  producers: ['type_line Instant or Sorcery (density)', 'copy target %ANY%spell', 'you may cast %ANY%without paying']
  producer_keywords: [Cascade, Discover]
  consumers: ['whenever you cast (?:a|an) (?:instant or sorcery|noncreature|creature|historic|legendary|artifact|enchantment|%TYPE%) spell', 'whenever you cast your second spell each turn', 'whenever you cast a spell that targets']   # (v) 144 / 150 / 62 / 20 / 47 / 67
  consumer_keywords: [Prowess, Magecraft, Storm]
  rule: 'copies are not cast, except where text says "cast or copy" (magecraft)'
- id: land-enters
  producers: ['play (?:an|two) additional lands?', 'search your library for %ANY%land cards?%ANY%onto the battlefield', 'return %ANY%land cards?%ANY%to the battlefield']
  consumers: ['whenever a land (?:you control )?%ENTERS%']   # (v) 210
  consumer_keywords: [Landfall]
- id: life-gained
  producers: ['(?:you )?gain %NUM% life']
  producer_keywords: [Lifelink, Food]
  consumers: ['whenever you gain life', 'if you gained life this turn', 'whenever you gain life for the first time each turn']   # (v) 96
- id: opponent-life-lost
  producers: ['each opponent loses %NUM% life', 'deals %NUM% damage to each opponent']
  producer_keywords: [Extort]
  consumers: ['whenever an opponent loses life', 'whenever a player loses life']   # (v) 6
- id: discard
  producers: ['discard %NUM% cards?', 'draw %ANY%, then discard']
  producer_keywords: [Connive, Cycling]
  consumers: ['whenever you discard', 'whenever (?:a player|an opponent) discards']   # (v) 44
  consumer_keywords: [Madness, Mayhem]
- id: card-to-graveyard
  producers: ['mill %NUM% cards?', 'put the top %NUM% cards %ANY%into your graveyard']
  producer_keywords: [Mill, Surveil, Dredge]
  consumers: ['cards? in your graveyard', 'whenever one or more cards leave your graveyard']   # (v) 24 for leave
  consumer_keywords: [Threshold, Delirium, Descend]
  note: '"whenever you mill" is nearly absent (2 cards); mill payoffs mostly count graveyard size'
- id: cast-from-exile
  producers: [{all: ['exile the top (?:card|%NUM% cards) of your library', 'you may (?:play|cast)']}]
  producer_keywords: [Foretell, Plot, Suspend, Warp, Cascade, Rebound]
  consumers: ['whenever you cast a spell from exile', 'whenever you play a card from exile']   # (v) 11
- id: sacrifice
  producers: ['sacrifice (?:a|an|another) (?:creature|artifact|permanent|land|treasure|food|clue)s?:']   # (v) 148 + 153
  producer_keywords: [Exploit, Casualty, Emerge, Devour, Bargain, Treasure, Food, Investigate]
  consumers: ['whenever you sacrifice']   # (v) 79
- id: attack
  producers: ['(?:have|has|gains?) haste', 'additional combat phase']
  producer_keywords: [Myriad]
  consumers: ['whenever you attack', 'whenever (?:~|a creature you control|one or more creatures you control) attacks?']   # (v) 175 / 46
  consumer_keywords: [Raid, Battalion, Melee, Exalted, Mobilize]
- id: combat-damage-to-player
  producers: ['can''t be blocked']
  producer_keywords: [Flying, Menace, Trample, Shadow, Skulk, Fear, Intimidate, Horsemanship]
  consumers: ['deals combat damage to a player']   # (v) 725
  consumer_keywords: [Ninjutsu]
  multiplier_keywords: [Double strike]
- id: tap-untap
  producers: ['tap an untapped creature you control']
  producer_keywords: [Crew, Convoke, Improvise, Station]
  consumers: ['becomes tapped', 'untap (?:target|all|another)']   # (v) 146
- id: mana-produced
  producers: ['non-null produced_mana']
  producer_keywords: [Treasure]
  consumers: ['whenever you expend', 'spend only mana produced by']   # (v) 12 expend
- id: targeted
  producers: ['type_line Aura or Equipment', 'target creature gets']
  consumers: ['whenever you cast a spell that targets', 'whenever ~ becomes the target']   # (v) 67 / 7
  consumer_keywords: [Heroic, Valiant, Repartee]
- id: opponent-action
  producers: ['opponents (3 in a 4-player pod)']
  consumers: ['whenever an opponent casts', 'whenever an opponent draws']   # (v) 94 / 23

doublers:   # store each as {class, event, object_filter}
  trigger_template: 'if an? ([a-z ]+?) (entering|dying|attacking) causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time'
  trigger_verb_to_event: {entering: etb, dying: dies, attacking: attack}   # capture group 1 = object filter (e.g. "artifact or creature", "permanent", "creature")
  entries:
    - {id: doubler:etb-trigger, class: trigger, event: etb, filter: 'from capture', seeds: [Panharmonicon, "Elesh Norn, Mother of Machines", "Yarok, the Desecrated", Starfield Vocalist]}
    - {id: doubler:death-trigger, class: trigger, event: dies, filter: creature, seeds: [Teysa Karlov, "Drivnod, Carnage Dominus"]}
    - {id: doubler:attack-trigger, class: trigger, event: attack, filter: creature, seeds: ["Isshin, Two Heavens as One"]}
    - {id: doubler:token-replacement, class: replacement, event: token-created, regex: 'it creates twice that many of those tokens instead', seeds: [Parallel Lives, Anointed Procession, Doubling Season]}
    - {id: doubler:counter-replacement, class: replacement, event: counter-placed, regex: ['puts twice that many of those counters on that permanent instead', 'that many plus one \+1/\+1 counters are put on it instead'], seeds: [Doubling Season, Hardened Scales], excludes: 'counters placed as a cost (loyalty abilities)'}
    - {id: doubler:counter-reducer, class: replacement, event: counter-placed, regex: 'that many -1/-1 counters minus one are put on it instead', seeds: [Vizier of Remedies]}
    - {id: doubler:copy-trigger, class: copy, regex: 'copy target (?:activated or )?triggered ability', seeds: [Strionic Resonator]}
    - {id: doubler:copy-activated, class: copy, regex: 'copy (?:that|target) activated ability', seeds: [Rings of Brighthearth]}
  stacking: {trigger: 'n copies -> n+1 triggers', replacement: 'n copies -> 2^n'}
  generic_regex: 'triggers an additional time'   # catch-all, e.g. Ancient Greenwarden (lands), Roaming Throne (typal); exact texts not fetched
```

Scoring follows directly from direction. A trigger doubler on event *e* earns roughly `k × (number of e-consumers in the deck)`; a replacement doubler earns `k × (number of e-producers)`; and because producers feed consumers, effects compound (Anointed Procession doubles tokens, which doubles enter triggers, which Panharmonicon doubles again). Self-only triggers such as "When this creature enters" benefit from blink and doublers but help no other card, so they count as producer-plus-self-consumer.

```yaml
signal_strength:   # researcher judgment; tune against swipe data
  very_strong: ['consumer<->producer on same event with matching object filter', 'doubler whose event has high deck density', 'typal payoff naming T with >= ~15 T creatures or commander is/names T']
  strong:      ['token type match via all_parts', 'card-type payoff above density gate', 'matches the commander''s own consumer text']
  medium:      ['keyword lord x deck keyword count', 'keyword pairs (deathtouch+pinger, lifelink+lifegain, double strike+voltron)', 'color-count payoffs', 'type-named cost reducers']
  weak:        ['generic "choose a creature type" payoffs', 'generic cost reducers', 'mana curve fit', 'X spells without ramp payoffs']
  noise:       ['shared keyword with no payoff', 'shared colors', 'shared mana value', 'produced_mana any-color', 'raw creature/permanent overlap']
  negative:    ['hoser matching a dense deck axis (see nonbos)']
event_score: 'EventFit(c) = sum_e idf(e) * [cons(c,e)*prodDensity(e) + prod(c,e)*consDensity(e) + mult(c,e)*density(e)]'
```

## Combos come from Spellbook, nonbos from symmetry checks

Commander Spellbook already models combos the way the app needs them. A variant lists the **cards it uses**, abstract **templates it requires** ("any sacrifice outlet"), and named **features it produces** ("Infinite colorless mana", "Win the game", "Lock", "Mandatory Loop"); each feature has a status, and **Standalone** marks the "meaningful, usually game-impacting results" ([Spellbook domain model](https://spacecowmedia.github.io/commander-spellbook-backend/domain-model.html), [feature.py](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/models/feature.py)). Variant fields include `uses`, `requires`, `produces`, `identity`, `manaValueNeeded`, `easyPrerequisites`, `notablePrerequisites`, `description`, `popularity`, `salt` and `bracketTag`; card records carry `gameChanger`, `tutor`, `massLandDenial` and `extraTurn` flags ([npm spellbook-client](https://www.npmjs.com/package/@space-cow-media/spellbook-client)). `/find-my-combos` takes GET or POST with plain text or JSON `{"main":[{"card":"Name","quantity":1}],"commanders":[...]}`, needs no login, and groups results into **`included`** and **`almostIncluded`** (plus variants that need different colors or commanders), so "uses minus the deck" on an almost-included variant names the one missing card ([find_my_combos.py](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/views/find_my_combos.py)). The `/variants/?q=` grammar accepts `card="Name"`, `ci<=wbr`, `result:"infinite mana"`, `bracket<=3`, `otag:`, `salt`, and `is:` tags such as `infinite`, `lock`, `mandatory` and `win` ([query grammar](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/parsers/variants_query_grammar.lark), [tags_filters.py](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/transformers/variants_query_filters/tags_filters.py)).

The common combo shapes are worth knowing because they explain why some innocent-looking cards are dangerous. Thassa's Oracle wins if your devotion meets your library size, so Demonic Consultation or Tainted Pact (which exiles the library in a singleton deck) completes it ([Thassa's Oracle](https://scryfall.com/card/thb/73/thassas-oracle)). Kiki-Jiki copies a creature whose enter trigger untaps Kiki-Jiki (Pestermite, Zealous Conscripts) for infinite hasty tokens ([Kiki-Jiki](https://scryfall.com/card/ima/136/kiki-jiki-mirror-breaker)). Devoted Druid plus Vizier of Remedies makes infinite green mana because the untap cost now places zero counters ([Devoted Druid](https://scryfall.com/card/ecc/104/devoted-druid)). Sanguine Bond plus Exquisite Blood is a **mandatory loop** that drains the table, and a mandatory infinite loop nobody can break is a draw ([Sanguine Bond rulings](https://api.scryfall.com/cards/ad4de9f1-7a39-45af-828e-c59234d9e9b9/rulings), [MTG Wiki: Loop](https://mtg.wiki/page/Loop)). Heliod, Sun-Crowned plus Walking Ballista loops lifelink pings into counters ([Heliod](https://scryfall.com/card/cmm/29/heliod-sun-crowned)).

```yaml
combo_layer:
  source: 'json.commanderspellbook.com/variants.json.gz (build time) -> index card_oracle_id -> [variant ids]'
  candidate_completes_combo: 'deck contains all but one card of a variant (uses), color identity fits, and the missing card is the candidate'
  classes:   # map from produced feature names
    determinate-infinite: 'feature name starts with "Infinite"'
    mandatory-loop: 'feature "Mandatory Loop"'
    lock: 'feature "Lock" or skip-turns'
    alt-win: ['Win the game', 'Win the game at the beginning of your next upkeep', 'Each opponent loses the game']
    value-engine: 'no Standalone feature; non-infinite engine'
  combo_weight: {alt-win: 1.0, determinate-infinite: 0.9, mandatory-loop: 0.8, lock: 0.6, value-engine: 0.4}   # starting guesses
  explain_with: [description, easyPrerequisites, notablePrerequisites, produces, bracketTag]
  attribution: 'credit and link commanderspellbook.com; name the app in User-Agent'
```

Nonbos follow one rule with a handful of exceptions. A hoser hurts its own controller when its restricting clause says "players", "each player", "all creatures" or "creatures entering" and the deck relies on the hosed axis; it is **not** a nonbo when the clause says "opponent" or "your opponents". Rest in Peace exiles everything headed to a graveyard, so "dies" never happens and persist, undying and drain triggers all fail ([Rest in Peace rulings](https://api.scryfall.com/cards/d108c2b1-236e-4b8d-8445-d9749ccc4fea/rulings)); Hushbringer stops enter and death triggers but not "whenever you sacrifice" ([Hushbringer](https://api.scryfall.com/cards/named?exact=Hushbringer)); Grafdigger's Cage stops reanimation, flashback-style casting from graveyards and casting from the library, but not lands from the graveyard ([Grafdigger's Cage](https://scryfall.com/card/m20/227/grafdiggers-cage)); Containment Priest exiles your own flickered creatures ([Containment Priest](https://scryfall.com/card/m21/13/containment-priest)); Null Rod and Stony Silence stop your mana rocks, Ashnod's Altar and even equip abilities ([Null Rod](https://scryfall.com/card/vma/278/null-rod)); Solemnity blanks +1/+1 counter decks yet *combos* with persist ([Solemnity rulings](https://api.scryfall.com/cards/0a71fb62-acbd-49f5-842f-0fc9fa48afea/rulings)); Blood Moon strips nonbasic lands of abilities and enter triggers ([Blood Moon rulings](https://api.scryfall.com/cards/d072e9ca-aae7-45dc-8025-3ce590bae63f/rulings)). Two popular "nonbo" examples are wrong: **Notion Thief plus a symmetrical wheel is a combo** because opponents' extra draws go to you, and **Leyline of the Void does not hurt your own self-mill** because it only affects opponents' graveyards ([Notion Thief](https://scryfall.com/card/znc/96/notion-thief), [Leyline of the Void](https://scryfall.com/card/dsk/106/leyline-of-the-void)).

```yaml
nonbos:
  asymmetry_rule: 'if the restricting clause contains "opponent" -> no self-penalty; if it says players / each player / all creatures / creatures entering -> penalty = weight * deck density on the conflicting axis'
  hosers:
    - {id: trigger-stop-etb, regex: 'creatures entering(?: or dying)? don''t cause abilities to trigger', conflicts: [event:etb, theme:blink, theme:clones], seeds: [Torpor Orb, Hushbringer]}
    - {id: trigger-stop-dies, regex: 'dying don''t cause abilities to trigger', conflicts: [event:dies, theme:aristocrats], seeds: [Hushbringer]}
    - {id: graveyard-exile, regex: ['if a card or token would be put into a graveyard from anywhere, exile it instead', 'whenever another card is put into a graveyard from anywhere, exile that card'], conflicts: [event:dies, theme:self-mill, theme:reanimator, theme:aristocrats, keyword:Persist, keyword:Undying, keyword:Flashback, keyword:Escape], helps: [theme:exile-cast], seeds: [Rest in Peace, Planar Void]}
    - {id: graveyard-cast-lock, regex: ['creature cards in graveyards and libraries can''t enter the battlefield', 'players can''t cast spells from graveyards or libraries'], conflicts: [theme:reanimator, theme:self-mill, keyword:Flashback, keyword:Escape, keyword:Jump-start], seeds: [Grafdigger's Cage]}
    - {id: uncast-exile, regex: 'if a nontoken creature would enter and it wasn''t cast, exile it instead', conflicts: [theme:blink, theme:reanimator, theme:sneak-attack], seeds: [Containment Priest]}
    - {id: creature-abilities-off, regex: 'activated abilities of creatures can''t be activated', conflicts: [role:mana-dork, theme:activated-abilities, theme:aristocrats], seeds: [Cursed Totem]}
    - {id: artifact-abilities-off, regex: 'activated abilities of artifacts can''t be activated', conflicts: [role:mana-rock, theme:artifacts, theme:voltron], seeds: [Null Rod, Stony Silence, Collector Ouphe]}
    - {id: counters-off, regex: ['players can''t get counters', 'counters can''t be put on'], conflicts: [theme:plus-1-plus-1-counters, theme:superfriends, theme:energy], helps: [keyword:Persist, keyword:Undying], seeds: [Solemnity]}
    - {id: abilities-stripped, regex: 'all creatures lose all abilities', conflicts: ['creature-heavy decks', theme:typal, theme:keyword-soup], rules_sensitive: true, seeds: [Humility]}
    - {id: nonbasics-to-basics, regex: 'nonbasic lands are (?:mountains|islands|swamps|plains|forests)', conflicts: ['nonbasic land count x off-color share', theme:landfall], seeds: [Blood Moon]}
    - {id: mana-recolor, regex: 'if a land is tapped for mana, it produces \{[WUBRG]\} instead', conflicts: ['multicolor costs'], seeds: [Contamination]}
    - {id: symmetric-mana-denial, regex: ['players can''t untap more than one land', 'players skip their untap steps', 'destroy all lands'], conflicts: ['average MV above ~3 (heuristic)'], bracket_flag: MLD, seeds: [Winter Orb, Stasis, Armageddon]}
    - {id: creature-only-mana, regex: 'spend this mana only to cast creature spells', conflicts: [theme:spellslinger], seeds: [Food Chain]}
    - {id: lifegain-off, regex: ['if a player would gain life, that player gains no life instead', 'players can''t gain life'], conflicts: [theme:lifegain, event:life-gained], seeds: [Sulfuric Vortex]}
    - {id: cant-win, regex: 'you can''t win the game', conflicts: [combo:alt-win, theme:lifedrain], seeds: [Abyssal Persecutor]}
    - {id: attack-cap, regex: ['creatures with power greater than the number of cards in your hand can''t attack', 'creatures you control can''t attack'], conflicts: [theme:voltron, theme:attack-triggers, theme:extra-combats, theme:power-matters], seeds: [Ensnaring Bridge, Glacial Chasm]}
    - {id: symmetric-wipe, regex: ['destroy all artifacts, creatures, and enchantments', '(?:destroy|exile) all creatures', 'each player sacrifices'], conflicts: [theme:tokens, theme:typal], note: 'score as mass disruption role, not synergy', seeds: [Nevinyrral's Disk, Hallowed Burial]}
    - {id: symmetric-tax, regex: 'spells cost \{\d+\} more', conflicts: [theme:spellslinger, 'low-curve decks']}
    - {id: draw-cap, regex: 'each player can''t draw more than one card each turn', conflicts: [theme:wheels, event:card-drawn], verified: false}
  opposed_axes:
    - [plus-1-plus-1-counters, minus-1-minus-1-counters]   # counters annihilate; persist/undying need absence of their counter
    - [cascade, x-spells]
    - [self-mill, 'graveyard-hate otag']
    - [tokens, symmetric-wipe]
  specific_pairs:
    - {a: Melira, Sylvok Outcast, b: Devoted Druid, why: 'Druid untap cost cannot be paid; use Vizier of Remedies instead'}
    - {a: Clone, b: 'own legendary commander', why: 'legend rule; Spark Double and Sakashima avoid it; Kiki-Jiki cannot copy legends'}
    - {a: Shroud, b: [theme:voltron, event:targeted], why: 'shroud blocks your own targeting; hexproof does not'}
    - {a: Pithing Needle, b: 'own commander with activated abilities', why: 'naming shuts off non-mana activated abilities'}
  rules_sensitive_tag: [Humility + Opalescence, Teferi's Protection + life loops]   # flag, do not score
  not_nonbos:   # asymmetric or actually synergistic
    cards: [Leyline of the Void, Dauthi Voidwalker, "Elesh Norn, Mother of Machines", "Erebos, God of the Dead", Tainted Remedy, "Linvala, Keeper of Silence", "Narset, Parter of Veils", Drannith Magistrate, Grand Arbiter Augustin IV, Aven Mindcensor, Stranglehold]
    synergies_mistaken_for_nonbos: ['Notion Thief + Windfall/Wheel of Fortune']
```

## Brackets act as filters and badges, not as score penalties

The official system has five brackets, and its October 21, 2025 update gave each a turn expectation: **Exhibition (1)** at least nine turns, **Core (2)** at least eight, **Upgraded (3)** at least six, **Optimized (4)** at least four, and **cEDH (5)** any turn; the same update **removed tutor restrictions entirely** and untied Core from precons ([Wizards, Oct 21 2025](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-october-21-2025)). Card restrictions remain: Brackets 1–2 allow **no Game Changers** and no intentional two-card infinite combos; Bracket 3 allows **up to three Game Changers** and bans only *early-game* two-card infinites; Brackets 1–3 ban mass land destruction and chained extra turns ([MTG Wiki: Commander Brackets](https://mtg.wiki/page/Commander_Brackets), whose "tutors should be sparse" line is outdated). The February 9, 2026 update added Farewell (Bracket 3+) and Biorhythm to the Game Changers list and promised no bracket-level changes until after at least one MagicCon ([Wizards, Feb 9 2026](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026)); a secondary source reports that the May and June 2026 ban-list updates left brackets and Game Changers alone, consistent with Scryfall still returning **53** ([Kraken the Meta](https://krakenthemeta.com/blog/mtg-commander-brackets/)). Wizards frames brackets as a "tool for pregame conversations", which supports treating them as badges and filters the user controls ([Wizards, Feb 9 2026](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026)).

Commander Spellbook implements a deck-level estimator worth reusing, but it is **stricter than the official text**. Its tags map Ruthless → 4, Spicy and Powerful → 3, Oddball and Core → 2, Exhibition → 1; any single Game Changer yields at least Powerful (3), more than three Game Changers, any mass-land-denial card, two or more extra-turn cards, or any cheap (≤4 mana needed) relevant definitely-two-card combo yields Ruthless (4) ([variant.py estimate_bracket](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/models/variant.py)). Salt is a separate, social signal: EDHREC's 2026 vote drew **2.2 million votes** on a 0–4 scale, topped by Stasis (3.05), Armageddon (2.98) and Winter Orb (2.93), many of which are also mass land denial or stax ([EDHREC Salt Results 2026](https://edhrec.com/articles/salt-vote-results-2026)); Spellbook added a separate 0–4 **combo** salt score in October 2026 ([EDHREC: Spellbook salt](https://edhrec.com/articles/introducing-commander-spellbooks-salt-score)). EDHREC itself says "salt isn't a ban list", so salt should down-rank, not hide ([EDHREC](https://edhrec.com/articles/salt-isnt-a-ban-list)).

```yaml
brackets:
  official:
    1: {name: Exhibition, turns: '>=9', game_changers: 0, two_card_infinites: none, mld: false, extra_turns: none}
    2: {name: Core, turns: '>=8', game_changers: 0, two_card_infinites: none, mld: false, extra_turns: 'low, not chained'}
    3: {name: Upgraded, turns: '>=6', game_changers: '<=3', two_card_infinites: 'not early-game', mld: false, extra_turns: 'low, not chained'}
    4: {name: Optimized, turns: '>=4', game_changers: any, two_card_infinites: any, mld: true, extra_turns: any}
    5: {name: cEDH, turns: any, game_changers: any, two_card_infinites: any, mld: true, extra_turns: any}
    tutors: 'no restriction since 2025-10-21'
  flags:   # shown as badges on the swipe card
    GC: 'card.game_changer == true; show count after adding, e.g. "4th GC -> Bracket 4"'
    MLD: 'otag:mass-land-denial, or Spellbook card.massLandDenial'
    ExtraTurn: 'otag:extra-turn, or Spellbook card.extraTurn; >=2 in deck = chaining risk'
    TwoCardInfinite: 'Spellbook variant with definitelyTwoCard and relevant'
    FastCombo: 'Spellbook combo speed >= 4 (needs <= 4 mana)'
    Lock: 'Spellbook feature Lock / skip turns, or theme:stax'
    HighSalt: 'MTGJSON edhrecSaltiness >= 2.0 (threshold is a starting guess) or Spellbook variant salt'
  spellbook_tag_to_bracket: {Ruthless: 4, Spicy: 3, Powerful: 3, Oddball: 2, Core: 2, Exhibition: 1, Banned: null}
  bracket_after_adding: 'run the local estimator (or POST /estimate-bracket) on deck + candidate and compare with deck alone'
  presets:
    lgs-friendly: {target_bracket: 3, max_game_changers: 3, allow_mld: false, max_extra_turn_cards: 1, two_card_combos: 'only if Spellbook speed <= 3 (needs 5+ mana) or has a notable prerequisite', down_rank: 'high salt AND raises bracket'}
    core:         {target_bracket: 2, max_game_changers: 0, allow_mld: false, two_card_combos: none}
  above_target: 'hide by default; reveal with an "Above your bracket" warning toggle'
```

## One scoring engine drives additions, cuts and swaps

Published recommenders mostly rely on co-occurrence across hundreds of thousands of decklists, and that data wins on raw power. EDHREC replaced its old "synergy" score (a commander's inclusion rate minus the color-identity baseline, which distorted staples like Sol Ring) with **lift**, the observed co-occurrence divided by what independence predicts, computed only within shared color identities and only from decks built after both cards existed; median card-pair lift is **1.58** ([EDHREC "From Synergy to Lift"](https://edhrec.com/articles/from-synergy-to-lift-the-math-behind-edhrecs-new-era)). A collaborative-filtering thesis on roughly 200,000+ scraped Moxfield decks reached **P@10 ≈ 0.58**, meaning about six of its top ten suggestions were cards the real deck ran ([DeNichilo 2025](https://www.ramapo.edu/dmc/wp-content/uploads/sites/361/2025/06/2025-02-MSDS-DeNichilo.pdf)), and an LLM-plus-embedding builder found that popularity-built decks scored highest on power, concluding historical play data is "the best indicator for generating a high power deck" ([EDH-LLM](https://evelynyee.github.io/edh-llm)). None of that corpus is freely downloadable, and training it in a browser is impractical. Rule-based scoring has two advantages that matter for this app: it explains itself, and it works on brand-new cards from day one, consistent with research finding that feature-based card representations are what help on unseen cards ([Bertram et al. 2024](https://arxiv.org/abs/2407.05879v1)). The best quality-for-effort path is therefore rules, roles and curve first, then diversity re-ranking and swipe feedback, with co-occurrence as an optional later add-on.

Role quotas come from The Command Zone's February 2025 "new era" template: **38 lands, at least 10 ramp, 12 card advantage, 12 targeted disruption, 6 mass disruption**, with cards allowed to count in several categories; card selection like Ponder does not count as card advantage, and Propaganda and Cyclonic Rift count as mass disruption ([episode notes](https://www.alanwsmith.com/en/38/z9/2w/vi/)). Sources disagree on plan cards (**30** in one set of notes, consistent with categories overlapping to 108, versus **~22** re-normalized to 100 in another) ([OlliTapio template](https://github.com/OlliTapio/mtg-deck-optimizer/blob/main/command_zone_template.md)); the app should treat quotas as soft targets. Diversity comes from **Maximal Marginal Relevance (MMR)**, which picks each next item by balancing its relevance against its similarity to items already chosen, so the swipe stack does not show twenty near-identical token makers ([Carbonell & Goldstein 1998](https://people.eng.unimelb.edu.au/ammoffat/sigir98/abstracts/carbonell.html)). Explanations should follow existing tools that show the "why", such as Grimoria's difference chips and Recommander's sample sizes ([Grimoria help](https://grimoria.app/help/deckbuilder/card-suggestions)).

```yaml
roles:   # a card may fill several roles
  land: 'type_line contains Land (count MDFC land faces as 0.5, a judgment call)'
  ramp: {otag: [ramp], fallback: ['nonland with non-null produced_mana', 'search your library for %ANY%land%ANY%onto the battlefield', 'play an additional land', 'create %NUM% treasure tokens?']}
  card-advantage: {otag: [card-advantage, draw], exclude_otag_only: [cantrip], fallback: ['draw (?:two|three|four|x|\d+|that many) cards', 'whenever %ANY%draw a card']}
  targeted-disruption: {otag: [spot-removal, counterspell], fallback: ['(?:destroy|exile) target (?:\w+ )?(?:creature|artifact|enchantment|planeswalker|permanent)', 'counter target']}
  mass-disruption: {otag: [sweeper], fallback: ['(?:destroy|exile) all', 'each (?:player|opponent) sacrifices', 'return all %ANY%to their owners'' hands', 'creatures can''t attack you %ANY%unless']}
  protection: {otag: [protection]}
  tutor: {otag: [tutor]}
  recursion: {otag: [recursion]}
role_targets: {land: 38, ramp: 10, card-advantage: 12, targeted-disruption: 12, mass-disruption: 6}   # soft; ramp is a minimum
curve_targets: {0: 0, 1: 9, 2: 18, 3: 15, 4: 10, 5: 5, 6plus: 5}   # nonland cards, Command Zone 2025 per secondary notes

add_score:
  hard_filters:
    - 'color_identity subset of commander identity (union for partners/background)'
    - 'legalities.commander == legal'
    - 'not already in deck; not swiped left for this deck'
    - 'bracket preset ceiling (hide or warn)'
  deck_theme_weights: 'w_t = (cards matching t)/(nonland size); commander matches x3; floor so any theme the commander names always counts'
  sub_scores:   # each normalized to 0..1
    synergy: 'ThemeFit + EventFit + AdjacencyFit + ComboFit - NonboPenalty'
    theme_fit: 'sum_t w_t * side_match(c,t); side_match favors the side the deck is short on (many enablers, few payoffs -> payoffs score higher)'
    adjacency_fit: 'sum over adjacency edges (deck theme -> candidate theme) of edge weight * w_deck_theme * 0.5'
    combo_fit: 'max combo_weight over Spellbook variants the candidate completes (respecting bracket preset)'
    role: 'sum_r need_r * fills(c,r), need_r = max(0, target_r - have_r)/target_r'
    curve: '+ if the candidate MV bucket is under target, - if over'
    popularity: 'optional; lift-like ratio or edhrec_rank prior, never raw inclusion %'
    owned: '1 if in the user collection'
  weights: {synergy: 0.45, role: 0.25, curve: 0.10, popularity: 0.10, owned: 0.10}   # untested starting guesses
  penalties: {price: 'soft logistic above the user budget cap (Scryfall prices are daily, rough only)', power: 'bracket badge handling per preset'}
  diversity: {method: MMR, pool: 200, lambda: 0.7, similarity: 'Jaccard(theme tags + role tags) + same-MV bonus'}
  explanations: 'emit the top 2-3 contributing sub-scores as sentences, e.g. "Payoff for your tokens theme: 14 of your cards make tokens"; "You have 7 ramp cards; template wants 10"; "Completes Sanguine Bond + Exquisite Blood (Mandatory loop; Spellbook: Powerful/3)"'
  learning: 'multiplicative per-deck theme weight update on each swipe, e.g. w_t *= 1.1 on right swipe, 0.95 on left (values are guesses)'
  self_test: 'hide 60% of a known good deck, score, and check how many hidden cards land in the top 10 (thesis benchmark P@10 ~0.58)'
```

Cuts are the add score run backward, with protections. Existing tools mostly cut by popularity: EDHREC's Recs page flags the cards in your list least used by other decks with your commander, and users warn it is only "a starting point" because precon staples skew it ([r/EDH thread](https://lr.in.psf.lt/r/EDH/comments/1fv56a9/i_know_theres_edhrec_but_what_about_edhcuts)). Community advice adds structure the app can encode: get to exactly 100 and swap rather than add, sort by function, keep core counts for ramp, draw and interaction, cut the weakest card in each group, and cut slow, unreliable or "win-more" cards (cards that only help when you are already winning) ([same thread](https://lr.in.psf.lt/r/EDH/comments/1fv56a9/i_know_theres_edhrec_but_what_about_edhcuts)). Low-synergy staples deserve damping rather than cutting, because generic staples lower synergy scores but raise deck power ([EDH-LLM](https://evelynyee.github.io/edh-llm)). The one-for-one swap framing has precedent in Q-DeckRec, which treats deck improvement as a sequence of single-card replacements ([Q-DeckRec](https://web.cs.ucla.edu/~yzsun/papers/2018_cig_deckrec.pdf)). No published tool documents a cut formula, so the design below is a proposal.

```yaml
cut_score:   # higher = cut first; computed per non-commander card, excluding the card itself from deck stats
  factors:
    low_fit: '1 - synergy score of the card against the rest of the deck (same function as add)'
    role_surplus: 'for each role filled: max(0, have_r - target_r)/target_r; 0 if any of its roles is under quota'
    off_curve: 'MV bucket over curve target, or MV >= 6 without being a theme payoff or the finisher'
    dominated: 'another deck card has the same role set and primary theme tags at strictly lower MV, without an instant-vs-sorcery or flexibility edge (soft signal; text-based "strictly worse" is error-prone)'
    nonbo: 'card matches a hoser whose conflicting axis is dense in this deck'
    bracket_risk: 'card exceeds the user target bracket (hard flag once a target is set)'
    low_popularity: 'optional; low lift/inclusion with the commander, weighted low'
  weights: {low_fit: 0.35, role_surplus: 0.20, off_curve: 0.10, dominated: 0.15, nonbo: 0.15, bracket_risk: 0.05}   # untested guesses
  protections:   # never suggest, or heavily damp
    - commander(s), partner, background
    - 'cards matching the commander''s own enabler/payoff themes at high strength (engine pieces)'
    - 'pieces of any Spellbook combo fully contained in the deck, or user-marked combo cards'
    - 'lands while land count <= target; never below a floor of 35 without user override'
    - 'cards whose removal drops ramp, card-advantage, targeted or mass disruption below target'
    - 'user-pinned (locked) cards'
    - 'staple damping: multiply by 0.5 if the card fills an at-or-under-quota role and has a top-ranked edhrec_rank (factor is a guess)'
  standalone_list: 'top N by cut_score, grouped by role, with how far the deck is over 100 and over each role target'

swap_pairing:   # when the user accepts candidate X, pick the cut Y
  score: 'PairScore(Y|X) = CutScore(Y) + alpha*SameRole(X,Y) + beta*SameThemeSlot(X,Y) + gamma*MVCloseness(X,Y) - delta*RoleMinViolatedAfterSwap - inf*Protected(Y)'
  coefficients: {alpha: 0.5, beta: 0.3, gamma: 0.1, delta: 1.0}   # ordering role > theme > MV is from the design notes; values are guesses
  rules:
    - 'if X fills an under-quota role, prefer cutting from an over-quota role'
    - 'adding a land pairs with cutting a land (or a ramp spell if lands are at/over target)'
    - 'adding a nonland when lands are at target never pairs with a land cut'
  output: '1 primary cut + 2 alternates'
  explanations: ['Swap: Beast Within in, Murder out - same role (removal), 1 less mana', 'Weakest fit: only 2 of your cards care about lifegain', 'You have 14 ramp pieces vs a target of 10-12; this is the most expensive', 'Works against your graveyard plan', 'Above your chosen bracket (Game Changer)', 'Kept Sol Ring: ramp would drop below 10']
```

## Six gaps to close before the taxonomy ships

The research leaves specific, checkable holes. The **schema of the `oracle_tags` JSONL file** (field names, whether it maps tag → oracle IDs or the reverse, and whether parent/child links are included) was not inspected because the download host was blocked from the research sandbox; downloading it and reading the first line is the first build task. **Browser CORS** for Commander Spellbook, `data.scryfall.io` and `json.edhrec.com` is unverified, which is why this design moves those fetches to a build step. The **regex patterns and seed cards were not run against the full card pool**; the cheapest validation is to run every pattern over `oracle_cards`, compare hit counts to the live counts cited above, and eyeball a random sample of matches per theme. A handful of 2025–2026 keyword strings (Increment, Earthbend, Airbend, Mobilize, Behold) need confirming against Scryfall's keyword catalogs, and several doubler and hoser texts (Ancient Greenwarden, Mondrak, mana doublers, Spirit of the Labyrinth) were listed from knowledge rather than fetched. Finally, the **Moxfield export format** (whether user tags survive) and the size of `variants.json.gz` (which decides whether a full combo index fits comfortably in a static site) were not checked.

## Conclusion

The useful shift is to stop thinking of synergy as "cards that share words" and start treating it as **event plumbing**: who produces each event, who consumes it, what multiplies it, and what shuts it off. That framing makes every downstream feature fall out of one data structure. Additions score by filling the deck's short side of an event; cuts score by being the redundant or contradictory end of one; swaps pair cards that occupy the same pipe; nonbos are hosers on a pipe the deck depends on; and combos are simply closed loops in the same graph, which Commander Spellbook has already enumerated. Brackets sit beside the graph rather than inside it, because a Game Changer or two-card infinite is a table-etiquette question, not a fit question, and Wizards' own framing as a pregame conversation tool supports letting the user set the ceiling.

The practical implication for Commander Swipe is that the hard part is not the math but the **text normalization and density gates**. The 2024–2026 templating changes (enters, "you control enters", "this creature") silently break naive patterns, and the broadest phrases ("dies", "+1/+1 counter") will dominate any score that is not weighted by rarity and gated by deck density. Getting those two things right, then letting swipe feedback tune the untested weights, is likely to beat any fancier model the app could run in a browser. Left out of this report: a full per-subtype payoff inventory (only Elves were measured), the Class and battle payoff wording beyond the two phrasings tested, and detailed state-based-action interactions.

## Main sources

[Scryfall API docs](https://scryfall.com/docs/api) · [Scryfall bulk-data endpoint](https://api.scryfall.com/bulk-data) · [Scryfall search syntax](https://scryfall.com/docs/syntax) · [Scryfall "enters" errata notice](https://scryfall.com/blog/errata-notice-bloomburrow-enters-229) · [Commander Spellbook API docs](https://spacecowmedia.github.io/commander-spellbook-backend/api.html) · [Spellbook `variant.py` (bracket logic)](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/models/variant.py) · [EDHREC "From Synergy to Lift"](https://edhrec.com/articles/from-synergy-to-lift-the-math-behind-edhrecs-new-era) · [EDHREC Theme Tags](https://edhrec.com/tags/themes) · [Wizards Brackets update, Oct 21 2025](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-october-21-2025) · [Wizards Brackets update, Feb 9 2026](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026) · [Command Zone 2025 template notes](https://www.alanwsmith.com/en/38/z9/2w/vi/) · [MTGJSON Card (Atomic)](https://mtgjson.com/data-models/card/card-atomic/)
