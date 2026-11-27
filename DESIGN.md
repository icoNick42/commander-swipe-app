# Design notes: Commander Swipe

The look and layout rules for `index.html`. Written in PM cycle 4 (2026-11-17). There was no design system before this, so these values are **provisional picks**, not a tested brand. Change them here first, then in the `:root` block of `index.html`, so the two stay in step.

## Principles

1. **The card is the page.** On any screen, the card and the Skip / Maybe / Add buttons fit without scrolling. Everything else (piles, lists, filters) can scroll.
2. **Card images stay whole.** Scryfall's rules: never crop a card or cover the artist and copyright line. Swipe labels (ADD / SKIP / MAYBE) only show while dragging. The one other picture is the commander's art behind the header (cycle 36). It's Scryfall's own art crop, not a crop of the card, and the artist is always named beside it.
3. **Color means the choice.** Green = add, red = skip, amber = maybe, gold = "selected" or the main action (blue until cycle 36). Every colored control also has a text label, so color is never the only signal. The deck's own colors only tint the background (the spotlight and the pips); they never mark a control.
4. **A card table, not a dashboard (cycle 36, Nick's pick A).** Warm and dark, like a game table at night: a soft spotlight where the card sits, serif headings, and as few boxes as possible. Card art is still the brightest thing on the page.

## Colors (CSS variables in `:root`)

Cycle 36 changed the palette to the game table. The old cool blue-gray values are in git history (`dc73583` and before).

| Token | Value | Use |
|---|---|---|
| `--bg` | `#14110d` | page background (warm near-black) |
| `--panel` | `#1e1a15` | buttons, inputs, the plan check |
| `--panel-2` | `#26211a` | spare raised surface (not used yet) |
| `--line` | `#3a3128` | borders where one is still needed |
| `--text` | `#f1e9dc` | main text (15.6:1 on `--bg`) |
| `--muted` | `#b3a794` | secondary text (8.0:1 on `--bg`, 7.3:1 on `--panel`; WCAG AA needs 4.5:1) |
| `--accent` | `#e0b25a` | gold: focus ring, step numbers, hover border, the main button's fill (9.3:1 with its `#1a1408` text) |
| `--accent-bg` / `--accent-line` | `#3a2f1d` / `#8a6a2c` | older selected states; the selected look is now gold at 16% over the surface |
| `--title` | `#f3d99c` | the app name (cycle 36) |
| `--glow-1` / `--glow-2` | gold at 10%, then the deck's first and last colors at 11% | the two spotlights behind the card (cycle 36; set by `showDeckIdentity`) |
| `--add` | `#3fb768` | add |
| `--skip` | `#e0575b` | skip |
| `--maybe` | `#e3b341` | maybe |
| `--line-soft` | `#2b251e` | dividers between list rows and between side sections (cycle 9; was a literal) |
| `--accent-hover` | `#4a3c24` | spare (the main button now lightens to `#ebc276` on hover) |
| `--accent-text` | `#ffe6b0` | text and count on a selected pile or choice (cycle 9; was a literal) |
| `--error-text` | `#ff8b8b` | error messages (cycle 9; was a literal) |
| `--notice-bg` / `--notice-line` | `#3a2f12` / `#6b5520` | notice box (cycle 9; was a literal) |
| (literal) | `#a26ef0` / `#cbb0ff` | Game Changer badge |
| (literal) | `--add` border, `#9be3b4` text | Combo badge, brackets 1-2 |
| (literal) | `--maybe` border, `#f0d68a` text | Combo badge, bracket 3 and up |

Action buttons use their color as the border plus a see-through fill of the same color (12% for Skip and Maybe, 22% for Add, so Add reads as the main action).

## Spacing, shape, type

- Spacing steps: 4, 8, 12, 16, 24 px (`--space-1` to `--space-5`).
- Corners: 10 px for controls (`--r-sm`), 16 px for panels (`--r-md`), fully round for pile chips and the swipe buttons (cycle 36: 8 and 12 before).
- Type (cycle 36): **Nunito Sans** for everything at 16 px, and **Fraunces** (semibold) for the app name and headings (h2, the side column's section titles, the plan check's title). Both are in `fonts/` as small `.woff2` files (Latin letters only, about 40 KB together), under the SIL Open Font License (the `OFL-*.txt` files there). The page never fetches a font from another site. Small text 0.85-0.9 rem; the footer 0.78 rem.
- Touch targets: the action buttons are at least 44 px tall.

## Layout

- **Pile row:** chips for the main piles (Best for your deck first since cycle 12, then EDHREC's sections, Combos, Good in any deck; cycle 29 took out Budget and Everything in your colors), then two dropdowns styled as chips: Roles and Themes. A dropdown gets the selected look when one of its piles is open. Under 900 px the dropdowns come first in the row (at most 8.5 rem wide each), so a phone shows them without scrolling sideways.
- **Wide (900 px and up):** two columns. Left: deck bar, piles (wrapping chips), card, buttons. Right (340 px): Added, Maybe, Filters.
- **Narrow (under 900 px):** one column. The deck bar stays on one row, the piles become one row you swipe sideways, and the four buttons share one row. Lists and filters sit below the card.
- **Phone (520 px and under):** the "Commander" label and the header tagline are hidden visually (the label stays for screen readers), and the three "how it works" steps shrink to one line each.
- **Card size:** `width = clamp(200px, min(--card-max, 86vw, (screen height - --chrome) x 0.7176), --card-max)` (`--card-max` is 340 px, 440 px from cycle 21 on screens at least 1200 px wide and 860 px tall), where 0.7176 is the card's width/height (488/680). `--chrome` is the height of everything around the card: 454 px wide, 364 px narrow (each raised 24 px in cycle 6 for the Fit line). If something is added above or below the card, raise `--chrome` by its height.

Checked in cycle 4 (Chrome, fixtures): buttons in view at 375x667, 390x844, 412x915, 768x1024, 1366x700, 1280x860 and 1920x1080. Before this pass they were off screen on all three phone sizes and on 1366x700. Checked again in cycle 5 with the new pile row: all seven still in view; the pile row is the same height as before (3 rows wide, 1 row narrow).

- **Fit line (cycle 6):** one line under the card's stats, "Fit 84 · first reason", cut off with an ellipsis. It opens to all the reasons and stays open from card to card once opened. The Fit number is in `--text` and bold; the rest is `--muted`.
- **Your deck panel (cycle 6):** a closed panel in the side column, between Maybe and Filters, titled "Your deck: Fit N/100" (cycle 14; was "synergy", which is also an EDHREC number on the card).

Checked in cycle 6 (Chrome, fixtures): the buttons and the Fit line are in view at all seven sizes above (now part of `tools/page_check.py`).

- **Name line (cycle 7):** the card name and its badges (not on EDHREC, Game Changer, Combo) share one line; the name shortens with an ellipsis to make room. Before this, badges took their own line, which pushed the buttons 8 px off a 375x667 screen on any badged card. `--chrome` didn't change.
- **Combo badge (cycle 7):** a small button styled as a badge, "Combo: completes N". Pressing it shows the combo list under the Fit line (and hides it again); it starts hidden on every card, so it never pushes the buttons down on its own. Green border for brackets 1-2, amber with "(bracket N+)" for 3 and up.
- **First screen (cycle 7; cycle 14):** Load deck is the main button and the only one that loads. Paste from clipboard fills the box (cycle 14: Paste and load next to Load deck was confusing). Then Clear and Try a sample deck.
- **Switching decks (cycle 12):** Update or switch deck (called Change deck until cycle 14) opens the paste screen with a back bar: Back to swiping, then Start a different deck (empties the box; the deck's swipes stay saved). The deck bar keeps one button, so it still fits one row on a phone.

- **Changing the deck (cycle 8):** the side column runs Added, Cuts (only when there are cuts), Deck total (only when there are picks or cuts; amber when over 100), Maybe, Your deck, Filters. Cut buttons use the skip red as their border; a cut card in All cards is struck through with a pressed Keep button.
- **Swap prompt (cycle 8):** after an Add that takes the deck over 100, one line takes the keys line's place under the buttons: "N over 100. Cut [card] [Why? More] [x]". It never wraps (the card name shortens), so the buttons don't move; Why? More opens the reasons below it.
- **Progress link (cycle 8):** under 900 px, once there are picks, maybes or cuts, the keys line shows "2 added · 1 maybe · 1 cut ↓" instead of the drag hint; it scrolls to the lists.
- **Deck line (cycle 8):** one line that cuts off with an ellipsis: "100 cards", plus problems or "swipes kept from your last version" when there are any. The details (lines read, Start fresh) are behind it.
- **Change deck (cycle 8):** opens the first screen with Back to swiping and a line saying an updated paste keeps your swipes; the how-it-works steps are hidden then.

- **Lists (cycle 9):** each Added and Maybe row shows the card's Fit ("Fit 72") in muted small text (cycle 21: a 3-dot meter; cycle 29: no price).
- **Pile dropdowns (cycle 9):** a mouse or touch pick opens the pile at once; with the arrow keys the page waits until they stop (0.7 s) or Enter, then opens it and moves focus off, so the arrow keys swipe again.
- **First screen (cycle 9):** pasting a deck into the box fills it and says how many cards it got; it doesn't load until Load deck.

- **Lists (cycle 14):** every row in Added, Maybe, Skipped, Cuts, Cut ideas, the over-100 list and All cards starts with a 32x45 px card image (Scryfall's small image, whole card, lazy-loaded). Tapping it opens the whole card in a dialog (Close, Escape or a tap outside closes it; arrow keys don't swipe while it's open). Lists show their newest 6 rows, then a "Show all N" button, so the page doesn't run on; on a phone (under 900 px) the lists have no scroll box of their own (All cards keeps one, 60% of the screen). Maybe and Skipped rows have an Add button (green border).
- **Skipped (cycle 14):** a closed panel after Maybe, "Skipped (N)", built only when opened, with "Nothing you skip is lost".
- **Deck total over 100 (cycle 14):** under the total, "To get back to 100, cut N cards" and that many cut ideas (lowest-Fit cards fill in when the clear ideas run out). The swap prompt under the buttons stays while the deck is over 100 (Skip and Maybe don't hide it); x hides it until the next Add.
- **Card stats line (cycle 14):** "$0.33 · in 50% of EDHREC decks · +32% synergy", one line with an ellipsis; the deck count is in its tooltip, and the opened Fit line explains the EDHREC numbers.
- **Pile row on a phone (cycle 14):** a 28 px fade at the right edge shows it scrolls; the open pile's chip is scrolled into view when a pile opens; used-up chips are hidden unless open.
- **Page width (cycle 14):** `html` and `body` clip sideways overflow, so a card flying off to the right never widens the page (iPhone Safari zoomed out to fit it).
- **One commander (cycle 14):** with a single legendary creature, the commander dropdown shows as plain text.

- **Deck line and Sort (cycle 17):** the deck line reads "Deck: 100 cards" and shares its row with the Sort menu at the top right (a chip-shaped select, blue when it isn't Recommended). From 900 px up the row stops at the card column, so Sort sits over the card, not over the lists. The summary keeps 11.5 rem free on its right for the menu. The row is 28 px tall (the old line was 20 px plus an 8 px margin), and on phones the layout's top margin dropped 12 to 8 px, so `--chrome` didn't change.
- **Card motion (cycle 17):** the next card sits under the top one (4.5% lower, 95% size, 55% opacity) and steps up to full size while the top card flies off (0.2 s), so a swipe never flashes an empty stage. A card let go short of the line springs back with a small overshoot (0.32 s, `cubic-bezier(0.34, 1.56, 0.64, 1)`). A card that didn't come from underneath (a new pile, Undo, a sort) fades in over 0.18 s. Reduced motion turns all of this off.
- **Button feedback (cycle 17):** buttons scale to 95% while pressed. While a drag is past the line, the button it would pick lights up (a stronger fill plus a 2 px ring in its color); a keyboard or button pick lights it for 0.16 s. Phones that support it buzz briefly (15 ms for an add, 8 ms otherwise).
- **Status line (cycle 17):** colored by the choice (green with a check mark for an add, red for a skip, amber for a maybe); the Added or Maybe count, and the phone's progress link, pulse once.
- **Action buttons on touch (cycle 17):** the arrows (keyboard hints) are hidden on touch screens, so the row has room on narrow phones and wide system fonts; the touch hint reads "Swipe right to add, left to skip, up for maybe." and fits one line at 375 px.
- **Empty lists (cycle 17):** an empty Added or Maybe shows one muted line on what goes there; Copy picks shows only once there are picks.
- **Pile counts (cycle 17):** a pile that loads when opened (roles, themes) shows no count until it's opened (tooltip: "Loads when you open it"); "..." now only means loading.
- **Deck bar (cycle 17):** the commander menu stops at 24 rem wide; on phones the deck button is a little tighter (8x10 px padding, 0.92 rem).

- **Fit in words (cycle 21, Nick's cycle 19 pick A):** the fit line under the card starts with "Strong fit", "Some fit" or "Little fit" (from tie-in: 70 and up, 30 and up, below 30; `CS.fitTier`) instead of "Fit 62". "Little fit" is `--muted`; the others are `--text`, bold. The Fit number and its parts are only in the opened fit line. List rows show the same as a 3-dot meter (7 px dots, 3 px apart: strong all three in `--text`, some two in `--muted`, little one in `--muted`, unlit dots in `--line`), labeled for screen readers and in its tooltip, because the words wrapped the card names in a 340 px column. The Your deck panel's title is "Your deck: game plan and roles"; the deck's score is in its first line. The Sort option is "Fits your deck" (tie-in, then Fit).
- **Stats line (cycle 21):** "in 64% of Zurgo decks" (the commander's short name: before a comma, the whole name if 14 characters or less or it starts with "The", else the first word; `CS.shortCommander`) instead of "of EDHREC decks"; the opened fit line says the numbers are EDHREC's.
- **Swap prompt on phones (cycle 21):** at 520 px and under, `.wideonly` text is hidden: "2 over. Cut [card] [Why? (4)] [x]" (wider: "2 over 100. Cut ... Why? Other options (4)"). The Why? button keeps the full words as its label. At 375 px the card name now shows whole (it was "R...").
- **Status line with the swap prompt (cycle 21):** visually hidden (`.vh`) while the prompt shows, so it doesn't repeat it or fall below a 375x667 screen; it stays a live region, so screen readers still hear each swipe.
- **Deck total (cycle 21):** the note reads as a sum: "100 in your deck + 2 added - 1 cut = 101, 1 over 100." The other cut options fold behind a "Show N other cut options" button (not saved; closed on reload).
- **Big screens (cycle 21):** at 1200 px wide and 860 px tall the card can grow to 440 px (1920x1080: 440; 1280x860: 373; 1366x768: unchanged).

## The game-table look (cycle 36)

Nick's picks from the design-council review: look A, the art banner with color tint, and the fonts stored in the repo. The words (a short verdict with the reasons one tap away) are cycle 37.

- **Commander art:** `showDeckIdentity(cmd)` runs when a commander is picked. If the card has an art crop from `cards.scryfall.io`, it shows behind the top 240 px of the page as `body.has-art::before`. It's faded to 32% and masked to nothing toward the bottom. It's a background, so no height changes and `--chrome` stays the same. "Art: <artist>" sits at the right end of the header. With no art crop there's no banner and no credit. `CS.slimCard` now keeps `art` and `artist` (not saved anywhere).
- **Deck colors:** the two spotlights take the commander's first and last colors in WUBRG order. A colorless commander gets gold. Small pips (12 px circles, plain colors, no Wizards symbols) follow the commander menu, named for screen readers ("Colors: white, black, red"). Hidden at 520 px and under, where the deck bar has no room.
- **Fewer boxes:** side sections (Added, Maybe, Skipped, Your deck, Filters) are divided by a `--line-soft` line, not boxed. Pile chips are a soft 5% fill with no outline. On wide screens (1200 px and up) the pile list is plain text, and the open pile gets a gold bar on its left. Every selected state (pile, dropdown, mode switch, plan chips, Sort when changed) uses gold at 16%.
- **Swipe buttons:** pills. Add is solid green with dark text, so it's the main action. Skip and Maybe keep their tinted outline. Undo has no outline.
- **+1:** an Add (not in cut mode) floats a green "+1" up from the Add button for 0.7 s. Off with reduced motion.
- **Phones (520 px and under):** the deck bar's menu text is 0.92 rem and the gaps are 8 px, so "Zurgo Stormrender" stays whole at 375 px in the wider font.

Checked (cycle 36): the page check's 7 screen sizes (buttons and Fit line in view), plus 11 new checks. Also looked at live with real card art at 1280x860 and 375x667.

## Audit, cycle 9 (against these notes)

Every color in the page is now a token above, apart from the action-button tints (the add/skip/maybe colors at 12-34% opacity) the badge colors listed in the table, and the black behind the card and its shadows. Contrast: no visible text below 4.5:1 (checked live). Still off the notes, left as they are because `--chrome` sizing depends on them: about 40 spacing values outside the 4/8/12/16/24 steps (2, 3, 5, 6, 7, 10, 14, 18 px), and 8 text sizes in use where the notes name 3 (0.75 and 0.8 rem are smaller than the footer's 0.78). Tidy these in one pass with a full size check.

## Known gaps

- Short laptop screens (about 700 px tall) get a small card (200 px wide), because the pile chips take three rows there. A side column for piles would fix it.
- Double-faced cards show the front only.
- No light theme.
- The 8 text sizes (see the cycle 9 audit) are still there; Fraunces only replaced the font on headings, not their sizes.
