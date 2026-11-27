# Commander Swipe sims

This branch (`sims`) runs Forge games on Nick's PCs with no one watching, so the app's advice can be checked against games: "if I make the app's swaps, does the deck win more?" It's kept apart from `main`, so nothing here touches the app or its GitHub Pages site.

## How it works

1. **Jobs** (`jobs/*.json`) say which decks to test, which opponents to draw from, and how many games to play.
2. **The board** (`run_board.py`) runs on each PC. It starts at logon, pulls this branch, plays its share of each job's games at below-normal priority, and pushes the results back. When a job finishes, it writes `results/<job>/report.md` and `summary.json`.
3. **When nothing is queued**, it plays the standing job (`jobs/standing.json`): Nick's decks against the gauntlet, to build up per-card data.
4. **App variants** are built on the PC too. A test written as `{"base": ..., "export": ..., "app_swaps": 5}` runs the app's own logic (`core.js` from `main`, via `tools/app_swaps.js`) and takes its top 5 picks with their paired cuts. Each time the app changes, a new job checks it again, with no one in the loop.

Claude only needs to come in to decide what to test next and to change the app's rules. Reading a finished job takes one small file (`summary.json`).

## Playing yourself

- **Forge:** double-click `Play Forge.cmd` in the Forge folder. It pauses the sims, opens Forge, and starts the sims again when you close it. Your decks and every app variant appear in Forge's Commander deck list with a "CS" prefix.
- **Manafold:** `Manafold.url` opens playmanafold.com. Paste a list from `decks/nick/*.txt`, or a variant's `.txt` under `decks/variants/`. The sims keep running (they use spare CPU only). Run `Pause sims.cmd` if the PC feels slow.
- **Record games you played** (Forge or Manafold) in `results/<job>/manual.csv`, using the columns in `results/manual-template.csv`. A report's "Check by hand" list says what to watch for.
- `Sim status.cmd` shows what the board is doing. `Pause sims.cmd` and `Resume sims.cmd` do what their names say.

## Adding or updating a deck (no Claude needed)

Put the deck's Moxfield export (Export, then "Copy for Moxfield") in `decks/nick/<name>.txt`. Put the commander first, or under a "Commander" heading. You can add the file through github.com, on a phone too: open this branch, then Add file. The board turns it into `<name>.dck` on its next round. To put the deck in the background games, add `"<name>": "decks/nick/<name>.dck"` to `tests` in `jobs/standing.json`.

## Opponents: your picks and the rotation

- **Your picks** (`decks/picks/`): decks you choose. They never rotate out. Add one by pasting a Moxfield link or export into any Claude chat ("add to my picks"), or put its Moxfield export in `decks/picks/<name>.txt` on github.com (a phone works). The board converts it like your own decks. Delete the file to drop it.
- **The rotation** (`decks/rotation/`): about 30 popular Archidekt decks across game plans, refreshed once a week by the laptop. Each refresh retires the 6 oldest to `decks/retired/` (kept so old results can be rerun) and brings in new ones. `decks/rotation/pool.json` lists each deck's plan, power, Archidekt link and date added.
- **Power** (`decks/power.json`): every opponent gets a spot on Manafold's slider: Bracket 2-4, each Low/Mid/High, then Bracket 5 (steps 0-9). The bracket follows the official rules (Game Changers, two-card combos from Commander Spellbook, mass land denial, extra turns); Low/Mid/High comes from tutors, fast mana, cheap interaction, card draw, combos and the curve. `python -m forgesim.power` scores new decks; the laptop does it on its own.
- **Windows** (`decks/pools.json`): `default` is Bracket 2 Mid to Bracket 3 High (steps 1-5), your "mid-high 2 to mid-high 3". `precon` is 0-2 and `high` is 4-8. Change the numbers there to move them.
- **At the table:** when you have picks, one sits at every game (`picks_per_game`), and the rotation and gauntlet decks in the window fill the other seats.
- **Fair tests:** make a job with `python -m forgesim.newjob <id> zurgo=decks/nick/zurgo.dck ...`. It writes the opponents into the job file by name, so a refresh can't change a test halfway. Only the standing job follows the pool as it changes.

