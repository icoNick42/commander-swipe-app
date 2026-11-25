# Sim report: 2026-11-24-a-noise-zurgo

Noise test: the same Zurgo list entered twice with different seeds. Any difference is pure luck, which shows how big a real change has to be before the sims can see it.

Made 2026-11-25 10:01. 100 of 100 batches in. Forge AI pilots every deck; read the numbers as "played by a mediocre bot": best for mana, curve and version-vs-version tests.

## Decks

| Deck | Games | Win rate (95% range) | vs. baseline | Mulligan | Missed land drops | Lands t5 | Screw | Cmdr turn | Cmdr never | Damage dealt |
|---|---|---|---|---|---|---|---|---|---|---|
| zurgo-a | 200 | 26% (20%-32%) | baseline | 26% | 1.7 | 4.3 | 21% | 5.3 | 2% | 47 |
| zurgo-b | 200 | 27% (21%-34%) | +2 pts (-7 to +10) | 24% | 1.7 | 4.1 | 28% | 5.3 | 6% | 39 |

A difference whose range includes 0 isn't one the sims can see yet. Draws and timeouts count as games not won. Paired jobs compare game by game (same seeds, opponents and seats).

## zurgo-a: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| Ruinous Ultimatum | 23% | 65% | 14% | +52 | 10.5 |  |
| Bastion of Remembrance | 15% | 53% | 21% | +33 | 9.5 |  |
| Emeritus of Woe | 22% | 51% | 18% | +33 | 8.4 |  |
| Dark Prophecy | 14% | 52% | 21% | +30 | 8.1 |  |
| Elas il-Kor, Sadistic Pilgrim | 20% | 49% | 20% | +29 | 8.1 |  |
| Zurgo Stormrender | 98% | 26% | 0% | +26 | 5.3 |  |
| Grim Hireling | 16% | 47% | 21% | +25 | 7.9 |  |
| Endless Foot Assault | 18% | 46% | 21% | +25 | 7.1 |  |
| Gut, True Soul Zealot | 20% | 45% | 21% | +24 | 8.5 |  |
| Swords to Plowshares | 20% | 45% | 21% | +24 | 6.8 |  |
| Brimaz, King of Oreskos | 22% | 44% | 20% | +24 | 7.8 |  |
| Deathgreeter | 26% | 43% | 19% | +24 | 6.2 |  |
| Soul Warden | 20% | 44% | 21% | +23 | 7.2 |  |
| Mace of the Valiant | 28% | 41% | 19% | +22 | 8.4 | random |
| Sephiroth, Fabled SOLDIER | 24% | 42% | 20% | +21 | 7.1 |  |
| Verdant Catacombs | 18% | 43% | 22% | +21 | - |  |
| Elenda, the Dusk Rose | 22% | 42% | 21% | +21 | 8.4 |  |
| Black Market | 19% | 42% | 22% | +21 | 8.0 |  |
| Urborg, Tomb of Yawgmoth | 19% | 42% | 22% | +21 | - | random |
| Duty Beyond Death | 8% | 44% | 24% | +20 | 10.6 |  |
| True Conviction | 22% | 41% | 21% | +20 | 8.7 |  |
| Cathars' Crusade | 20% | 41% | 22% | +19 | 8.3 |  |
| Flooded Strand | 20% | 41% | 22% | +19 | - |  |
| Adeline, Resplendent Cathar | 24% | 40% | 21% | +19 | 8.2 |  |
| Lightning Greaves | 24% | 40% | 21% | +19 | 7.4 |  |
| Enduring Innocence | 18% | 41% | 22% | +18 | 8.6 |  |
| Pitiless Plunderer | 23% | 39% | 21% | +18 | 8.4 |  |
| Godless Shrine | 19% | 39% | 22% | +17 | - |  |
| Battle Angels of Tyr | 22% | 39% | 22% | +17 | 6.9 |  |
| Blade of Selves | 22% | 39% | 22% | +17 | 7.6 | random |
| Marsh Flats | 24% | 38% | 22% | +17 | - |  |
| Impact Tremors | 25% | 38% | 21% | +17 | 6.3 |  |
| Talisman of Hierarchy | 18% | 39% | 23% | +16 | 9.0 |  |
| Sol Ring | 27% | 37% | 21% | +16 | 6.0 |  |
| Soul's Attendant | 24% | 38% | 22% | +16 | 5.8 |  |
| Ashnod's Altar | 18% | 38% | 23% | +15 | 9.0 |  |
| Staff of the Storyteller | 18% | 38% | 23% | +15 | 7.0 |  |
| Luxury Suite | 23% | 37% | 22% | +15 | - |  |
| Warleader's Call | 23% | 37% | 22% | +15 | 7.2 |  |
| Ocelot Pride | 24% | 36% | 22% | +14 | 6.5 |  |
| Vault of Champions | 28% | 35% | 22% | +13 | - |  |
| Arcane Signet | 26% | 35% | 22% | +13 | 6.6 | noncmd |
| Esper Sentinel | 18% | 36% | 23% | +13 | 7.4 |  |
| Black Market Connections | 14% | 36% | 24% | +12 | 8.6 |  |
| Scrubland | 18% | 35% | 23% | +12 | - |  |
| Anim Pakal, Thousandth Moon | 17% | 35% | 23% | +12 | 9.0 |  |
| Dalkovan Encampment | 32% | 33% | 22% | +11 | - |  |
| Dawn Charm | 14% | 34% | 24% | +11 | 9.4 |  |
| Skullclamp | 20% | 33% | 24% | +10 | 6.1 |  |
| Urza's Saga | 22% | 33% | 24% | +9 | - |  |
| Eiganjo, Seat of the Empire | 26% | 32% | 23% | +9 | - |  |
| Takenuma, Abandoned Mire | 25% | 32% | 23% | +9 | - |  |
| Warren Soultrader | 24% | 32% | 24% | +8 | 6.7 |  |
| The Masamune | 17% | 32% | 24% | +8 | 7.6 |  |
| Command Tower | 26% | 31% | 23% | +8 | - | noncmd |
| Caesar, Legion's Emperor | 20% | 32% | 24% | +8 | 8.4 |  |
| Jadar, Ghoulcaller of Nephalia | 19% | 32% | 24% | +8 | 7.4 |  |
| Stadium Headliner | 19% | 32% | 24% | +8 | 7.1 |  |
| Mahadi, Emporium Master | 22% | 31% | 24% | +7 | 7.4 |  |
| Generous Plunderer | 18% | 31% | 24% | +7 | 7.0 |  |
| Crowded Crypt | 24% | 31% | 24% | +7 | 6.8 |  |
| Untimely Malfunction | 24% | 31% | 24% | +7 | 7.0 |  |
| Shinka, the Bloodsoaked Keep | 23% | 30% | 24% | +6 | - |  |
| Phyrexian Tower | 26% | 30% | 24% | +6 | - | all |
| Wooded Foothills | 27% | 30% | 24% | +6 | - |  |
| Voice of Victory | 15% | 30% | 25% | +5 | 6.1 |  |
| Grand Crescendo | 18% | 30% | 25% | +5 | 8.8 |  |
| Phyrexian Altar | 18% | 30% | 25% | +5 | 7.6 | random |
| Polluted Delta | 22% | 30% | 24% | +5 | - |  |
| Talisman of Indulgence | 22% | 30% | 24% | +5 | 7.3 |  |
| Blood Artist | 20% | 29% | 25% | +5 | 8.0 |  |
| Scalding Tarn | 20% | 29% | 25% | +5 | - |  |
| Talisman of Conviction | 20% | 29% | 25% | +5 | 6.0 |  |
| Sacred Foundry | 17% | 29% | 25% | +5 | - |  |
| Ophiomancer | 23% | 28% | 25% | +4 | 8.5 |  |
| Spirit Mantle | 22% | 28% | 25% | +3 | 6.2 |  |
| Woe Strider | 16% | 27% | 25% | +2 | 7.6 |  |
| Arid Mesa | 28% | 27% | 25% | +2 | - |  |
| Mentor of the Meek | 19% | 26% | 25% | +1 | 6.8 |  |
| Professional Face-Breaker | 23% | 26% | 25% | +1 | 7.3 |  |
| Plateau | 20% | 26% | 25% | +0 | - |  |
| Carrion Feeder | 22% | 24% | 26% | -1 | 7.0 |  |
| Windswept Heath | 24% | 23% | 26% | -3 | - |  |
| Spectator Seating | 28% | 23% | 26% | -3 | - |  |
| Trouble in Pairs | 18% | 23% | 26% | -3 | 8.4 |  |
| Ainok Strike Leader | 22% | 23% | 26% | -4 | 7.4 |  |
| Deadly Dispute | 12% | 22% | 26% | -4 | 9.6 |  |
| Badlands | 16% | 22% | 26% | -4 | - |  |
| Bloodstained Mire | 26% | 21% | 27% | -6 | - |  |
| Blood Crypt | 18% | 17% | 27% | -10 | - |  |
| Goblin Bombardment | 0% | - | 26% | - | - | all |
| Indulge | 0% | - | 26% | - | - |  |
| Reconnaissance | 0% | - | 26% | - | - | all |
| Viscera Seer | 0% | - | 26% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer

