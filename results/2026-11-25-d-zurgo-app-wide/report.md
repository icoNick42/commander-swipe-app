# Sim report: 2026-11-25-d-zurgo-app-wide

The app test again, against 41 opponents covering ~20 game plans (gauntlets A and B) instead of 12 precons: does the app's top-5 still beat the list as is and the staples control when the tables vary more?

Made 2026-11-26 04:02. 225 of 225 batches in. Forge AI pilots every deck; read the numbers as "played by a mediocre bot": best for mana, curve and version-vs-version tests.

## Decks

| Deck | Games | Win rate (95% range) | vs. baseline | Mulligan | Missed land drops | Lands t5 | Screw | Cmdr turn | Cmdr never | Damage dealt |
|---|---|---|---|---|---|---|---|---|---|---|
| zurgo | 300 | 28% (23%-33%) | baseline | 28% | 1.6 | 4.3 | 19% | 5.1 | 3% | 41 |
| zurgo-app5 | 300 | 28% (23%-33%) | +0 pts (-7 to +7) | 24% | 1.8 | 4.1 | 26% | 5.7 | 7% | 50 |
| zurgo-staples5 | 300 | 22% (18%-27%) | -6 pts (-13 to +1) | 22% | 1.7 | 4.2 | 22% | 5.2 | 3% | 38 |

A difference whose range includes 0 isn't one the sims can see yet. Draws and timeouts count as games not won. Paired jobs compare game by game (same seeds, opponents and seats).

## zurgo-app5: the swapped cards

| In | Used | Win rate when used | when not | First turn | AI flag |
|---|---|---|---|---|---|
| Hero of Bladehold | 22% | 40% | 24% | 9.2 |  |
| Idol of Oblivion | 17% | 35% | 26% | 6.8 |  |
| Infantry Shield | 23% | 34% | 26% | 7.6 |  |
| Redoubled Stormsinger | 20% | 28% | 28% | 7.6 |  |
| Will of the Mardu | 20% | 30% | 27% | 6.8 |  |

Out: Blood Artist, Deathgreeter, Impact Tremors, Reconnaissance, Trouble in Pairs

## zurgo-staples5: the swapped cards

| In | Used | Win rate when used | when not | First turn | AI flag |
|---|---|---|---|---|---|
| Blasphemous Act | 21% | 16% | 24% | 9.3 |  |
| Fellwar Stone | 19% | 25% | 22% | 8.5 |  |
| Path to Exile | 24% | 23% | 22% | 6.7 |  |
| Swiftfoot Boots | 23% | 19% | 23% | 6.3 |  |
| Thought Vessel | 25% | 20% | 23% | 7.2 |  |

Out: Blood Artist, Deathgreeter, Impact Tremors, Reconnaissance, Trouble in Pairs

