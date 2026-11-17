# Agent instructions: Commander Swipe

If something I ask conflicts with this file, do what I asked and mention the conflict. If it would lose saved data or cost money, check with me first.

## Project
- What this is: a page where I paste a Moxfield deck export and swipe through recommended cards for my commander (right = add, left = skip, up = maybe), then copy the picks back into Moxfield. Mainly for my own use, but kept shareable.
- Design notes: `../Architecture and plan.md` (parent folder). Read it before your first change; it explains the data flow and the saved-data format.
- This folder will be the Git repository and the public GitHub Pages site. Never put anything private here. Notes, drafts, reviews and handoffs go in the parent folder.
- Layout: `DESIGN.md` (colors, sizes and layout rules); `README.md` (public front page); `index.html` (layout, styles, page script); `core.js` (pure logic with no page access, loaded with a plain `<script src>`, never as a module, so the page also works when opened straight from the folder; it must also run in Node); `tests/` (Node tests and fixtures).
- No build step, framework, package manager or outside library. GitHub Pages serves the files as-is. Ask before adding any library, font or asset, and tell me its license.
- Preview: serve the folder (`py -m http.server 8000`, then http://localhost:8000). Tests: `node tests/core.test.js`.
- Git: I commit and publish with GitHub Desktop myself. Don't commit, push or publish; give me the steps.

## Data sources
- Scryfall API (card data, images, role searches): send `Accept: application/json`, keep at least 100 ms between requests, and show card images whole (don't crop them or cover the artist and copyright line).
- EDHREC (`json.edhrec.com/pages/commanders/<slug>.json`, plus `<slug>/budget.json` and `<slug>/<theme>.json`): unofficial and undocumented. At most one fetch per EDHREC page per visit; the budget and theme pages only when that pile is opened. Nothing may depend on it alone; the Scryfall piles (Everything in your colors, roles) must work without it.
- Moxfield: never call its API or scrape it. Input is pasted Export text.
- Anything that costs money (a paid API, a service, a purchase) needs my yes first.

## Don't break these
- Saved data lives in localStorage under `cs:` keys only, read and written through the `store` helper. Never use another prefix (other apps on the same github.io address share storage, such as the Trestleboard's `tb:`). Never rename keys or change a saved format without a `v` bump and code that converts old saves.
- The page must keep working when storage is missing or throws.
- "Copy for Moxfield" output is one `1 Card Name` per line, nothing else.

## Working rules
- Plan first only when a decision needs me (direction, scope, money). Otherwise build and say what you chose.
- Change only what the task needs. List unrelated problems you notice in your summary and add them to `../Later list.md`.
- After a change: run the tests, preview the page, check the console for errors, and read each saved file back.
- A change to saved-data code gets one review by a fresh agent that sees the request and the finished change, not your reasoning. It reports Must / Should / Note.
- Finish with a short summary: what changed, what was checked, what wasn't, and the GitHub Desktop steps.