## zurgo-b: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| Ruinous Ultimatum | 18% | 70% | 17% | +53 | 9.9 |  |
| Deadly Dispute | 12% | 61% | 23% | +38 | 9.7 |  |
| Caesar, Legion's Emperor | 18% | 54% | 21% | +33 | 7.3 |  |
| True Conviction | 20% | 52% | 21% | +32 | 8.9 |  |
| Duty Beyond Death | 11% | 55% | 24% | +31 | 10.7 |  |
| Grand Crescendo | 10% | 52% | 24% | +28 | 9.5 |  |
| Sephiroth, Fabled SOLDIER | 20% | 49% | 22% | +27 | 7.5 |  |
| Professional Face-Breaker | 19% | 47% | 22% | +25 | 7.9 |  |
| Bastion of Remembrance | 14% | 48% | 23% | +25 | 8.0 |  |
| Elenda, the Dusk Rose | 14% | 48% | 23% | +25 | 8.3 |  |
| Talisman of Conviction | 20% | 46% | 22% | +24 | 7.2 |  |
| Blade of Selves | 24% | 45% | 21% | +24 | 6.3 | random |
| Swords to Plowshares | 16% | 47% | 23% | +24 | 6.4 |  |
| Mace of the Valiant | 22% | 44% | 22% | +22 | 7.5 | random |
| Luxury Suite | 26% | 43% | 21% | +22 | - |  |
| Woe Strider | 23% | 43% | 22% | +21 | 7.7 |  |
| Generous Plunderer | 18% | 44% | 23% | +21 | 5.4 |  |
| Ophiomancer | 20% | 44% | 23% | +21 | 8.2 |  |
| Warren Soultrader | 20% | 44% | 23% | +21 | 7.5 |  |
| Spirit Mantle | 22% | 43% | 22% | +21 | 7.0 |  |
| Warleader's Call | 28% | 42% | 21% | +20 | 7.0 |  |
| Emeritus of Woe | 24% | 43% | 22% | +20 | 7.7 |  |
| Endless Foot Assault | 18% | 43% | 23% | +20 | 6.5 |  |
| Zurgo Stormrender | 94% | 28% | 9% | +19 | 5.3 |  |
| Command Tower | 28% | 40% | 22% | +18 | - | noncmd |
| Dark Prophecy | 16% | 42% | 24% | +18 | 9.5 |  |
| Stadium Headliner | 16% | 42% | 24% | +18 | 7.2 |  |
| Dawn Charm | 13% | 42% | 25% | +18 | 10.5 |  |
| Cathars' Crusade | 20% | 41% | 24% | +17 | 8.5 |  |
| Shinka, the Bloodsoaked Keep | 28% | 39% | 22% | +17 | - |  |
| Urza's Saga | 14% | 41% | 25% | +16 | - |  |
| Staff of the Storyteller | 18% | 40% | 24% | +16 | 7.3 |  |
| Esper Sentinel | 23% | 39% | 23% | +16 | 6.5 |  |
| Impact Tremors | 15% | 40% | 25% | +15 | 8.2 |  |
| Brimaz, King of Oreskos | 20% | 39% | 24% | +15 | 7.3 |  |
| Enduring Innocence | 20% | 38% | 24% | +14 | 8.1 |  |
| Adeline, Resplendent Cathar | 21% | 38% | 24% | +14 | 7.5 |  |
| Scrubland | 22% | 38% | 24% | +14 | - |  |
| Takenuma, Abandoned Mire | 22% | 38% | 24% | +14 | - |  |
| Black Market | 18% | 38% | 25% | +13 | 8.5 |  |
| Soul's Attendant | 20% | 38% | 24% | +13 | 6.4 |  |
| Deathgreeter | 19% | 37% | 25% | +12 | 6.7 |  |
| Marsh Flats | 20% | 37% | 25% | +12 | - |  |
| Crowded Crypt | 24% | 36% | 24% | +12 | 6.8 |  |
| Verdant Catacombs | 24% | 36% | 24% | +12 | - |  |
| Elas il-Kor, Sadistic Pilgrim | 18% | 36% | 25% | +11 | 6.9 |  |
| Battle Angels of Tyr | 24% | 35% | 24% | +11 | 7.5 |  |
| Sacred Foundry | 22% | 36% | 25% | +11 | - |  |
| Sol Ring | 22% | 36% | 25% | +11 | 3.7 |  |
| Eiganjo, Seat of the Empire | 29% | 34% | 24% | +11 | - |  |
| Wooded Foothills | 28% | 35% | 24% | +10 | - |  |
| Grim Hireling | 23% | 35% | 25% | +10 | 7.7 |  |
| Vault of Champions | 22% | 34% | 25% | +9 | - |  |
| Mahadi, Emporium Master | 20% | 34% | 25% | +9 | 7.6 |  |
| Untimely Malfunction | 20% | 34% | 25% | +9 | 6.8 |  |
| Pitiless Plunderer | 19% | 34% | 25% | +9 | 8.3 |  |
| Anim Pakal, Thousandth Moon | 18% | 34% | 25% | +9 | 8.2 |  |
| Black Market Connections | 18% | 34% | 25% | +9 | 9.0 |  |
| Trouble in Pairs | 18% | 34% | 25% | +9 | 8.0 |  |
| Ocelot Pride | 24% | 33% | 25% | +8 | 5.5 |  |
| Ainok Strike Leader | 22% | 33% | 25% | +8 | 6.2 |  |
| Spectator Seating | 22% | 33% | 25% | +8 | - |  |
| Talisman of Indulgence | 22% | 33% | 25% | +8 | 6.6 |  |
| Urborg, Tomb of Yawgmoth | 20% | 33% | 25% | +8 | - | random |
| Phyrexian Tower | 24% | 33% | 25% | +7 | - | all |
| The Masamune | 22% | 33% | 25% | +7 | 7.7 |  |
| Skullclamp | 25% | 32% | 25% | +7 | 6.0 |  |
| Gut, True Soul Zealot | 16% | 32% | 26% | +6 | 8.4 |  |
| Flooded Strand | 22% | 32% | 26% | +6 | - |  |
| Dalkovan Encampment | 27% | 31% | 25% | +6 | - |  |
| Blood Artist | 20% | 32% | 26% | +6 | 7.2 |  |
| Phyrexian Altar | 19% | 32% | 26% | +6 | 7.7 | random |
| Voice of Victory | 22% | 31% | 26% | +5 | 7.2 |  |
| Jadar, Ghoulcaller of Nephalia | 21% | 31% | 26% | +5 | 7.1 |  |
| Badlands | 24% | 31% | 26% | +5 | - |  |
| Blood Crypt | 18% | 31% | 26% | +4 | - |  |
| Arid Mesa | 28% | 29% | 26% | +3 | - |  |
| Polluted Delta | 20% | 29% | 26% | +3 | - |  |
| Bloodstained Mire | 19% | 29% | 27% | +2 | - |  |
| Carrion Feeder | 18% | 29% | 27% | +2 | 6.9 |  |
| Godless Shrine | 26% | 28% | 27% | +2 | - |  |
| Mentor of the Meek | 24% | 28% | 27% | +1 | 7.1 |  |
| Scalding Tarn | 22% | 27% | 27% | +0 | - |  |
| Plateau | 25% | 26% | 27% | -1 | - |  |
| Windswept Heath | 18% | 26% | 27% | -2 | - |  |
| Soul Warden | 24% | 26% | 27% | -2 | 6.3 |  |
| Ashnod's Altar | 16% | 24% | 28% | -3 | 8.0 |  |
| Arcane Signet | 23% | 24% | 28% | -4 | 5.8 | noncmd |
| Talisman of Hierarchy | 17% | 24% | 28% | -4 | 5.8 |  |
| Lightning Greaves | 16% | 23% | 28% | -5 | 5.8 |  |
| Goblin Bombardment | 0% | - | 27% | - | - | all |
| Indulge | 0% | - | 27% | - | - |  |
| Reconnaissance | 0% | - | 27% | - | - | all |
| Viscera Seer | 0% | - | 27% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer

## Check by hand (Manafold or the Forge window)

Bots can be wrong about a card. Before acting on a finding, play or watch a few games and check:
- zurgo-a: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Reconnaissance, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo-a: rarely or never used by the bot: Duty Beyond Death, Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer. Clunky, or just misplayed?
- zurgo-b: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Reconnaissance, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo-b: rarely or never used by the bot: Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer. Clunky, or just misplayed?
- Record hand-played games in results/<job>/manual.csv (columns: date, platform, deck, seat, won, turns, notes).
