# Commander Swipe

Swipe through card ideas for a Magic: The Gathering Commander deck.

1. **Paste your deck.** In Moxfield, open your deck, then More > Export > Copy for Moxfield. Back on this page, press **Paste and load**. (If your browser won't let the page read the clipboard, paste into the box instead: a whole deck replaces whatever is there and loads on its own. **Clear** empties the box.)
2. **Swipe.** Right adds a card, left skips it, up puts it on a "maybe" list. On a computer, the arrow keys do the same, and Z undoes.
3. **Copy back.** "Copy for Moxfield" copies your picks as `1 Card Name` lines, ready for Moxfield's bulk edit.

Recommendations come from EDHREC's page for your commander, sorted into piles (best cards, creatures, lands and so on), plus its Budget page and its theme pages (Tokens, Aristocrats and the like, under Themes).

From Scryfall, searched in your commander's colors:

- **Everything in your colors:** every Commander-legal card, most played first. It loads more as you swipe.
- **Roles:** removal, ramp, card draw, protection, board wipes, tutors, recursion, sacrifice outlets, token makers, haste, anthems and extra combats. These load more as you swipe, too.

The Scryfall piles still work if EDHREC is down or has no page for your commander.

**Fit score.** Every card also gets a Fit score from 0 to 100, worked out in your browser from the rules text of your deck and the card. A card scores when it feeds what your deck's cards want (a token maker for your sacrifice outlets) or wants what they make (a death trigger for a deck that sacrifices a lot). Your commander counts three times, creature types count a little, and so do roles your deck is short on. Tap the Fit line under a card to see why. Fit says how well a card ties into your deck's plan, not how strong it is: Swords to Plowshares scores low, and it's still great.

- **Highest Fit:** every card the other piles have loaded, best Fit first.
- **Your deck:** your deck's own score (the average Fit of its cards against each other), its main plans, its five least-connected cards, and how many cards it has in each role.

**Combos.** For commanders with a combo list, a **Combos** pile shows cards that would complete a combo with cards already in your deck, lowest bracket first. A "Combo" badge on any card opens the combos it completes: the other pieces, what the combo does, its bracket and a link to the steps on Commander Spellbook. Combos in the bracket 3+ range get an amber badge, so you can keep your deck at your table's power level. The Your deck panel counts the combos you already have. Combo lists are made ahead of time, one commander at a time (Commander Spellbook's site can't be read from another web page), so for now only Zurgo Stormrender has one.

No deck handy? **Try a sample deck** loads a Zurgo Stormrender list.

Game Changers are hidden by default. You can change that, set a max price, or pick card types under Filters.

## Good to know

- No account, no server and no cost. Everything runs in your browser.
- Your swipes are saved in this browser only. Clearing site data erases them, and they don't move to another device. Copying your picks into Moxfield is the real save.
- One commander per deck for now. Partner and Background pairs fall back to the Scryfall role piles.

## For developers

- Plain HTML, CSS and JavaScript, with no build step and no libraries. `index.html` holds the page; `core.js` holds the logic that doesn't touch the page.
- Run it locally: from this folder, `python -m http.server 8000`, then open http://localhost:8000.
- Combo lists live in `combos/<commander-slug>.json`: a trimmed copy of Commander Spellbook's answer for one deck (combos already in it and combos one card away). The page reads the file from its own site; it never calls Spellbook.
- Tests: `node tests/core.test.js` (Node 18 or newer). A few tests need a saved EDHREC page that isn't in this repo; they're skipped without it.
- `AGENTS.md` has the rules for AI coding assistants; `DESIGN.md` has the colors, sizes and layout rules.

## Credits

- Card recommendations: [EDHREC](https://edhrec.com/) (unofficial data feed; the page fetches one commander page per visit).
- Card data, images and prices: [Scryfall](https://scryfall.com/). Card images are shown whole, with the artist and copyright line.
- Combos and their bracket tags: [Commander Spellbook](https://commanderspellbook.com/). Each combo links to its page there for the full steps.

Commander Swipe is unofficial Fan Content permitted under the [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. &copy;Wizards of the Coast LLC.
