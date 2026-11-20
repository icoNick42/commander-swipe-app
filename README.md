# Commander Swipe

Swipe through card ideas for a Magic: The Gathering Commander deck.

1. **Paste your deck.** In Moxfield, open your deck, then More > Export > Copy for Moxfield. Back on this page, paste it into the box (a whole deck replaces whatever is there) or press **Paste from clipboard**, then press **Load deck**. **Clear** empties the box.
2. **Swipe.** Right adds a card, left skips it, up puts it on a "maybe" list. The next card waits underneath, and the line under the buttons says what happened (green for an add). On a computer, the arrow keys do the same, and Z undoes. Tap a card's picture in any list to see it whole. Skipped cards aren't lost: open **Skipped** to put one back in its pile or add it.
3. **Copy back.** **Copy picks** copies your picks as `1 Card Name` lines, ready for Moxfield's bulk edit. If you also cut cards, **Copy whole deck** copies the full list with your cuts taken out and your picks added (your printings kept): in Moxfield's Bulk Edit, select all and paste over it.

**Changing your deck.** Cut cards right on the page (Your deck > Cut ideas, or Your deck > All cards), and the Deck total line keeps count against 100. While your picks keep the deck over 100, a line under the buttons offers a card to cut, one at a time, until it's back to 100 (x hides it until your next Add; **Why? Other options** shows a few more), and Deck total lists that many cut ideas, plus four other options in case you'd rather cut something else. After you update the deck in Moxfield, press **Update or switch deck** and paste the new export: your swipes, picks and cuts carry over (picks that are in the deck now leave the Added list, and cuts you made in Moxfield are done). If it picked up the wrong deck, **Start fresh instead** is under the deck line until you make a change (the earlier version keeps its own copy either way). **Back to swiping** returns you to where you were. To work on a different deck, press **Update or switch deck**, then **Start a different deck**: the box empties for the other deck's export, and the first deck's swipes stay saved for when you paste it again.

Recommendations come from EDHREC's page for your commander, sorted into piles (best cards, creatures, lands and so on), plus its Budget page and its theme pages (Tokens, Aristocrats and the like, under Themes).

The first pile, **Best for your deck**, ranks every card the page knows about at once: how often decks with your commander run it (EDHREC), how much more they run it than other decks do (synergy), how strong the card is (below), and a little of how it ties into your deck. That order was picked by testing: take a card out of a well-liked deck and see where each method ranks it. Across 57 such decks, this order put about 3.6 of every 10 missing cards in the first 20 swipes before strength was added, and 42% of them in the first 20 after (from 40%); Fit alone found about 1.4, and EDHREC's short "best cards" list about 1.8.

From Scryfall, searched in your commander's colors:

- **Everything in your colors:** every Commander-legal card, most played first. It loads more as you swipe.
- **Roles:** removal, ramp, card draw, protection, board wipes, tutors, recursion, sacrifice outlets, token makers, haste, anthems, extra combats and graveyard hate. These load more as you swipe, too.

The Scryfall piles still work if EDHREC is down or has no page for your commander.