## zurgo: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| Ruinous Ultimatum | 16% | 59% | 22% | +37 | 10.3 |  |
| True Conviction | 21% | 56% | 21% | +36 | 8.6 |  |
| Soul Warden | 18% | 53% | 23% | +30 | 7.2 |  |
| Elas il-Kor, Sadistic Pilgrim | 24% | 51% | 21% | +30 | 7.7 |  |
| Mentor of the Meek | 19% | 52% | 23% | +29 | 7.1 |  |
| Zurgo Stormrender | 97% | 29% | 0% | +29 | 5.1 |  |
| Spirit Mantle | 17% | 50% | 24% | +26 | 8.2 |  |
| Emeritus of Woe | 18% | 49% | 23% | +26 | 8.3 |  |
| Duty Beyond Death | 9% | 50% | 26% | +24 | 10.6 |  |
| Trouble in Pairs | 14% | 49% | 25% | +24 | 8.8 |  |
| Gut, True Soul Zealot | 19% | 47% | 24% | +23 | 9.1 |  |
| Anim Pakal, Thousandth Moon | 23% | 46% | 23% | +23 | 9.0 |  |
| Cathars' Crusade | 23% | 46% | 23% | +23 | 9.2 |  |
| Grim Hireling | 24% | 45% | 23% | +22 | 8.5 |  |
| Enduring Innocence | 18% | 46% | 24% | +22 | 9.4 |  |
| Urza's Saga | 15% | 46% | 25% | +21 | - |  |
| Warleader's Call | 20% | 44% | 24% | +20 | 8.2 |  |
| Wooded Foothills | 23% | 43% | 23% | +20 | - |  |
| Generous Plunderer | 21% | 44% | 24% | +20 | 7.1 |  |
| Sol Ring | 18% | 44% | 24% | +19 | 5.4 |  |
| Sephiroth, Fabled SOLDIER | 27% | 42% | 23% | +19 | 7.5 |  |
| Vault of Champions | 27% | 41% | 23% | +18 | - |  |
| Takenuma, Abandoned Mire | 29% | 41% | 23% | +18 | - |  |
| Mahadi, Emporium Master | 22% | 42% | 24% | +18 | 8.1 |  |
| Adeline, Resplendent Cathar | 27% | 40% | 23% | +17 | 8.0 |  |
| Caesar, Legion's Emperor | 21% | 41% | 24% | +17 | 8.6 |  |
| Phyrexian Altar | 16% | 42% | 25% | +16 | 8.5 | random |
| Pitiless Plunderer | 20% | 41% | 25% | +16 | 8.4 |  |
| Black Market | 18% | 41% | 25% | +16 | 9.2 |  |
| Stadium Headliner | 24% | 40% | 24% | +15 | 7.5 |  |
| Ocelot Pride | 25% | 39% | 24% | +15 | 7.6 |  |
| Spectator Seating | 28% | 39% | 24% | +15 | - |  |
| Scalding Tarn | 20% | 39% | 25% | +14 | - |  |
| Staff of the Storyteller | 20% | 39% | 25% | +14 | 8.1 |  |
| Dalkovan Encampment | 22% | 39% | 25% | +14 | - |  |
| Deadly Dispute | 14% | 40% | 26% | +13 | 11.2 |  |
| Arcane Signet | 22% | 38% | 25% | +13 | 7.0 | noncmd |
| Scrubland | 22% | 38% | 25% | +13 | - |  |
| Ophiomancer | 18% | 38% | 26% | +12 | 9.3 |  |
| Elenda, the Dusk Rose | 21% | 38% | 25% | +12 | 9.2 |  |
| Swords to Plowshares | 22% | 37% | 25% | +12 | 5.8 |  |
| Luxury Suite | 25% | 37% | 25% | +12 | - |  |
| Mace of the Valiant | 26% | 36% | 25% | +11 | 8.3 | random |
| Windswept Heath | 24% | 36% | 25% | +11 | - |  |
| Grand Crescendo | 11% | 38% | 27% | +11 | 10.0 |  |
| Ashnod's Altar | 15% | 37% | 26% | +11 | 8.6 |  |
| Carrion Feeder | 26% | 35% | 25% | +10 | 7.0 |  |
| Brimaz, King of Oreskos | 21% | 36% | 26% | +10 | 7.5 |  |
| Deathgreeter | 25% | 36% | 25% | +10 | 7.3 |  |
| Endless Foot Assault | 23% | 36% | 26% | +10 | 7.3 |  |
| Jadar, Ghoulcaller of Nephalia | 20% | 36% | 26% | +9 | 7.3 |  |
| Phyrexian Tower | 24% | 35% | 26% | +9 | - | all |
| Voice of Victory | 21% | 35% | 26% | +9 | 7.0 |  |
| Dark Prophecy | 14% | 36% | 27% | +9 | 8.9 |  |
| Bastion of Remembrance | 17% | 35% | 27% | +9 | 8.0 |  |
| Plateau | 22% | 35% | 26% | +9 | - |  |
| Arid Mesa | 26% | 34% | 26% | +8 | - |  |
| Marsh Flats | 23% | 34% | 26% | +8 | - |  |
| Talisman of Hierarchy | 23% | 34% | 26% | +8 | 7.8 |  |
| Warren Soultrader | 21% | 34% | 26% | +8 | 7.1 |  |
| Professional Face-Breaker | 25% | 34% | 26% | +8 | 7.7 |  |
| The Masamune | 23% | 34% | 26% | +8 | 7.4 |  |
| Untimely Malfunction | 23% | 34% | 26% | +8 | 6.6 |  |
| Battle Angels of Tyr | 21% | 34% | 26% | +7 | 7.5 |  |
| Impact Tremors | 20% | 34% | 27% | +7 | 8.3 |  |
| Dawn Charm | 18% | 34% | 27% | +7 | 9.3 |  |
| Black Market Connections | 15% | 34% | 27% | +7 | 8.8 |  |
| Esper Sentinel | 20% | 33% | 27% | +7 | 6.8 |  |
| Talisman of Indulgence | 25% | 33% | 26% | +7 | 7.5 |  |
| Blood Crypt | 24% | 33% | 26% | +6 | - |  |
| Shinka, the Bloodsoaked Keep | 24% | 33% | 26% | +6 | - |  |
| Woe Strider | 24% | 32% | 27% | +6 | 7.7 |  |
| Polluted Delta | 28% | 32% | 26% | +6 | - |  |
| Flooded Strand | 23% | 32% | 27% | +5 | - |  |
| Skullclamp | 16% | 32% | 27% | +5 | 5.3 |  |
| Crowded Crypt | 28% | 31% | 27% | +5 | 8.0 |  |
| Blood Artist | 22% | 31% | 27% | +4 | 7.2 |  |
| Talisman of Conviction | 21% | 31% | 27% | +3 | 6.9 |  |
| Eiganjo, Seat of the Empire | 24% | 30% | 28% | +2 | - |  |
| Lightning Greaves | 25% | 29% | 28% | +2 | 7.1 |  |
| Sacred Foundry | 23% | 29% | 28% | +1 | - |  |
| Ainok Strike Leader | 23% | 29% | 28% | +1 | 7.2 |  |
| Godless Shrine | 20% | 28% | 28% | +0 | - |  |
| Command Tower | 21% | 28% | 28% | +0 | - | noncmd |
| Bloodstained Mire | 22% | 27% | 28% | -1 | - |  |
| Blade of Selves | 25% | 27% | 28% | -2 | 6.9 | random |
| Soul's Attendant | 20% | 26% | 28% | -2 | 6.5 |  |
| Verdant Catacombs | 23% | 26% | 29% | -2 | - |  |
| Urborg, Tomb of Yawgmoth | 18% | 26% | 28% | -3 | - | random |
| Badlands | 21% | 24% | 29% | -5 | - |  |
| Goblin Bombardment | 0% | - | 28% | - | - | all |
| Indulge | 0% | - | 28% | - | - |  |
| Reconnaissance | 0% | - | 28% | - | - | all |
| Viscera Seer | 0% | - | 28% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer

