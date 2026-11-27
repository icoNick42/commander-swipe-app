# Scryfall Local

A copy of Scryfall's whole card database on this PC, plus a search page that works
without the internet. Made 2026-11-19.

## Use it

- **Search:** double-click `Start card search.bat`. Your browser opens
  http://localhost:8765. Close the black window to stop it. Click **Syntax** on the
  page for everything you can search.
- **Refresh the data:** double-click `Update card data.bat` (Scryfall rebuilds its
  files daily; once a week or two is plenty). It only downloads files that changed,
  then fetches images for any new cards. Restart the search afterward.
  Don't run it while a first image download is still going.

## What's here

| Item | What it is |
|---|---|
| `data/` | Scryfall's 7 bulk files, as downloaded (gzip, one JSON card per line). `manifest.json` says when each was updated. |
| `data/oracle_cards` | 39,356 entries: one per unique card, in its newest recognizable printing |
| `data/default_cards` | 120,211 entries: every printing in English (or its only language) |
| `data/all_cards` | every printing in every language (the big one, ~410 MB) |
| `data/unique_artwork`, `rulings`, `oracle_tags`, `art_tags` | each unique artwork, official rulings, Scryfall Tagger's role tags (removal, ramp, ...) and art tags |
| `images/normal/` | one 488x680 image per unique card plus back faces (~37,500 files, about 3.7 GB) |
| `update_scryfall.py` | downloads or refreshes `data/` |
| `download_images.py` | downloads `images/` (safe to stop and rerun; it picks up where it left off) |
| `scryfall_local.py` | the search server; `search.html` is the page it shows |

Everything is standard Python, nothing to install. Only this PC can open the page.

## How close it is to the real Scryfall

Checked against live Scryfall on 36 searches (2026-11-19): 33 matched within a few
cards, the rest within about 1-3%. Known differences:

- Scryfall hides some odd cards from searches by default (tokens, playtest cards,
  some promos and digital-only cards). The rule here is a close guess, so a handful
  of promo cards show up here that Scryfall hides, or the reverse.
- `~` (the card's own name) in rules-text searches also matches "this creature",
  "this spell" and the like; Scryfall finds about 1% more.
- Not supported yet: art tags (`atag:`), searching individual printings
  (`unique:prints`), and some rare keywords. The page warns when it ignores a term.
- Prices are from the day the data was downloaded.

## Scryfall's terms, in short

The data and images come from Scryfall (scryfall.com), which allows this kind of
personal use. If any of it goes into something public, keep card images whole
(don't crop them or cover the artist and copyright line), and make sure the
thing adds something rather than just republishing Scryfall's data.