**Fit score.** Every card also gets a Fit score from 0 to 100, worked out in your browser from the rules text of your deck and the card. A card scores when it feeds what your deck's cards want (a token maker for your sacrifice outlets) or wants what they make (a death trigger for a deck that sacrifices a lot). Your commander counts three times, and a card that ties in to the commander itself gets a little extra (so an enabler for its own trigger, like Burgeoning for a landfall commander, scores well). Some commanders also say what they help with: one that makes creature spells cheaper or gives them blitz (Hamza, Henzie) counts big creatures as part of its plan, and one that turns big artifacts or enchantments into creatures (Bello) counts those. Creature types count a little, and so do roles your deck is short on. The plans it can see include tokens, defenders (Arcades), colorless spells (Kozilek), copies of your creatures (clones, Kiki-Jiki, The Jolly Balloon Man) and speed (The Speed Demon), sacrifice, attacking, the Ring tempting you and Armies (amass), the monarch and keeping attackers off you (goad, attack taxes, attack limits, damage reflection), forcing opponents' creatures to attack (goad, Goblin Spymaster) and what pays that off (Nelly Borca), slowing opponents (taxes, their permanents entering tapped), death triggers and the cards that double them (Teysa Karlov, The Masamune), untapping (creatures and artifacts separately), staying behind on lands (Land Tax), tapping your creatures (crew, station, mana creatures), noncreature spells with 4 or more mana spent, +1/+1 counters (doublers too), landfall, lands in the graveyard and in hand, discarding, Equipment and what protects the creature carrying it, color tricks (Painter's Servant), taxes on opponents, face-down cards, what a card is (artifacts, enchantments, planeswalkers, Sagas, X spells, devotion), opponents drawing, sacrificing or discarding, draining and noncombat damage, casting from exile, dungeons, targeting what opponents control, and more. Kindred counts land types (Deserts), changelings, and cards that name a type you choose. Tap the Fit line under a card to see why.

**Strength.** Fit also counts how strong a card is, whatever the deck: the shown Fit is 60% tie-in (the part above) and 40% strength. Strength follows what power-level sites such as commanderpowermeter and commandersalt score: how widely the card is played across Commander, and how good it is at its job (fast mana, cheap tutors, cheap and instant-speed removal, one-sided board wipes, repeatable card draw, free spells, Game Changers). Strength only moves cards up or down; it never hides one. So Swords to Plowshares, which ties in to little, still scores well.

- **Your deck:** your deck's own score (the average Fit of its cards, tie-in and strength) and how it compares with 57 well-liked Moxfield decks, its game plan (the engine of cards that keep making cards, mana or creatures, the protection that keeps it alive, tutors, mana, interaction and the cards or combos that win), its themes with example cards on both sides, cut ideas with the reason for each, how many cards it has in each role (light, about right or heavy), its combos, and every card with a Cut button.

**Cuts.** One model decides every cut: the Cut ideas list, the "cut something?" prompt after an Add, and the list of cuts that gets the deck back to 100. Each card gets a keep score: how well it ties in, how strong it is, and how often decks with your commander run it (EDHREC). A role the deck has a quarter more of than usual, a card costing 6 or more that isn't part of the plan, and a 4th Game Changer (bracket 4) push a card toward a cut. Lands are judged on what they do: one that always enters tapped, or makes only colorless mana in a multicolor deck, goes first; a basic goes when the deck has more of it than its spells' colors need. When you add a card, the cut is like for like: a land for a land (unless the deck is short on lands), the same job for the same job (removal for removal, better still when the new card is cheaper or stronger), and the back-to-100 list gives each pick its own cut. The game plan counts too: protection (counterspells, hexproof, phasing, redirects) and tutors are never called more than the deck needs, a deck built to make a lot of mana isn't over on ramp, and a finisher that ties in to little says so instead of being called a card that works with nothing. Never suggested: your commander and pieces of a combo you already have; ramp, card draw, removal or board wipes at or under the usual count aren't cut for a card that doesn't do that job, and strong role cards and cards with a tie-in of 75 or more aren't listed as cut ideas.

**Combos.** For commanders with a combo list, a **Combos** pile shows cards that would complete a combo with cards already in your deck, lowest bracket first. A "Combo" badge on any card opens the combos it completes: the other pieces, what the combo does, its bracket and a link to the steps on Commander Spellbook. Combos in the bracket 3+ range get an amber badge, so you can keep your deck at your table's power level. The Your deck panel counts the combos you already have. Combo lists are made ahead of time, one commander at a time (Commander Spellbook's site can't be read from another web page), so for now 68 commanders have one (every commander tested so far, Zurgo Stormrender and Zimone included).

No deck handy? **Try a sample deck** loads a Zurgo Stormrender list.

Game Changers are hidden by default. You can change that, set a max price, or pick card types under Filters.

**Sort.** The Sort menu next to the deck line reorders the pile you're swiping: Recommended (the pile's own order), Fit, Most played (EDHREC), EDHREC synergy, Cheapest, or Mana value. It only changes the order, so your swipes and the pile's count stay the same, and it goes back to Recommended when you reload. In piles that load more as you swipe, it sorts the cards loaded so far. Cards without the number (no price, not on EDHREC) come last. Recommended stays the default because testing found it surfaces the cards strong decks actually run best; the others are for browsing (say, the cheapest cards first).