## zurgo-app5: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| Cathars' Crusade | 14% | 59% | 23% | +36 | 9.1 |  |
| Ruinous Ultimatum | 21% | 53% | 21% | +32 | 9.6 |  |
| Dawn Charm | 16% | 50% | 23% | +27 | 9.2 |  |
| Elenda, the Dusk Rose | 18% | 49% | 23% | +26 | 8.5 |  |
| Bastion of Remembrance | 17% | 48% | 23% | +25 | 9.2 |  |
| Zurgo Stormrender | 93% | 29% | 5% | +24 | 5.7 |  |
| Elas il-Kor, Sadistic Pilgrim | 18% | 47% | 23% | +24 | 7.2 |  |
| Command Tower | 26% | 44% | 22% | +22 | - | noncmd |
| Emeritus of Woe | 21% | 44% | 23% | +21 | 7.8 |  |
| Battle Angels of Tyr | 23% | 43% | 23% | +21 | 8.0 |  |
| Duty Beyond Death | 14% | 45% | 25% | +20 | 9.9 |  |
| Swords to Plowshares | 22% | 43% | 23% | +20 | 6.2 |  |
| Anim Pakal, Thousandth Moon | 16% | 44% | 25% | +19 | 9.0 |  |
| Mahadi, Emporium Master | 23% | 42% | 23% | +19 | 7.3 |  |
| Black Market Connections | 12% | 43% | 25% | +18 | 9.5 |  |
| Mace of the Valiant | 23% | 41% | 24% | +17 | 7.4 | random |
| Shinka, the Bloodsoaked Keep | 23% | 41% | 24% | +17 | - |  |
| Endless Foot Assault | 26% | 41% | 23% | +17 | 7.1 |  |
| Generous Plunderer | 26% | 41% | 23% | +17 | 7.3 |  |
| Marsh Flats | 21% | 41% | 24% | +17 | - |  |
| Caesar, Legion's Emperor | 24% | 40% | 24% | +17 | 8.3 |  |
| Hero of Bladehold | 22% | 40% | 24% | +16 | 9.2 |  |
| Ocelot Pride | 23% | 40% | 24% | +16 | 5.6 |  |
| Ophiomancer | 23% | 40% | 24% | +16 | 8.5 |  |
| Pitiless Plunderer | 18% | 40% | 25% | +15 | 8.5 |  |
| Phyrexian Tower | 27% | 38% | 24% | +15 | - | all |
| Sol Ring | 26% | 38% | 24% | +14 | 6.0 |  |
| Phyrexian Altar | 17% | 38% | 25% | +13 | 8.4 | random |
| Talisman of Indulgence | 17% | 38% | 25% | +13 | 7.3 |  |
| Crowded Crypt | 21% | 38% | 25% | +12 | 7.5 |  |
| True Conviction | 22% | 37% | 25% | +12 | 9.0 |  |
| Spirit Mantle | 23% | 37% | 25% | +12 | 7.0 |  |
| Untimely Malfunction | 23% | 37% | 25% | +12 | 6.6 |  |
| Soul Warden | 17% | 37% | 26% | +12 | 5.9 |  |
| Woe Strider | 21% | 37% | 25% | +11 | 7.7 |  |
| Sephiroth, Fabled SOLDIER | 22% | 36% | 25% | +11 | 7.3 |  |
| Mentor of the Meek | 23% | 36% | 25% | +11 | 6.5 |  |
| Arcane Signet | 19% | 36% | 26% | +11 | 6.2 | noncmd |
| Urza's Saga | 15% | 36% | 26% | +10 | - |  |
| Polluted Delta | 24% | 35% | 25% | +10 | - |  |
| Soul's Attendant | 24% | 35% | 25% | +9 | 6.2 |  |
| Grand Crescendo | 15% | 36% | 26% | +9 | 9.4 |  |
| Skullclamp | 20% | 35% | 26% | +9 | 5.6 |  |
| Windswept Heath | 24% | 34% | 26% | +9 | - |  |
| Infantry Shield | 23% | 34% | 26% | +9 | 7.6 |  |
| Gut, True Soul Zealot | 22% | 34% | 26% | +9 | 8.4 |  |
| Spectator Seating | 22% | 34% | 26% | +9 | - |  |
| Badlands | 20% | 34% | 26% | +8 | - |  |
| Ainok Strike Leader | 18% | 35% | 26% | +8 | 6.9 |  |
| Idol of Oblivion | 17% | 35% | 26% | +8 | 6.8 |  |
| Stadium Headliner | 22% | 34% | 26% | +8 | 6.0 |  |
| Blood Crypt | 20% | 33% | 26% | +7 | - |  |
| Esper Sentinel | 20% | 33% | 26% | +7 | 7.1 |  |
| Blade of Selves | 21% | 33% | 26% | +7 | 7.1 | random |
| Plateau | 21% | 33% | 26% | +7 | - |  |
| Deadly Dispute | 13% | 33% | 27% | +7 | 10.0 |  |
| Voice of Victory | 18% | 33% | 27% | +6 | 7.1 |  |
| Warren Soultrader | 24% | 32% | 26% | +6 | 7.5 |  |
| Adeline, Resplendent Cathar | 21% | 32% | 26% | +6 | 7.9 |  |
| Dalkovan Encampment | 24% | 32% | 26% | +6 | - |  |
| Verdant Catacombs | 26% | 32% | 26% | +5 | - |  |
| Urborg, Tomb of Yawgmoth | 17% | 32% | 27% | +5 | - | random |
| Scalding Tarn | 25% | 31% | 27% | +5 | - |  |
| Sacred Foundry | 17% | 31% | 27% | +4 | - |  |
| Talisman of Hierarchy | 24% | 31% | 27% | +4 | 6.3 |  |
| Dark Prophecy | 16% | 31% | 27% | +4 | 9.7 |  |
| Warleader's Call | 23% | 31% | 27% | +4 | 7.7 |  |
| Staff of the Storyteller | 18% | 31% | 27% | +4 | 6.7 |  |
| Talisman of Conviction | 22% | 31% | 27% | +4 | 6.8 |  |
| Jadar, Ghoulcaller of Nephalia | 22% | 30% | 27% | +3 | 7.4 |  |
| Eiganjo, Seat of the Empire | 27% | 30% | 27% | +3 | - |  |
| Takenuma, Abandoned Mire | 23% | 30% | 27% | +3 | - |  |
| Will of the Mardu | 20% | 30% | 27% | +3 | 6.8 |  |
| Grim Hireling | 19% | 30% | 27% | +3 | 7.4 |  |
| Black Market | 16% | 30% | 27% | +3 | 8.3 |  |
| Flooded Strand | 19% | 29% | 27% | +2 | - |  |
| The Masamune | 19% | 29% | 27% | +2 | 6.8 |  |
| Vault of Champions | 26% | 29% | 27% | +2 | - |  |
| Brimaz, King of Oreskos | 23% | 29% | 27% | +2 | 6.9 |  |
| Enduring Innocence | 22% | 28% | 27% | +1 | 8.0 |  |
| Luxury Suite | 23% | 28% | 28% | +0 | - |  |
| Redoubled Stormsinger | 20% | 28% | 28% | +0 | 7.6 |  |
| Godless Shrine | 24% | 27% | 28% | -1 | - |  |
| Scrubland | 21% | 27% | 28% | -1 | - |  |
| Ashnod's Altar | 19% | 26% | 28% | -2 | 8.3 |  |
| Arid Mesa | 24% | 26% | 28% | -2 | - |  |
| Lightning Greaves | 22% | 26% | 28% | -2 | 6.8 |  |
| Professional Face-Breaker | 23% | 24% | 29% | -4 | 7.1 |  |
| Bloodstained Mire | 18% | 24% | 29% | -5 | - |  |
| Carrion Feeder | 26% | 22% | 30% | -8 | 6.3 |  |
| Wooded Foothills | 24% | 21% | 30% | -9 | - |  |
| Goblin Bombardment | 0% | - | 28% | - | - | all |
| Indulge | 0% | - | 28% | - | - |  |
| Viscera Seer | 0% | - | 28% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Viscera Seer

