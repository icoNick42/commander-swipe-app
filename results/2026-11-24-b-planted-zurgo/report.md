# Sim report: 2026-11-24-b-planted-zurgo

Instrument test: Zurgo vs. Zurgo with 8 good cards (Sol Ring, 3 mana rocks, Swords, Skullclamp, Adeline, Cathars' Crusade) swapped for vanilla filler. The sims must clearly see this damage; if they can't, nothing finer counts.

Made 2026-11-25 13:05. 100 of 100 batches in. Forge AI pilots every deck; read the numbers as "played by a mediocre bot": best for mana, curve and version-vs-version tests.

## Decks

| Deck | Games | Win rate (95% range) | vs. baseline | Mulligan | Missed land drops | Lands t5 | Screw | Cmdr turn | Cmdr never | Damage dealt |
|---|---|---|---|---|---|---|---|---|---|---|
| zurgo | 200 | 25% (20%-31%) | baseline | 22% | 1.7 | 4.3 | 20% | 5.2 | 4% | 42 |
| zurgo-planted | 200 | 20% (15%-26%) | -6 pts (-13 to +2) | 6% | 1.9 | 4.1 | 27% | 5.4 | 6% | 25 |

A difference whose range includes 0 isn't one the sims can see yet. Draws and timeouts count as games not won. Paired jobs compare game by game (same seeds, opponents and seats).

## zurgo-planted: the swapped cards

| In | Used | Win rate when used | when not | First turn | AI flag |
|---|---|---|---|---|---|
| Bog Imp | 22% | 24% | 18% | 6.2 |  |
| Bog Raiders | 21% | 26% | 18% | 8.5 |  |
| Eager Cadet | 20% | 30% | 17% | 7.0 |  |
| Goblin Piker | 18% | 17% | 20% | 6.4 |  |
| Gray Ogre | 14% | 21% | 19% | 9.0 |  |
| Hill Giant | 17% | 26% | 18% | 7.5 |  |
| Pikemen | 22% | 30% | 17% | 7.3 |  |
| Raging Goblin | 16% | 24% | 19% | 5.8 |  |

Out: Adeline, Resplendent Cathar, Arcane Signet, Cathars' Crusade, Skullclamp, Sol Ring, Swords to Plowshares, Talisman of Conviction, Talisman of Hierarchy

## zurgo: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| True Conviction | 17% | 62% | 17% | +44 | 9.2 |  |
| Elenda, the Dusk Rose | 17% | 56% | 19% | +37 | 8.4 |  |
| Ruinous Ultimatum | 20% | 51% | 19% | +33 | 9.6 |  |
| Spirit Mantle | 20% | 50% | 19% | +31 | 7.6 |  |
| Duty Beyond Death | 8% | 53% | 22% | +31 | 10.6 |  |
| Grand Crescendo | 8% | 53% | 22% | +31 | 9.9 |  |
| Impact Tremors | 15% | 50% | 21% | +29 | 7.5 |  |
| Cathars' Crusade | 21% | 48% | 19% | +29 | 9.2 |  |
| Battle Angels of Tyr | 20% | 46% | 20% | +26 | 7.6 |  |
| Professional Face-Breaker | 22% | 45% | 19% | +26 | 7.5 |  |
| Zurgo Stormrender | 96% | 26% | 0% | +26 | 5.2 |  |
| Sephiroth, Fabled SOLDIER | 18% | 46% | 20% | +26 | 7.2 |  |
| Gut, True Soul Zealot | 20% | 44% | 20% | +23 | 9.6 |  |
| Soul's Attendant | 17% | 44% | 21% | +23 | 6.4 |  |
| Ocelot Pride | 26% | 42% | 19% | +22 | 6.5 |  |
| Voice of Victory | 24% | 42% | 20% | +22 | 7.9 |  |
| Anim Pakal, Thousandth Moon | 19% | 42% | 21% | +21 | 8.8 |  |
| Soul Warden | 16% | 42% | 22% | +21 | 7.4 |  |
| Command Tower | 25% | 40% | 20% | +20 | - | noncmd |
| Shinka, the Bloodsoaked Keep | 25% | 40% | 20% | +20 | - |  |
| Emeritus of Woe | 21% | 40% | 21% | +20 | 7.9 |  |
| Swords to Plowshares | 20% | 40% | 21% | +19 | 6.0 |  |
| Deadly Dispute | 16% | 41% | 22% | +19 | 9.7 |  |
| Lightning Greaves | 23% | 39% | 21% | +18 | 6.2 |  |
| Dalkovan Encampment | 24% | 39% | 21% | +18 | - |  |
| Trouble in Pairs | 14% | 41% | 23% | +18 | 9.4 |  |
| Urza's Saga | 14% | 41% | 23% | +18 | - |  |
| Flooded Strand | 22% | 39% | 21% | +17 | - |  |
| Endless Foot Assault | 18% | 39% | 22% | +17 | 8.9 |  |
| Elas il-Kor, Sadistic Pilgrim | 21% | 38% | 22% | +17 | 8.2 |  |
| Luxury Suite | 28% | 37% | 20% | +17 | - |  |
| Ophiomancer | 27% | 37% | 21% | +16 | 8.2 |  |
| Deathgreeter | 26% | 37% | 21% | +16 | 7.2 |  |
| Crowded Crypt | 26% | 37% | 21% | +16 | 8.3 |  |
| Vault of Champions | 26% | 37% | 21% | +16 | - |  |
| Ashnod's Altar | 22% | 37% | 22% | +16 | 8.9 |  |
| Warleader's Call | 22% | 37% | 22% | +16 | 7.2 |  |
| Spectator Seating | 23% | 37% | 21% | +16 | - |  |
| Arcane Signet | 18% | 37% | 22% | +15 | 6.3 | noncmd |
| The Masamune | 26% | 35% | 21% | +14 | 6.9 |  |
| Enduring Innocence | 15% | 37% | 23% | +14 | 8.6 |  |
| Mahadi, Emporium Master | 22% | 36% | 22% | +14 | 6.6 |  |
| Brimaz, King of Oreskos | 20% | 36% | 22% | +14 | 7.7 |  |
| Pitiless Plunderer | 20% | 36% | 22% | +14 | 8.7 |  |
| Stadium Headliner | 20% | 35% | 22% | +12 | 7.8 |  |
| Dawn Charm | 16% | 35% | 23% | +12 | 10.3 |  |
| Scalding Tarn | 26% | 34% | 22% | +12 | - |  |
| Plateau | 22% | 34% | 22% | +12 | - |  |
| Phyrexian Tower | 26% | 33% | 22% | +11 | - | all |
| Polluted Delta | 26% | 33% | 22% | +11 | - |  |
| Blood Artist | 22% | 33% | 23% | +11 | 7.5 |  |
| Adeline, Resplendent Cathar | 18% | 33% | 23% | +10 | 8.4 |  |
| Wooded Foothills | 28% | 32% | 22% | +10 | - |  |
| Dark Prophecy | 15% | 33% | 24% | +10 | 9.3 |  |
| Mace of the Valiant | 15% | 33% | 24% | +10 | 7.2 | random |
| Arid Mesa | 14% | 33% | 24% | +10 | - |  |
| Urborg, Tomb of Yawgmoth | 18% | 32% | 23% | +9 | - | random |
| Talisman of Indulgence | 24% | 32% | 23% | +9 | 7.1 |  |
| Eiganjo, Seat of the Empire | 27% | 31% | 23% | +9 | - |  |
| Takenuma, Abandoned Mire | 27% | 31% | 23% | +9 | - |  |
| Mentor of the Meek | 22% | 31% | 23% | +8 | 6.8 |  |
| Generous Plunderer | 20% | 31% | 24% | +7 | 7.0 |  |
| Black Market Connections | 14% | 31% | 24% | +7 | 8.9 |  |
| Woe Strider | 25% | 30% | 23% | +7 | 6.7 |  |
| Badlands | 24% | 30% | 24% | +6 | - |  |
| Untimely Malfunction | 24% | 30% | 24% | +6 | 6.4 |  |
| Esper Sentinel | 22% | 30% | 24% | +6 | 6.6 |  |
| Blade of Selves | 24% | 29% | 24% | +5 | 7.4 | random |
| Skullclamp | 26% | 29% | 24% | +5 | 5.6 |  |
| Bloodstained Mire | 22% | 29% | 24% | +5 | - |  |
| Warren Soultrader | 21% | 29% | 24% | +5 | 7.6 |  |
| Caesar, Legion's Emperor | 26% | 28% | 24% | +4 | 8.8 |  |
| Verdant Catacombs | 26% | 28% | 24% | +4 | - |  |
| Carrion Feeder | 20% | 28% | 24% | +3 | 6.2 |  |
| Staff of the Storyteller | 20% | 28% | 24% | +3 | 7.5 |  |
| Bastion of Remembrance | 19% | 26% | 25% | +2 | 8.0 |  |
| Blood Crypt | 20% | 25% | 25% | +0 | - |  |
| Scrubland | 18% | 25% | 25% | +0 | - |  |
| Sacred Foundry | 22% | 24% | 25% | -1 | - |  |
| Jadar, Ghoulcaller of Nephalia | 20% | 24% | 25% | -1 | 5.2 |  |
| Ainok Strike Leader | 29% | 24% | 25% | -1 | 7.4 |  |
| Black Market | 17% | 24% | 25% | -2 | 9.1 |  |
| Marsh Flats | 20% | 22% | 26% | -3 | - |  |
| Grim Hireling | 18% | 22% | 26% | -3 | 7.6 |  |
| Phyrexian Altar | 16% | 21% | 26% | -5 | 8.5 | random |
| Talisman of Conviction | 16% | 21% | 26% | -5 | 6.3 |  |
| Talisman of Hierarchy | 22% | 21% | 26% | -5 | 6.9 |  |
| Godless Shrine | 18% | 19% | 26% | -7 | - |  |
| Sol Ring | 22% | 19% | 27% | -8 | 5.3 |  |
| Windswept Heath | 26% | 17% | 28% | -10 | - |  |
| Goblin Bombardment | 0% | - | 25% | - | - | all |
| Indulge | 0% | - | 25% | - | - |  |
| Reconnaissance | 0% | - | 25% | - | - | all |
| Viscera Seer | 0% | - | 25% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer

## zurgo-planted: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| Ruinous Ultimatum | 14% | 56% | 14% | +42 | 10.4 |  |
| Warleader's Call | 25% | 42% | 12% | +30 | 7.5 |  |
| Pitiless Plunderer | 18% | 41% | 15% | +26 | 8.7 |  |
| Crowded Crypt | 19% | 39% | 15% | +25 | 7.3 |  |
| Duty Beyond Death | 11% | 41% | 17% | +24 | 10.3 |  |
| Dark Prophecy | 8% | 41% | 17% | +24 | 11.0 |  |
| Anim Pakal, Thousandth Moon | 20% | 38% | 15% | +24 | 9.6 |  |
| Deathgreeter | 21% | 38% | 15% | +24 | 6.2 |  |
| True Conviction | 14% | 39% | 16% | +23 | 9.4 |  |
| Elenda, the Dusk Rose | 18% | 38% | 15% | +23 | 8.8 |  |
| Zurgo Stormrender | 94% | 21% | 0% | +21 | 5.4 |  |
| Spirit Mantle | 18% | 35% | 16% | +19 | 6.8 |  |
| Brimaz, King of Oreskos | 29% | 33% | 14% | +19 | 7.5 |  |
| Battle Angels of Tyr | 28% | 33% | 14% | +18 | 8.0 |  |
| Endless Foot Assault | 16% | 34% | 17% | +18 | 8.3 |  |
| Sephiroth, Fabled SOLDIER | 21% | 33% | 16% | +18 | 7.5 |  |
| Ophiomancer | 20% | 33% | 16% | +17 | 8.5 |  |
| Vault of Champions | 26% | 32% | 15% | +17 | - |  |
| Sacred Foundry | 18% | 32% | 17% | +16 | - |  |
| Deadly Dispute | 12% | 33% | 18% | +16 | 9.4 |  |
| Arid Mesa | 17% | 32% | 17% | +15 | - |  |
| Trouble in Pairs | 14% | 32% | 17% | +15 | 8.6 |  |
| Emeritus of Woe | 20% | 31% | 17% | +14 | 7.5 |  |
| Urza's Saga | 22% | 30% | 17% | +14 | - |  |
| Dawn Charm | 18% | 31% | 17% | +13 | 10.6 |  |
| Eager Cadet | 20% | 30% | 17% | +13 | 7.0 |  |
| Pikemen | 22% | 30% | 17% | +13 | 7.3 |  |
| Command Tower | 18% | 30% | 17% | +13 | - | noncmd |
| Elas il-Kor, Sadistic Pilgrim | 18% | 30% | 17% | +13 | 5.9 |  |
| Gut, True Soul Zealot | 20% | 29% | 17% | +12 | 8.0 |  |
| Impact Tremors | 18% | 29% | 18% | +11 | 6.7 |  |
| Jadar, Ghoulcaller of Nephalia | 22% | 28% | 17% | +11 | 6.1 |  |
| Blood Crypt | 26% | 27% | 17% | +11 | - |  |
| Enduring Innocence | 16% | 28% | 18% | +10 | 8.2 |  |
| Shinka, the Bloodsoaked Keep | 26% | 27% | 17% | +10 | - |  |
| Ocelot Pride | 20% | 28% | 18% | +10 | 6.5 |  |
| Scalding Tarn | 24% | 27% | 17% | +10 | - |  |
| Luxury Suite | 22% | 27% | 17% | +10 | - |  |
| Esper Sentinel | 12% | 28% | 18% | +10 | 5.8 |  |
| Verdant Catacombs | 22% | 27% | 17% | +9 | - |  |
| Generous Plunderer | 18% | 27% | 18% | +9 | 7.9 |  |
| Staff of the Storyteller | 18% | 27% | 18% | +9 | 7.4 |  |
| Warren Soultrader | 18% | 27% | 18% | +9 | 7.5 |  |
| Black Market Connections | 11% | 27% | 19% | +9 | 8.8 |  |
| Bog Raiders | 21% | 26% | 18% | +8 | 8.5 |  |
| Blade of Selves | 17% | 26% | 18% | +8 | 6.8 | random |
| Hill Giant | 17% | 26% | 18% | +8 | 7.5 |  |
| Mace of the Valiant | 26% | 25% | 17% | +8 | 7.2 | random |
| Flooded Strand | 24% | 26% | 18% | +8 | - |  |
| Dalkovan Encampment | 22% | 26% | 18% | +8 | - |  |
| Ainok Strike Leader | 20% | 26% | 18% | +8 | 7.2 |  |
| Godless Shrine | 18% | 26% | 18% | +8 | - |  |
| Spectator Seating | 24% | 25% | 18% | +7 | - |  |
| Marsh Flats | 22% | 25% | 18% | +7 | - |  |
| Grim Hireling | 18% | 25% | 18% | +7 | 7.6 |  |
| Wooded Foothills | 18% | 25% | 18% | +7 | - |  |
| Bog Imp | 22% | 24% | 18% | +6 | 6.2 |  |
| Stadium Headliner | 20% | 24% | 18% | +6 | 5.8 |  |
| Bastion of Remembrance | 18% | 24% | 18% | +6 | 9.0 |  |
| Talisman of Indulgence | 18% | 24% | 18% | +6 | 7.6 |  |
| Raging Goblin | 16% | 24% | 19% | +6 | 5.8 |  |
| Caesar, Legion's Emperor | 19% | 24% | 19% | +5 | 8.1 |  |
| Black Market | 17% | 24% | 19% | +5 | 8.6 |  |
| Badlands | 24% | 23% | 18% | +4 | - |  |
| Takenuma, Abandoned Mire | 26% | 23% | 18% | +4 | - |  |
| Mahadi, Emporium Master | 18% | 22% | 19% | +3 | 7.6 |  |
| Professional Face-Breaker | 18% | 22% | 19% | +3 | 7.3 |  |
| Untimely Malfunction | 21% | 21% | 19% | +2 | 5.9 |  |
| Gray Ogre | 14% | 21% | 19% | +1 | 9.0 |  |
| The Masamune | 17% | 21% | 19% | +1 | 6.9 |  |
| Carrion Feeder | 22% | 20% | 19% | +1 | 5.0 |  |
| Voice of Victory | 18% | 20% | 19% | +1 | 6.2 |  |
| Grand Crescendo | 15% | 20% | 19% | +1 | 10.0 |  |
| Windswept Heath | 23% | 20% | 19% | +0 | - |  |
| Plateau | 18% | 19% | 20% | +0 | - |  |
| Phyrexian Altar | 16% | 19% | 20% | -1 | 8.4 | random |
| Soul's Attendant | 16% | 19% | 20% | -1 | 6.8 |  |
| Lightning Greaves | 20% | 18% | 20% | -2 | 5.6 |  |
| Phyrexian Tower | 20% | 18% | 20% | -2 | - | all |
| Bloodstained Mire | 22% | 18% | 20% | -2 | - |  |
| Mentor of the Meek | 20% | 18% | 20% | -3 | 6.7 |  |
| Goblin Piker | 18% | 17% | 20% | -3 | 6.4 |  |
| Blood Artist | 20% | 17% | 20% | -3 | 7.7 |  |
| Polluted Delta | 18% | 17% | 20% | -3 | - |  |
| Ashnod's Altar | 12% | 16% | 20% | -4 | 8.0 |  |
| Urborg, Tomb of Yawgmoth | 18% | 16% | 20% | -4 | - | random |
| Soul Warden | 16% | 16% | 20% | -5 | 6.4 |  |
| Woe Strider | 18% | 14% | 21% | -7 | 6.6 |  |
| Eiganjo, Seat of the Empire | 26% | 13% | 22% | -9 | - |  |
| Scrubland | 16% | 10% | 21% | -12 | - |  |
| Goblin Bombardment | 0% | - | 20% | - | - | all |
| Indulge | 0% | - | 20% | - | - |  |
| Reconnaissance | 0% | - | 20% | - | - | all |
| Viscera Seer | 0% | - | 20% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer

## Check by hand (Manafold or the Forge window)

Bots can be wrong about a card. Before acting on a finding, play or watch a few games and check:
- zurgo: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Reconnaissance, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo: rarely or never used by the bot: Duty Beyond Death, Goblin Bombardment, Grand Crescendo, Indulge, Reconnaissance, Viscera Seer. Clunky, or just misplayed?
- zurgo-planted: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Reconnaissance, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo-planted: rarely or never used by the bot: Dark Prophecy, Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer. Clunky, or just misplayed?
- Record hand-played games in results/<job>/manual.csv (columns: date, platform, deck, seat, won, turns, notes).