## Synergy data

The research behind the Fit score is published as one file anyone can load:

- **Load it (JSON):** https://iconick42.github.io/commander-swipe-app/data/synergy-taxonomy.json
- **Read it (report):** [docs/interaction-research.md](docs/interaction-research.md)

It lists the kinds of card interactions in Commander as text patterns you can run on Scryfall card data:

- **Themes** (tokens, aristocrats, landfall, spellslinger and about 50 more), each split into enablers (cards that make the resource) and payoffs (cards that reward it).
- **Events and doublers:** which cards cause something to happen (a creature dies, a token is made) and which react to it, plus the cards that double those reactions.
- **Creature types:** an inventory of every creature type with how many cards pay it off.
- **Other links between cards:** card types and keywords.
- **Power and pairings:** cards that work against each other, and bracket flags (Game Changers, mass land destruction, extra turns).
- **Scoring settings** for suggesting additions, cuts and one-for-one swaps.

It's built for any commander, not one deck. Checked on 2026-11-17 against Scryfall's whole Commander-legal pool (32,643 cards, 3,704 possible commanders):

- **Commanders recognized:** 91% have at least one theme, creature type, doubler, card-type link or keyword link, and 93% once broad trigger matches are counted. The rest are mostly vanilla or keyword-only commanders (Zetalpa, Akroma) with no plan to detect.
- **Most-played commanders:** themes or creature types alone recognize 462 of the 500 most-played.
- **Seed cards:** the themes match 92% of their own example cards.
- **No catch-all themes:** no theme matches more than a fifth of the 350 most-played cards.
- **Creature types:** all 377 are inventoried. 13 have strong support (40+ payoff cards), 21 are playable (15-39), 29 thin and 99 minimal; 215 have no payoff cards.

`meta.how_to_use` in the file explains the text format. The scoring weights are starting guesses, not tested values. Fetch it with `fetch("https://iconick42.github.io/commander-swipe-app/data/synergy-taxonomy.json").then(r => r.json())`.

## Good to know

- No account, no server and no cost. Everything runs in your browser.
- Your swipes are saved in this browser only. Clearing site data erases them, and they don't move to another device. Copying your picks into Moxfield is the real save.
- One commander per deck for now. Partner and Background pairs fall back to the Scryfall role piles.

## For developers

- Plain HTML, CSS and JavaScript, with no build step and no libraries. `index.html` holds the page; `core.js` holds the logic that doesn't touch the page.
- Run it locally: from this folder, `python -m http.server 8000`, then open http://localhost:8000.
- Combo lists live in `combos/<commander-slug>.json`: a trimmed copy of Commander Spellbook's answer for one deck (combos already in it and combos one card away). The page reads the file from its own site; it never calls Spellbook.
- Synergy data: `data/synergy-taxonomy.json` is built from the YAML blocks in `docs/interaction-research.md` plus the tested fixes in `docs/taxonomy-additions.yaml`. `node tests/taxonomy.test.js` checks that every pattern compiles, that no theme is too broad, and that the sample deck reads as tokens and aristocrats.
- Tests: `node tests/core.test.js` (Node 18 or newer). A few tests need a saved EDHREC page that isn't in this repo; they're skipped without it.
- `AGENTS.md` has the rules for AI coding assistants; `DESIGN.md` has the colors, sizes and layout rules.

## Credits

- Card recommendations: [EDHREC](https://edhrec.com/) (unofficial data feed; the page fetches one commander page per visit).
- Card data, images and prices: [Scryfall](https://scryfall.com/). Card images are shown whole, with the artist and copyright line.
- Combos and their bracket tags: [Commander Spellbook](https://commanderspellbook.com/). Each combo links to its page there for the full steps.

Commander Swipe is unofficial Fan Content permitted under the [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. &copy;Wizards of the Coast LLC.