## zurgo-staples5: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| Duty Beyond Death | 12% | 49% | 19% | +30 | 10.9 |  |
| Ruinous Ultimatum | 16% | 47% | 18% | +29 | 10.4 |  |
| Sephiroth, Fabled SOLDIER | 24% | 44% | 16% | +28 | 7.1 |  |
| Cathars' Crusade | 20% | 43% | 17% | +26 | 9.4 |  |
| Zurgo Stormrender | 97% | 23% | 0% | +23 | 5.2 |  |
| Esper Sentinel | 19% | 40% | 18% | +21 | 6.4 |  |
| Gut, True Soul Zealot | 20% | 39% | 18% | +21 | 8.5 |  |
| Stadium Headliner | 22% | 36% | 18% | +18 | 6.2 |  |
| Warleader's Call | 20% | 37% | 19% | +18 | 8.2 |  |
| Talisman of Indulgence | 19% | 36% | 19% | +16 | 6.6 |  |
| Soul's Attendant | 21% | 35% | 19% | +16 | 6.6 |  |
| Endless Foot Assault | 26% | 34% | 18% | +15 | 7.6 |  |
| Battle Angels of Tyr | 21% | 34% | 19% | +15 | 7.8 |  |
| True Conviction | 18% | 35% | 20% | +15 | 8.7 |  |
| Anim Pakal, Thousandth Moon | 21% | 33% | 19% | +13 | 8.8 |  |
| Blood Crypt | 21% | 33% | 19% | +13 | - |  |
| Scrubland | 21% | 33% | 19% | +13 | - |  |
| Ocelot Pride | 24% | 32% | 19% | +13 | 6.8 |  |
| Warren Soultrader | 22% | 32% | 20% | +13 | 7.5 |  |
| Luxury Suite | 21% | 32% | 20% | +13 | - |  |
| Pitiless Plunderer | 20% | 32% | 20% | +12 | 9.1 |  |
| Polluted Delta | 22% | 32% | 20% | +12 | - |  |
| Staff of the Storyteller | 18% | 32% | 20% | +12 | 8.5 |  |
| Ainok Strike Leader | 20% | 32% | 20% | +12 | 7.5 |  |
| Elas il-Kor, Sadistic Pilgrim | 22% | 31% | 20% | +12 | 7.4 |  |
| Skullclamp | 24% | 31% | 20% | +11 | 5.3 |  |
| Scalding Tarn | 18% | 31% | 20% | +11 | - |  |
| Marsh Flats | 25% | 30% | 20% | +11 | - |  |
| Swords to Plowshares | 22% | 30% | 20% | +10 | 7.4 |  |
| Takenuma, Abandoned Mire | 29% | 30% | 19% | +10 | - |  |
| Soul Warden | 20% | 31% | 20% | +10 | 7.1 |  |
| Command Tower | 26% | 30% | 20% | +10 | - | noncmd |
| Professional Face-Breaker | 25% | 30% | 20% | +10 | 6.8 |  |
| Untimely Malfunction | 23% | 29% | 20% | +9 | 6.5 |  |
| Bastion of Remembrance | 18% | 30% | 21% | +9 | 9.1 |  |
| Grim Hireling | 21% | 29% | 21% | +8 | 7.7 |  |
| Blade of Selves | 23% | 29% | 20% | +8 | 7.0 | random |
| Deadly Dispute | 16% | 29% | 21% | +8 | 9.7 |  |
| Lightning Greaves | 20% | 29% | 21% | +8 | 7.2 |  |
| Jadar, Ghoulcaller of Nephalia | 24% | 28% | 21% | +8 | 8.1 |  |
| Generous Plunderer | 26% | 28% | 20% | +7 | 7.2 |  |
| Voice of Victory | 21% | 28% | 21% | +7 | 7.4 |  |
| Grand Crescendo | 14% | 29% | 21% | +7 | 9.9 |  |
| Mahadi, Emporium Master | 23% | 28% | 21% | +7 | 7.1 |  |
| Emeritus of Woe | 24% | 28% | 21% | +7 | 7.9 |  |
| Windswept Heath | 25% | 28% | 21% | +7 | - |  |
| Plateau | 19% | 28% | 21% | +7 | - |  |
| Phyrexian Tower | 27% | 28% | 20% | +7 | - | all |
| Shinka, the Bloodsoaked Keep | 24% | 27% | 21% | +7 | - |  |
| Elenda, the Dusk Rose | 18% | 28% | 21% | +7 | 8.4 |  |
| Brimaz, King of Oreskos | 21% | 27% | 21% | +6 | 7.5 |  |
| Spirit Mantle | 21% | 27% | 21% | +6 | 7.7 |  |
| Urza's Saga | 20% | 27% | 21% | +6 | - |  |
| Sacred Foundry | 21% | 27% | 21% | +6 | - |  |
| Dark Prophecy | 15% | 27% | 21% | +6 | 10.3 |  |
| Caesar, Legion's Emperor | 19% | 27% | 21% | +5 | 8.0 |  |
| Ophiomancer | 21% | 27% | 21% | +5 | 8.8 |  |
| Talisman of Hierarchy | 21% | 27% | 21% | +5 | 7.0 |  |
| Carrion Feeder | 22% | 26% | 21% | +5 | 6.3 |  |
| Godless Shrine | 22% | 26% | 21% | +5 | - |  |
| Arcane Signet | 27% | 26% | 21% | +5 | 5.8 | noncmd |
| Enduring Innocence | 18% | 25% | 22% | +4 | 9.1 |  |
| Bloodstained Mire | 25% | 25% | 21% | +4 | - |  |
| Fellwar Stone | 19% | 25% | 22% | +3 | 8.5 |  |
| Eiganjo, Seat of the Empire | 24% | 25% | 22% | +3 | - |  |
| Wooded Foothills | 23% | 24% | 22% | +3 | - |  |
| Mace of the Valiant | 22% | 24% | 22% | +2 | 7.3 | random |
| Dalkovan Encampment | 25% | 24% | 22% | +2 | - |  |
| Adeline, Resplendent Cathar | 22% | 24% | 22% | +2 | 9.1 |  |
| Flooded Strand | 22% | 24% | 22% | +2 | - |  |
| Talisman of Conviction | 21% | 24% | 22% | +2 | 6.6 |  |
| Woe Strider | 23% | 24% | 22% | +2 | 8.0 |  |
| Mentor of the Meek | 21% | 23% | 22% | +1 | 7.3 |  |
| Phyrexian Altar | 22% | 23% | 22% | +1 | 9.1 | random |
| Path to Exile | 24% | 23% | 22% | +0 | 6.7 |  |
| Badlands | 18% | 22% | 22% | -1 | - |  |
| Arid Mesa | 22% | 21% | 23% | -1 | - |  |
| Verdant Catacombs | 27% | 21% | 23% | -2 | - |  |
| The Masamune | 18% | 21% | 23% | -2 | 7.7 |  |
| Urborg, Tomb of Yawgmoth | 18% | 21% | 23% | -2 | - | random |
| Thought Vessel | 25% | 20% | 23% | -3 | 7.2 |  |
| Sol Ring | 22% | 20% | 23% | -3 | 5.6 |  |
| Black Market | 17% | 20% | 23% | -3 | 8.9 |  |
| Spectator Seating | 22% | 20% | 23% | -3 | - |  |
| Swiftfoot Boots | 23% | 19% | 23% | -4 | 6.3 |  |
| Crowded Crypt | 22% | 18% | 24% | -5 | 6.8 |  |
| Dawn Charm | 15% | 18% | 23% | -5 | 10.6 |  |
| Black Market Connections | 16% | 17% | 23% | -6 | 7.9 |  |
| Ashnod's Altar | 23% | 17% | 24% | -6 | 8.6 |  |
| Blasphemous Act | 21% | 16% | 24% | -9 | 9.3 |  |
| Vault of Champions | 25% | 14% | 25% | -11 | - |  |
| Goblin Bombardment | 0% | - | 22% | - | - | all |
| Indulge | 0% | - | 22% | - | - |  |
| Viscera Seer | 0% | - | 22% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Viscera Seer

## Check by hand (Manafold or the Forge window)

Bots can be wrong about a card. Before acting on a finding, play or watch a few games and check:
- zurgo: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Reconnaissance, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo: rarely or never used by the bot: Duty Beyond Death, Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer. Clunky, or just misplayed?
- zurgo-app5: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo-app5: rarely or never used by the bot: Goblin Bombardment, Indulge, Viscera Seer. Clunky, or just misplayed?
- zurgo-staples5: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo-staples5: rarely or never used by the bot: Goblin Bombardment, Indulge, Viscera Seer. Clunky, or just misplayed?
- Record hand-played games in results/<job>/manual.csv (columns: date, platform, deck, seat, won, turns, notes).
