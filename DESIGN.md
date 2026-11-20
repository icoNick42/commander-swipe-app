# Design notes: Commander Swipe

The look and layout rules for `index.html`. Written in PM cycle 4 (2026-11-17). There was no design system before this, so these values are **provisional picks**, not a tested brand. Change them here first, then in the `:root` block of `index.html`, so the two stay in step.

## Principles

1. **The card is the page.** On any screen, the card and the Skip / Maybe / Add buttons fit without scrolling. Everything else (piles, lists, filters) can scroll.
2. **Card images stay whole.** Scryfall's rules: never crop a card or cover the artist and copyright line. Swipe labels (ADD / SKIP / MAYBE) only show while dragging.
3. **Color means the choice.** Green = add, red = skip, amber = maybe, blue = "selected" or the main action. Every colored control also has a text label, so color is never the only signal.
4. **Dark and quiet.** Card art is the color on the page; the interface stays neutral around it.

## Colors (CSS variables in `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#15171c` | page background |
| `--panel` | `#1f232b` | panels, buttons, inputs |
| `--panel-2` | `#262b35` | spare raised surface (not used yet) |
| `--line` | `#333946` | borders and dividers |
| `--text` | `#e8eaf0` | main text |
| `--muted` | `#a3a9b8` | secondary text (7.6:1 on `--bg`, 6.7:1 on `--panel`; WCAG AA needs 4.5:1) |
| `--accent` | `#6ea8fe` | focus ring, step numbers, hover border |
| `--accent-bg` / `--accent-line` | `#2c4a7a` / `#3d63a3` | main button and selected pile |
| `--add` | `#3fb768` | add |
| `--skip` | `#e0575b` | skip |
| `--maybe` | `#e3b341` | maybe |
| `--line-soft` | `#2a2f3a` | dividers between list rows (cycle 9; was a literal) |
| `--accent-hover` | `#34568c` | main button on hover (cycle 9; was a literal) |
| `--accent-text` | `#cfe0ff` | count on the selected pile chip (cycle 9; was a literal) |
| `--error-text` | `#ff8b8b` | error messages (cycle 9; was a literal) |
| `--notice-bg` / `--notice-line` | `#3a2f12` / `#6b5520` | notice box (cycle 9; was a literal) |
| (literal) | `#a26ef0` / `#cbb0ff` | Game Changer badge |
| (literal) | `--add` border, `#9be3b4` text | Combo badge, brackets 1-2 |
| (literal) | `--maybe` border, `#f0d68a` text | Combo badge, bracket 3 and up |

Action buttons use their color as the border plus a see-through fill of the same color (12% for Skip and Maybe, 22% for Add, so Add reads as the main action).

## Spacing, shape, type

- Spacing steps: 4, 8, 12, 16, 24 px (`--space-1` to `--space-5`).
- Corners: 8 px for controls (`--r-sm`), 12 px for panels (`--r-md`), fully round for pile chips.
- Type: the system font at 16 px; small text 0.85-0.9 rem; the footer 0.78 rem. No web fonts (nothing to license or download).
- Touch targets: the action buttons are at least 44 px tall.

## Layout

- **Pile row:** chips for the main piles (Best for your deck first since cycle 12, then EDHREC's sections, Budget, Everything in your colors), then two dropdowns styled as chips: Roles and Themes. A dropdown gets the selected look when one of its piles is open. Under 900 px the dropdowns come first in the row (at most 8.5 rem wide each), so a phone shows them without scrolling sideways.
- **Wide (900 px and up):** two columns. Left: deck bar, piles (wrapping chips), card, buttons. Right (340 px): Added, Maybe, Filters.
- **Narrow (under 900 px):** one column. The deck bar stays on one row, the piles become one row you swipe sideways, and the four buttons share one row. Lists and filters sit below the card.
- **Phone (520 px and under):** the "Commander" label and the header tagline are hidden visually (the label stays for screen readers), and the three "how it works" steps shrink to one line each.
- **Card size:** `width = clamp(200px, min(340px, 86vw, (screen height - --chrome) x 0.7176), 340px)`, where 0.7176 is the card's width/height (488/680). `--chrome` is the height of everything around the card: 454 px wide, 364 px narrow (each raised 24 px in cycle 6 for the Fit line). If something is added above or below the card, raise `--chrome` by its height.

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

- **Lists (cycle 9):** each Added and Maybe row shows the card's Fit ("Fit 72") before its price, in the same muted small text.
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
- **Pile counts (cycle 17):** a pile that loads when opened (Budget, Everything in your colors, roles, themes) shows no count until it's opened (tooltip: "Loads when you open it"); "..." now only means loading.
- **Deck bar (cycle 17):** the commander menu stops at 24 rem wide; on phones the deck button is a little tighter (8x10 px padding, 0.92 rem).

## Audit, cycle 9 (against these notes)

Every color in the page is now a token above, apart from the action-button tints (the add/skip/maybe colors at 12-34% opacity) the badge colors listed in the table, and the black behind the card and its shadows. Contrast: no visible text below 4.5:1 (checked live). Still off the notes, left as they are because `--chrome` sizing depends on them: about 40 spacing values outside the 4/8/12/16/24 steps (2, 3, 5, 6, 7, 10, 14, 18 px), and 8 text sizes in use where the notes name 3 (0.75 and 0.8 rem are smaller than the footer's 0.78). Tidy these in one pass with a full size check.

## Known gaps

- Short laptop screens (about 700 px tall) get a small card (200 px wide), because the pile chips take three rows there. A side column for piles would fix it.
- Double-faced cards show the front only.
- No light theme.