## Offline copies on each PC

`sync/mirrors.json` lists folders the board copies onto a PC, adding and updating files there but never deleting. Today: the Scryfall search page and scripts go to the desktop's `D:\Claude\Scryfall Local`, and the first time, the board downloads the card data and images there in the background (`first_run.log` in that folder shows progress).

## Setup on a PC (once)

You need Forge in a folder with `app\` and `jre\` (as already set up), plus Git and Python. Node is only needed for building app variants. In PowerShell:

    irm https://raw.githubusercontent.com/icoNick42/commander-swipe-app/sims/setup/install.ps1 -OutFile $env:TEMP\cs-sims.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\cs-sims.ps1 -Name desktop

Use `-Name laptop` on the server laptop. Running it again updates the setup.

## Good to know

- A PC that sleeps doesn't run sims. The board asks Windows to stay awake while it works, and the installer turns off sleep when plugged in. On the laptop, set the lid-close action (plugged in) to "Do nothing".
- After a Windows Update restart, the board waits until someone signs in.
- The board updates itself: when the code on this branch changes, it restarts into the new version on its next round.
- A batch that gives no games twice (a deck Forge can't load, say) is set aside. `board.log` says why.
- Full game logs stay on each PC in `sim-work\logs` for 14 days. Only the numbers are uploaded.

## Reading the numbers

- Every seat is played by Forge's AI, a mediocre pilot that's weak with combos, politics and sacrifice outlets. The numbers mean "played by a bot". They're best for mana, curve and version-against-version tests.
- Forge replays a game exactly from its seed (same decks, same seed: the same game). Paired jobs give every test deck the same seeds, opponents and seats, so both versions face the same tables. A variant's own draws still differ from turn 1 (checked: Forge builds the library in its own order), so pairing evens out the tables, not the deck's own luck. Plan on the game counts in the brainstorm doc.
- A win-rate difference whose 95% range includes 0 isn't one the sims can see yet.
- Per-card win rates (17lands-style: "when cast" vs "when not") favor finishers and undersell cheap cards. Cards Forge flags as hard for its AI (`AI:RemoveDeck`) are marked.

## Layout

- `forgesim/`: `decks.py` (export to .dck, swaps), `parse.py` (Forge log to numbers), `runner.py` (batches), `board.py` (the loop), `variants.py` (app variants), `analyze.py` (reports), `forge_cards.tsv` (Forge 2.0.16's card list with its AI flags)
- `tools/app_swaps.js`: the app's picks and cuts for a deck. `tools/build_cardlist.py` rebuilds `forge_cards.tsv` when Forge updates.
- `decks/nick/` (your decks), `decks/picks/` (your chosen opponents), `decks/rotation/` (the weekly pool), `decks/retired/`, `decks/gauntlet-a/` (12 Forge precons), `decks/gauntlet-b/` (29 more precons, the optional precon pool), `decks/test/` (hand-made test decks), `decks/variants/` (built by the board), `decks/pools.json` (windows and rotation settings), `decks/power.json` (scores)
- `forgesim/power.py` (power scores), `forgesim/rotation.py` (weekly refresh), `forgesim/newjob.py` (jobs with frozen opponents), `forgesim/mirror.py` (offline copies)
- `sync/` (folders copied onto PCs)
- `jobs/`, `results/`
- `setup/install.ps1`

## Job fields

`id`, `note`, `tests` (label to deck path or variant recipe; the first is the baseline), `opponents` (paths or globs), `window` (a name from pools.json or [low, high] steps; opponents with no score are left out), `picks` (paths or globs; `picks_per_game` of them at every table), `games_per_test`, `games_per_batch`, `pod` (players per game, default 4), `clock` (seconds before Forge calls a game a draw), `seed`, `paired` (default true), `machines` (which PCs share the batches; the first one builds variants and writes the report), `priority` (higher runs first), `status` (`active`, `paused`, `done`), `mc` (Forge's stronger Monte Carlo AI: `on` or `max`; slower).
