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

- **Pile row:** chips for the main piles (EDHREC's sections, Budget, Highest Fit, Everything in your colors), then two dropdowns styled as chips: Roles and Themes. A dropdown gets the selected look when one of its piles is open. Under 900 px the dropdowns come first in the row (at most 8.5 rem wide each), so a phone shows them without scrolling sideways.
- **Wide (900 px and up):** two columns. Left: deck bar, piles (wrapping chips), card, buttons. Right (340 px): Added, Maybe, Filters.
- **Narrow (under 900 px):** one column. The deck bar stays on one row, the piles become one row you swipe sideways, and the four buttons share one row. Lists and filters sit below the card.
- **Phone (520 px and under):** the "Commander" label and the header tagline are hidden visually (the label stays for screen readers), and the three "how it works" steps shrink to one line each.
- **Card size:** `width = clamp(200px, min(340px, 86vw, (screen height - --chrome) x 0.7176), 340px)`, where 0.7176 is the card's width/height (488/680). `--chrome` is the height of everything around the card: 454 px wide, 364 px narrow (each raised 24 px in cycle 6 for the Fit line). If something is added above or below the card, raise `--chrome` by its height.

Checked in cycle 4 (Chrome, fixtures): buttons in view at 375x667, 390x844, 412x915, 768x1024, 1366x700, 1280x860 and 1920x1080. Before this pass they were off screen on all three phone sizes and on 1366x700. Checked again in cycle 5 with the new pile row: all seven still in view; the pile row is the same height as before (3 rows wide, 1 row narrow).

- **Fit line (cycle 6):** one line under the card's stats, "Fit 84 · first reason", cut off with an ellipsis. It opens to all the reasons and stays open from card to card once opened. The Fit number is in `--text` and bold; the rest is `--muted`.
- **Your deck panel (cycle 6):** a closed panel in the side column, between Maybe and Filters, titled "Your deck: synergy N/100".

Checked in cycle 6 (Chrome, fixtures): the buttons and the Fit line are in view at all seven sizes above (now part of `tools/page_check.py`).

- **Name line (cycle 7):** the card name and its badges (not on EDHREC, Game Changer, Combo) share one line; the name shortens with an ellipsis to make room. Before this, badges took their own line, which pushed the buttons 8 px off a 375x667 screen on any badged card. `--chrome` didn't change.
- **Combo badge (cycle 7):** a small button styled as a badge, "Combo: completes N". Pressing it shows the combo list under the Fit line (and hides it again); it starts hidden on every card, so it never pushes the buttons down on its own. Green border for brackets 1-2, amber with "(bracket N+)" for 3 and up.
- **First screen (cycle 7):** Paste and load is the main button, then Load deck, Clear and Try a sample deck.

## Known gaps

- Short laptop screens (about 700 px tall) get a small card (200 px wide), because the pile chips take three rows there. A side column for piles would fix it.
- Double-faced cards show the front only.
- No light theme.
