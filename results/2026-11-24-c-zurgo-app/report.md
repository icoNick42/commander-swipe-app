# Sim report: 2026-11-24-c-zurgo-app

First real test: does following the app help? Zurgo as is, vs. the app's top 5 and top 10 picks with its paired cuts, vs. a control that makes the app's 5 cuts but adds the colors' most-played cards instead of the app's picks. Variants are built on the desktop from the app's main branch.

Made 2026-11-25 21:47. 300 of 300 batches in. Forge AI pilots every deck; read the numbers as "played by a mediocre bot": best for mana, curve and version-vs-version tests.

## Decks

| Deck | Games | Win rate (95% range) | vs. baseline | Mulligan | Missed land drops | Lands t5 | Screw | Cmdr turn | Cmdr never | Damage dealt |
|---|---|---|---|---|---|---|---|---|---|---|
| zurgo | 300 | 23% (19%-28%) | baseline | 23% | 1.7 | 4.3 | 20% | 5.0 | 4% | 38 |
| zurgo-app5 | 300 | 28% (23%-33%) | +5 pts (-2 to +12) | 23% | 1.7 | 4.3 | 19% | 5.4 | 5% | 33 |
| zurgo-app10 | 300 | 18% (14%-23%) | -5 pts (-11 to +2) | 13% | 1.6 | 4.3 | 19% | 5.4 | 3% | 24 |
| zurgo-staples5 | 300 | 21% (17%-26%) | -2 pts (-8 to +5) | 25% | 1.7 | 4.2 | 24% | 5.2 | 3% | 39 |

A difference whose range includes 0 isn't one the sims can see yet. Draws and timeouts count as games not won. Paired jobs compare game by game (same seeds, opponents and seats).

## zurgo-app5: the swapped cards

| In | Used | Win rate when used | when not | First turn | AI flag |
|---|---|---|---|---|---|
| Hero of Bladehold | 19% | 36% | 26% | 7.4 |  |
| Idol of Oblivion | 20% | 28% | 28% | 7.0 |  |
| Infantry Shield | 22% | 37% | 25% | 7.4 |  |
| Redoubled Stormsinger | 18% | 39% | 25% | 6.2 |  |
| Will of the Mardu | 20% | 34% | 26% | 6.8 |  |

Out: Blood Artist, Deathgreeter, Impact Tremors, Reconnaissance, Trouble in Pairs

## zurgo-app10: the swapped cards

| In | Used | Win rate when used | when not | First turn | AI flag |
|---|---|---|---|---|---|
| Clifftop Retreat | 24% | 21% | 17% | - |  |
| Hero of Bladehold | 22% | 26% | 16% | 7.2 |  |
| Idol of Oblivion | 17% | 16% | 19% | 6.6 |  |
| Infantry Shield | 19% | 26% | 17% | 6.6 |  |
| Isolated Chapel | 23% | 19% | 18% | - |  |
| Morbid Opportunist | 16% | 34% | 15% | 8.3 |  |
| Redoubled Stormsinger | 18% | 28% | 16% | 7.6 |  |
| Shattered Sanctum | 27% | 22% | 17% | - |  |
| Will of the Mardu | 17% | 17% | 19% | 6.3 |  |
| Within Range | 18% | 27% | 16% | 8.3 |  |

Out: Blood Artist, Deathgreeter, Impact Tremors, Ophiomancer, Pitiless Plunderer, Reconnaissance, Soul Warden, Soul's Attendant, Trouble in Pairs, Warleader's Call

## zurgo-staples5: the swapped cards

| In | Used | Win rate when used | when not | First turn | AI flag |
|---|---|---|---|---|---|
| Blasphemous Act | 21% | 22% | 21% | 8.8 |  |
| Fellwar Stone | 16% | 17% | 22% | 6.6 |  |
| Path to Exile | 21% | 26% | 20% | 6.0 |  |
| Swiftfoot Boots | 19% | 23% | 21% | 6.2 |  |
| Thought Vessel | 22% | 27% | 20% | 6.3 |  |

Out: Blood Artist, Deathgreeter, Impact Tremors, Reconnaissance, Trouble in Pairs

## zurgo: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| Ruinous Ultimatum | 18% | 55% | 16% | +39 | 9.4 |  |
| Dawn Charm | 17% | 47% | 18% | +29 | 9.5 |  |
| True Conviction | 24% | 42% | 17% | +26 | 8.5 |  |
| Zurgo Stormrender | 96% | 24% | 0% | +24 | 5.0 |  |
| Grand Crescendo | 12% | 43% | 20% | +23 | 9.3 |  |
| Enduring Innocence | 17% | 42% | 19% | +23 | 8.2 |  |
| Black Market Connections | 16% | 41% | 20% | +21 | 8.4 |  |
| Cathars' Crusade | 19% | 40% | 19% | +21 | 9.1 |  |
| Battle Angels of Tyr | 21% | 37% | 19% | +18 | 7.4 |  |
| Bastion of Remembrance | 16% | 38% | 20% | +17 | 8.8 |  |
| Flooded Strand | 27% | 35% | 19% | +16 | - |  |
| Sephiroth, Fabled SOLDIER | 21% | 35% | 20% | +15 | 6.9 |  |
| Trouble in Pairs | 15% | 36% | 21% | +15 | 7.8 |  |
| Bloodstained Mire | 23% | 34% | 20% | +15 | - |  |
| Elas il-Kor, Sadistic Pilgrim | 23% | 34% | 20% | +15 | 7.1 |  |
| Emeritus of Woe | 22% | 34% | 20% | +15 | 7.4 |  |
| Elenda, the Dusk Rose | 18% | 35% | 20% | +14 | 8.2 |  |
| Shinka, the Bloodsoaked Keep | 23% | 34% | 20% | +14 | - |  |
| Deathgreeter | 22% | 33% | 20% | +13 | 6.0 |  |
| Windswept Heath | 24% | 33% | 20% | +13 | - |  |
| Ophiomancer | 23% | 33% | 20% | +13 | 7.8 |  |
| Badlands | 19% | 33% | 21% | +13 | - |  |
| Impact Tremors | 21% | 33% | 20% | +12 | 7.2 |  |
| Staff of the Storyteller | 16% | 33% | 21% | +12 | 7.8 |  |
| Warren Soultrader | 20% | 33% | 21% | +12 | 7.3 |  |
| Grim Hireling | 18% | 33% | 21% | +12 | 7.9 |  |
| Mace of the Valiant | 18% | 33% | 21% | +12 | 7.1 | random |
| Caesar, Legion's Emperor | 22% | 32% | 20% | +12 | 7.6 |  |
| Soul's Attendant | 22% | 32% | 20% | +12 | 6.7 |  |
| Brimaz, King of Oreskos | 26% | 32% | 20% | +12 | 6.7 |  |
| Generous Plunderer | 17% | 33% | 21% | +12 | 7.7 |  |
| Jadar, Ghoulcaller of Nephalia | 20% | 32% | 21% | +11 | 6.5 |  |
| Crowded Crypt | 24% | 32% | 20% | +11 | 6.9 |  |
| Ocelot Pride | 18% | 32% | 21% | +11 | 6.7 |  |
| Sol Ring | 21% | 31% | 21% | +10 | 4.9 |  |
| Arid Mesa | 24% | 31% | 21% | +10 | - |  |
| Soul Warden | 22% | 31% | 21% | +10 | 5.8 |  |
| Takenuma, Abandoned Mire | 25% | 30% | 21% | +10 | - |  |
| Scalding Tarn | 23% | 30% | 21% | +9 | - |  |
| Adeline, Resplendent Cathar | 21% | 30% | 21% | +9 | 7.6 |  |
| Woe Strider | 22% | 30% | 21% | +9 | 7.2 |  |
| Spirit Mantle | 23% | 29% | 21% | +8 | 6.6 |  |
| Spectator Seating | 26% | 29% | 21% | +7 | - |  |
| Professional Face-Breaker | 20% | 29% | 22% | +7 | 6.6 |  |
| Black Market | 15% | 29% | 22% | +7 | 8.1 |  |
| Phyrexian Altar | 19% | 29% | 22% | +7 | 8.4 | random |
| Sacred Foundry | 19% | 29% | 22% | +7 | - |  |
| Skullclamp | 20% | 28% | 22% | +7 | 5.0 |  |
| Talisman of Hierarchy | 19% | 28% | 22% | +6 | 6.8 |  |
| Voice of Victory | 19% | 28% | 22% | +6 | 6.5 |  |
| Phyrexian Tower | 28% | 27% | 21% | +6 | - | all |
| Esper Sentinel | 22% | 27% | 22% | +5 | 6.5 |  |
| The Masamune | 18% | 27% | 22% | +5 | 6.9 |  |
| Scrubland | 20% | 27% | 22% | +5 | - |  |
| Talisman of Conviction | 17% | 27% | 22% | +5 | 6.0 |  |
| Wooded Foothills | 20% | 27% | 22% | +5 | - |  |
| Dalkovan Encampment | 24% | 26% | 22% | +4 | - |  |
| Blade of Selves | 23% | 26% | 22% | +4 | 6.7 | random |
| Untimely Malfunction | 23% | 26% | 22% | +4 | 6.3 |  |
| Endless Foot Assault | 17% | 26% | 22% | +4 | 7.6 |  |
| Anim Pakal, Thousandth Moon | 18% | 26% | 22% | +4 | 8.4 |  |
| Lightning Greaves | 18% | 26% | 22% | +4 | 6.6 |  |
| Duty Beyond Death | 12% | 26% | 23% | +3 | 9.9 |  |
| Dark Prophecy | 16% | 26% | 23% | +3 | 9.4 |  |
| Deadly Dispute | 16% | 26% | 23% | +3 | 10.4 |  |
| Swords to Plowshares | 23% | 25% | 22% | +3 | 6.5 |  |
| Pitiless Plunderer | 17% | 25% | 23% | +2 | 8.0 |  |
| Gut, True Soul Zealot | 23% | 25% | 23% | +2 | 8.8 |  |
| Blood Artist | 20% | 25% | 23% | +2 | 8.3 |  |
| Ashnod's Altar | 22% | 24% | 23% | +2 | 8.4 |  |
| Mentor of the Meek | 17% | 24% | 23% | +1 | 6.3 |  |
| Eiganjo, Seat of the Empire | 22% | 24% | 23% | +1 | - |  |
| Plateau | 20% | 24% | 23% | +1 | - |  |
| Vault of Champions | 18% | 24% | 23% | +1 | - |  |
| Ainok Strike Leader | 20% | 23% | 23% | +0 | 6.5 |  |
| Verdant Catacombs | 24% | 22% | 23% | -1 | - |  |
| Stadium Headliner | 20% | 22% | 23% | -1 | 5.9 |  |
| Mahadi, Emporium Master | 23% | 22% | 23% | -2 | 6.9 |  |
| Blood Crypt | 20% | 22% | 23% | -2 | - |  |
| Marsh Flats | 25% | 22% | 23% | -2 | - |  |
| Command Tower | 21% | 21% | 24% | -3 | - | noncmd |
| Luxury Suite | 25% | 21% | 24% | -3 | - |  |
| Polluted Delta | 22% | 20% | 24% | -4 | - |  |
| Urza's Saga | 15% | 20% | 24% | -4 | - |  |
| Godless Shrine | 20% | 20% | 24% | -4 | - |  |
| Arcane Signet | 22% | 19% | 24% | -5 | 6.8 | noncmd |
| Carrion Feeder | 19% | 19% | 24% | -5 | 7.1 |  |
| Talisman of Indulgence | 18% | 19% | 24% | -5 | 7.0 |  |
| Warleader's Call | 22% | 17% | 25% | -8 | 7.0 |  |
| Urborg, Tomb of Yawgmoth | 19% | 12% | 26% | -13 | - | random |
| Goblin Bombardment | 0% | - | 23% | - | - | all |
| Indulge | 0% | - | 23% | - | - |  |
| Reconnaissance | 0% | - | 23% | - | - | all |
| Viscera Seer | 0% | - | 23% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer

## zurgo-app5: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| True Conviction | 21% | 64% | 18% | +46 | 8.6 |  |
| Ruinous Ultimatum | 18% | 60% | 20% | +40 | 10.3 |  |
| Dawn Charm | 12% | 49% | 25% | +24 | 9.8 |  |
| Shinka, the Bloodsoaked Keep | 24% | 45% | 22% | +23 | - |  |
| Sephiroth, Fabled SOLDIER | 20% | 46% | 23% | +23 | 7.1 |  |
| Zurgo Stormrender | 95% | 29% | 7% | +22 | 5.4 |  |
| Soul Warden | 21% | 44% | 24% | +20 | 6.7 |  |
| Duty Beyond Death | 13% | 45% | 25% | +20 | 9.6 |  |
| Talisman of Hierarchy | 18% | 44% | 24% | +20 | 6.3 |  |
| Emeritus of Woe | 25% | 42% | 23% | +19 | 7.3 |  |
| Cathars' Crusade | 14% | 44% | 25% | +19 | 8.1 |  |
| Bloodstained Mire | 21% | 42% | 24% | +18 | - |  |
| Grand Crescendo | 14% | 43% | 25% | +18 | 9.3 |  |
| Woe Strider | 20% | 42% | 24% | +18 | 7.6 |  |
| Caesar, Legion's Emperor | 19% | 41% | 24% | +17 | 7.4 |  |
| Soul's Attendant | 15% | 41% | 25% | +16 | 6.8 |  |
| Phyrexian Altar | 18% | 41% | 25% | +16 | 8.7 | random |
| Urborg, Tomb of Yawgmoth | 19% | 40% | 25% | +16 | - | random |
| Endless Foot Assault | 20% | 40% | 25% | +15 | 7.3 |  |
| Ocelot Pride | 17% | 40% | 25% | +15 | 7.1 |  |
| Elas il-Kor, Sadistic Pilgrim | 19% | 40% | 25% | +15 | 6.7 |  |
| Verdant Catacombs | 19% | 40% | 25% | +15 | - |  |
| Voice of Victory | 24% | 38% | 24% | +14 | 6.5 |  |
| Sol Ring | 22% | 38% | 25% | +14 | 6.0 |  |
| Redoubled Stormsinger | 18% | 39% | 25% | +14 | 6.2 |  |
| Command Tower | 25% | 38% | 24% | +14 | - | noncmd |
| Battle Angels of Tyr | 21% | 38% | 25% | +13 | 7.3 |  |
| Adeline, Resplendent Cathar | 22% | 38% | 25% | +13 | 8.3 |  |
| Warren Soultrader | 18% | 38% | 25% | +13 | 7.4 |  |
| Urza's Saga | 15% | 39% | 26% | +13 | - |  |
| Scrubland | 19% | 38% | 25% | +13 | - |  |
| Dark Prophecy | 16% | 38% | 26% | +13 | 9.6 |  |
| Deadly Dispute | 16% | 38% | 26% | +13 | 9.5 |  |
| Wooded Foothills | 20% | 38% | 25% | +13 | - |  |
| Infantry Shield | 22% | 37% | 25% | +12 | 7.4 |  |
| Esper Sentinel | 18% | 38% | 26% | +12 | 7.0 |  |
| Warleader's Call | 23% | 37% | 25% | +12 | 7.2 |  |
| Vault of Champions | 24% | 37% | 25% | +12 | - |  |
| Stadium Headliner | 17% | 37% | 26% | +11 | 6.0 |  |
| Untimely Malfunction | 20% | 36% | 26% | +11 | 5.9 |  |
| Skullclamp | 22% | 36% | 25% | +10 | 6.4 |  |
| Bastion of Remembrance | 16% | 36% | 26% | +10 | 8.9 |  |
| Pitiless Plunderer | 17% | 36% | 26% | +10 | 8.2 |  |
| Flooded Strand | 25% | 35% | 25% | +10 | - |  |
| Hero of Bladehold | 19% | 36% | 26% | +10 | 7.4 |  |
| Talisman of Conviction | 24% | 35% | 25% | +10 | 5.9 |  |
| Ainok Strike Leader | 21% | 35% | 26% | +10 | 6.5 |  |
| Godless Shrine | 21% | 35% | 26% | +10 | - |  |
| Black Market | 16% | 35% | 26% | +9 | 8.9 |  |
| Luxury Suite | 19% | 35% | 26% | +9 | - |  |
| Brimaz, King of Oreskos | 21% | 34% | 26% | +9 | 7.4 |  |
| Anim Pakal, Thousandth Moon | 19% | 34% | 26% | +8 | 8.9 |  |
| Mace of the Valiant | 17% | 35% | 26% | +8 | 6.9 | random |
| Gut, True Soul Zealot | 16% | 35% | 26% | +8 | 8.3 |  |
| Generous Plunderer | 25% | 34% | 26% | +8 | 7.4 |  |
| Dalkovan Encampment | 28% | 33% | 25% | +8 | - |  |
| Plateau | 21% | 34% | 26% | +8 | - |  |
| Lightning Greaves | 20% | 34% | 26% | +8 | 7.2 |  |
| Will of the Mardu | 20% | 34% | 26% | +8 | 6.8 |  |
| Takenuma, Abandoned Mire | 25% | 33% | 26% | +8 | - |  |
| Blood Crypt | 21% | 33% | 26% | +7 | - |  |
| Elenda, the Dusk Rose | 20% | 33% | 26% | +7 | 8.8 |  |
| Black Market Connections | 18% | 33% | 26% | +7 | 8.9 |  |
| Spirit Mantle | 17% | 33% | 27% | +7 | 6.6 |  |
| Windswept Heath | 25% | 32% | 26% | +6 | - |  |
| Grim Hireling | 19% | 32% | 27% | +6 | 8.0 |  |
| Ophiomancer | 17% | 32% | 27% | +5 | 7.9 |  |
| Professional Face-Breaker | 20% | 32% | 27% | +5 | 7.3 |  |
| Spectator Seating | 20% | 32% | 27% | +5 | - |  |
| Crowded Crypt | 21% | 31% | 27% | +5 | 6.7 |  |
| Arid Mesa | 20% | 31% | 27% | +4 | - |  |
| Staff of the Storyteller | 16% | 31% | 27% | +4 | 6.9 |  |
| Sacred Foundry | 23% | 31% | 27% | +4 | - |  |
| Swords to Plowshares | 21% | 31% | 27% | +4 | 6.9 |  |
| The Masamune | 20% | 31% | 27% | +4 | 7.4 |  |
| Marsh Flats | 22% | 30% | 27% | +3 | - |  |
| Arcane Signet | 22% | 30% | 27% | +3 | 7.3 | noncmd |
| Mahadi, Emporium Master | 19% | 30% | 27% | +3 | 6.4 |  |
| Enduring Innocence | 17% | 29% | 27% | +1 | 7.9 |  |
| Badlands | 27% | 28% | 28% | +1 | - |  |
| Idol of Oblivion | 20% | 28% | 28% | +0 | 7.0 |  |
| Carrion Feeder | 19% | 28% | 28% | +0 | 6.2 |  |
| Mentor of the Meek | 23% | 27% | 28% | -1 | 7.2 |  |
| Jadar, Ghoulcaller of Nephalia | 21% | 27% | 28% | -1 | 7.5 |  |
| Phyrexian Tower | 26% | 27% | 28% | -1 | - | all |
| Scalding Tarn | 24% | 27% | 28% | -1 | - |  |
| Eiganjo, Seat of the Empire | 23% | 26% | 28% | -2 | - |  |
| Polluted Delta | 21% | 26% | 28% | -2 | - |  |
| Talisman of Indulgence | 23% | 25% | 29% | -4 | 7.0 |  |
| Blade of Selves | 18% | 19% | 30% | -11 | 5.9 | random |
| Ashnod's Altar | 18% | 17% | 30% | -13 | 8.7 |  |
| Goblin Bombardment | 0% | - | 28% | - | - | all |
| Indulge | 0% | - | 28% | - | - |  |
| Viscera Seer | 0% | - | 28% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Viscera Seer

## zurgo-app10: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| True Conviction | 20% | 49% | 10% | +39 | 9.0 |  |
| Ruinous Ultimatum | 20% | 46% | 12% | +34 | 9.6 |  |
| Dawn Charm | 15% | 43% | 14% | +30 | 9.6 |  |
| Emeritus of Woe | 21% | 38% | 13% | +24 | 8.1 |  |
| Cathars' Crusade | 19% | 38% | 14% | +24 | 8.5 |  |
| Bloodstained Mire | 22% | 36% | 13% | +23 | - |  |
| Elenda, the Dusk Rose | 20% | 36% | 14% | +21 | 8.9 |  |
| Zurgo Stormrender | 97% | 19% | 0% | +19 | 5.4 |  |
| Morbid Opportunist | 16% | 34% | 15% | +19 | 8.3 |  |
| Windswept Heath | 19% | 33% | 15% | +18 | - |  |
| Enduring Innocence | 16% | 33% | 15% | +18 | 8.1 |  |
| Sephiroth, Fabled SOLDIER | 19% | 32% | 15% | +17 | 7.7 |  |
| Adeline, Resplendent Cathar | 22% | 31% | 15% | +17 | 8.2 |  |
| Takenuma, Abandoned Mire | 21% | 31% | 15% | +16 | - |  |
| Caesar, Legion's Emperor | 25% | 30% | 15% | +15 | 7.6 |  |
| Untimely Malfunction | 17% | 29% | 16% | +13 | 6.7 |  |
| Mahadi, Emporium Master | 17% | 29% | 16% | +13 | 6.7 |  |
| Ainok Strike Leader | 20% | 28% | 16% | +12 | 6.7 |  |
| Anim Pakal, Thousandth Moon | 21% | 28% | 16% | +12 | 8.9 |  |
| Mace of the Valiant | 21% | 28% | 16% | +12 | 7.9 | random |
| Swords to Plowshares | 24% | 28% | 15% | +12 | 5.8 |  |
| Redoubled Stormsinger | 18% | 28% | 16% | +12 | 7.6 |  |
| Luxury Suite | 23% | 27% | 16% | +11 | - |  |
| Battle Angels of Tyr | 24% | 27% | 16% | +11 | 7.2 |  |
| Within Range | 18% | 27% | 16% | +11 | 8.3 |  |
| Sacred Foundry | 21% | 27% | 16% | +10 | - |  |
| Wooded Foothills | 17% | 27% | 17% | +10 | - |  |
| Professional Face-Breaker | 23% | 26% | 16% | +10 | 7.4 |  |
| Duty Beyond Death | 11% | 27% | 17% | +10 | 9.4 |  |
| Talisman of Conviction | 19% | 26% | 16% | +10 | 6.6 |  |
| Talisman of Indulgence | 19% | 26% | 16% | +10 | 7.1 |  |
| Urza's Saga | 14% | 27% | 17% | +10 | - |  |
| Phyrexian Tower | 29% | 25% | 15% | +10 | - | all |
| Dalkovan Encampment | 23% | 26% | 16% | +10 | - |  |
| Hero of Bladehold | 22% | 26% | 16% | +10 | 7.2 |  |
| Badlands | 21% | 26% | 16% | +9 | - |  |
| Infantry Shield | 19% | 26% | 17% | +9 | 6.6 |  |
| Black Market Connections | 21% | 25% | 16% | +9 | 8.4 |  |
| Gut, True Soul Zealot | 19% | 25% | 17% | +8 | 8.2 |  |
| Phyrexian Altar | 19% | 25% | 17% | +8 | 8.5 | random |
| Vault of Champions | 23% | 25% | 16% | +8 | - |  |
| Scrubland | 17% | 25% | 17% | +8 | - |  |
| Arid Mesa | 22% | 24% | 17% | +8 | - |  |
| Skullclamp | 21% | 24% | 17% | +7 | 5.1 |  |
| Ocelot Pride | 16% | 24% | 17% | +7 | 7.0 |  |
| Urborg, Tomb of Yawgmoth | 24% | 24% | 17% | +7 | - | random |
| Arcane Signet | 21% | 24% | 17% | +7 | 6.3 | noncmd |
| Godless Shrine | 20% | 24% | 17% | +7 | - |  |
| Scalding Tarn | 22% | 23% | 17% | +6 | - |  |
| Woe Strider | 22% | 23% | 17% | +6 | 6.7 |  |
| Mentor of the Meek | 16% | 23% | 17% | +6 | 6.9 |  |
| Spectator Seating | 25% | 23% | 17% | +6 | - |  |
| Shattered Sanctum | 27% | 22% | 17% | +6 | - |  |
| Voice of Victory | 21% | 23% | 17% | +5 | 7.3 |  |
| Verdant Catacombs | 21% | 22% | 17% | +5 | - |  |
| Spirit Mantle | 16% | 22% | 18% | +5 | 6.1 |  |
| Grim Hireling | 26% | 22% | 17% | +5 | 7.3 |  |
| Warren Soultrader | 26% | 22% | 17% | +5 | 7.0 |  |
| Esper Sentinel | 21% | 22% | 17% | +5 | 6.1 |  |
| Crowded Crypt | 23% | 22% | 17% | +4 | 6.9 |  |
| Grand Crescendo | 12% | 22% | 18% | +4 | 7.6 |  |
| Generous Plunderer | 25% | 22% | 17% | +4 | 7.1 |  |
| Stadium Headliner | 22% | 22% | 17% | +4 | 6.4 |  |
| Eiganjo, Seat of the Empire | 22% | 21% | 18% | +4 | - |  |
| Clifftop Retreat | 24% | 21% | 17% | +4 | - |  |
| Blade of Selves | 24% | 21% | 18% | +3 | 6.4 | random |
| Dark Prophecy | 14% | 21% | 18% | +3 | 8.9 |  |
| Elas il-Kor, Sadistic Pilgrim | 25% | 20% | 18% | +3 | 6.8 |  |
| Talisman of Hierarchy | 16% | 20% | 18% | +2 | 6.2 |  |
| Endless Foot Assault | 20% | 20% | 18% | +2 | 6.3 |  |
| Black Market | 24% | 20% | 18% | +2 | 8.3 |  |
| Ashnod's Altar | 14% | 20% | 18% | +1 | 8.5 |  |
| Command Tower | 23% | 19% | 18% | +1 | - | noncmd |
| Isolated Chapel | 23% | 19% | 18% | +1 | - |  |
| Deadly Dispute | 16% | 19% | 18% | +0 | 9.4 |  |
| Lightning Greaves | 20% | 19% | 18% | +0 | 6.8 |  |
| Brimaz, King of Oreskos | 18% | 19% | 18% | +0 | 7.3 |  |
| Sol Ring | 25% | 18% | 18% | +0 | 5.3 |  |
| Shinka, the Bloodsoaked Keep | 20% | 18% | 18% | +0 | - |  |
| Staff of the Storyteller | 22% | 18% | 18% | -1 | 6.7 |  |
| Marsh Flats | 19% | 18% | 19% | -1 | - |  |
| The Masamune | 21% | 17% | 19% | -1 | 7.0 |  |
| Will of the Mardu | 17% | 17% | 19% | -1 | 6.3 |  |
| Carrion Feeder | 25% | 16% | 19% | -3 | 5.9 |  |
| Idol of Oblivion | 17% | 16% | 19% | -3 | 6.6 |  |
| Bastion of Remembrance | 16% | 15% | 19% | -4 | 7.5 |  |
| Flooded Strand | 21% | 15% | 19% | -5 | - |  |
| Plateau | 16% | 13% | 19% | -7 | - |  |
| Jadar, Ghoulcaller of Nephalia | 16% | 12% | 20% | -7 | 7.2 |  |
| Polluted Delta | 21% | 12% | 20% | -7 | - |  |
| Blood Crypt | 20% | 10% | 20% | -10 | - |  |
| Goblin Bombardment | 0% | - | 18% | - | - | all |
| Indulge | 0% | - | 18% | - | - |  |
| Viscera Seer | 0% | - | 18% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Viscera Seer

## zurgo-staples5: cards

Sorted by the gap between the deck's win rate with the card used and without. Small samples swing a lot; finishers look good because they're cast when already winning.

| Card | Used | WR used | WR not | Gap | First turn | AI flag |
|---|---|---|---|---|---|---|
| Ruinous Ultimatum | 16% | 51% | 16% | +35 | 9.4 |  |
| True Conviction | 17% | 50% | 15% | +35 | 7.6 |  |
| Elas il-Kor, Sadistic Pilgrim | 20% | 39% | 17% | +23 | 7.3 |  |
| Adeline, Resplendent Cathar | 18% | 39% | 17% | +21 | 7.5 |  |
| Cathars' Crusade | 19% | 38% | 18% | +20 | 8.5 |  |
| Sephiroth, Fabled SOLDIER | 21% | 37% | 17% | +20 | 7.6 |  |
| Elenda, the Dusk Rose | 20% | 37% | 18% | +19 | 9.0 |  |
| Ocelot Pride | 19% | 37% | 18% | +19 | 6.2 |  |
| Dawn Charm | 16% | 37% | 18% | +18 | 9.6 |  |
| Bastion of Remembrance | 17% | 35% | 18% | +17 | 8.2 |  |
| Endless Foot Assault | 23% | 34% | 18% | +16 | 7.7 |  |
| Soul Warden | 22% | 34% | 18% | +16 | 7.0 |  |
| Scalding Tarn | 23% | 33% | 18% | +15 | - |  |
| Ainok Strike Leader | 20% | 33% | 18% | +14 | 6.8 |  |
| Warleader's Call | 20% | 33% | 18% | +14 | 6.5 |  |
| Wooded Foothills | 21% | 32% | 18% | +14 | - |  |
| Staff of the Storyteller | 17% | 33% | 19% | +14 | 7.5 |  |
| Battle Angels of Tyr | 22% | 32% | 18% | +13 | 7.1 |  |
| Flooded Strand | 22% | 32% | 18% | +13 | - |  |
| Gut, True Soul Zealot | 18% | 31% | 19% | +12 | 9.3 |  |
| Phyrexian Altar | 18% | 31% | 19% | +12 | 8.6 | random |
| Takenuma, Abandoned Mire | 26% | 30% | 18% | +11 | - |  |
| Talisman of Indulgence | 17% | 31% | 19% | +11 | 7.6 |  |
| Sol Ring | 19% | 30% | 19% | +11 | 4.3 |  |
| Badlands | 22% | 30% | 19% | +11 | - |  |
| Esper Sentinel | 22% | 30% | 19% | +11 | 7.1 |  |
| Plateau | 22% | 30% | 19% | +11 | - |  |
| Warren Soultrader | 15% | 30% | 20% | +11 | 8.4 |  |
| Duty Beyond Death | 13% | 30% | 20% | +10 | 9.6 |  |
| Emeritus of Woe | 23% | 29% | 19% | +10 | 7.8 |  |
| Spectator Seating | 26% | 29% | 19% | +10 | - |  |
| Ophiomancer | 21% | 29% | 19% | +10 | 8.5 |  |
| Untimely Malfunction | 28% | 28% | 19% | +10 | 5.8 |  |
| Black Market | 18% | 29% | 20% | +9 | 8.5 |  |
| Skullclamp | 23% | 29% | 19% | +9 | 6.7 |  |
| Voice of Victory | 20% | 28% | 20% | +9 | 7.5 |  |
| Lightning Greaves | 23% | 28% | 19% | +9 | 6.9 |  |
| Bloodstained Mire | 25% | 28% | 19% | +8 | - |  |
| Luxury Suite | 25% | 28% | 19% | +8 | - |  |
| The Masamune | 20% | 28% | 20% | +8 | 7.2 |  |
| Dalkovan Encampment | 22% | 28% | 20% | +8 | - |  |
| Jadar, Ghoulcaller of Nephalia | 22% | 28% | 20% | +8 | 8.2 |  |
| Mentor of the Meek | 22% | 28% | 20% | +8 | 7.4 |  |
| Caesar, Legion's Emperor | 18% | 28% | 20% | +8 | 8.0 |  |
| Brimaz, King of Oreskos | 22% | 27% | 20% | +8 | 7.1 |  |
| Swords to Plowshares | 25% | 27% | 19% | +8 | 7.4 |  |
| Thought Vessel | 22% | 27% | 20% | +7 | 6.3 |  |
| Crowded Crypt | 25% | 27% | 20% | +7 | 7.7 |  |
| Windswept Heath | 24% | 27% | 20% | +7 | - |  |
| Godless Shrine | 16% | 27% | 20% | +7 | - |  |
| Professional Face-Breaker | 19% | 26% | 20% | +6 | 6.2 |  |
| Path to Exile | 21% | 26% | 20% | +6 | 6.0 |  |
| Dark Prophecy | 15% | 26% | 20% | +6 | 9.1 |  |
| Woe Strider | 19% | 26% | 20% | +6 | 7.0 |  |
| Mahadi, Emporium Master | 24% | 25% | 20% | +5 | 7.7 |  |
| Deadly Dispute | 15% | 25% | 21% | +4 | 9.9 |  |
| Grand Crescendo | 12% | 25% | 21% | +4 | 9.8 |  |
| Marsh Flats | 26% | 24% | 20% | +4 | - |  |
| Urza's Saga | 16% | 24% | 21% | +4 | - |  |
| Command Tower | 22% | 24% | 21% | +4 | - | noncmd |
| Soul's Attendant | 22% | 24% | 21% | +4 | 6.0 |  |
| Spirit Mantle | 17% | 24% | 21% | +3 | 7.2 |  |
| Urborg, Tomb of Yawgmoth | 17% | 24% | 21% | +3 | - | random |
| Arid Mesa | 21% | 24% | 21% | +3 | - |  |
| Arcane Signet | 26% | 23% | 21% | +3 | 6.8 | noncmd |
| Anim Pakal, Thousandth Moon | 20% | 23% | 21% | +2 | 8.5 |  |
| Mace of the Valiant | 20% | 23% | 21% | +2 | 8.0 | random |
| Generous Plunderer | 26% | 23% | 21% | +2 | 6.6 |  |
| Swiftfoot Boots | 19% | 23% | 21% | +2 | 6.2 |  |
| Zurgo Stormrender | 97% | 21% | 20% | +1 | 5.2 |  |
| Grim Hireling | 21% | 22% | 21% | +1 | 8.3 |  |
| Blasphemous Act | 21% | 22% | 21% | +1 | 8.8 |  |
| Eiganjo, Seat of the Empire | 26% | 22% | 21% | +1 | - |  |
| Shinka, the Bloodsoaked Keep | 21% | 22% | 21% | +1 | - |  |
| Enduring Innocence | 20% | 22% | 21% | +0 | 8.6 |  |
| Phyrexian Tower | 26% | 22% | 21% | +0 | - | all |
| Verdant Catacombs | 23% | 21% | 21% | +0 | - |  |
| Blood Crypt | 20% | 21% | 21% | +0 | - |  |
| Stadium Headliner | 20% | 21% | 21% | +0 | 6.3 |  |
| Vault of Champions | 24% | 21% | 21% | +0 | - |  |
| Scrubland | 22% | 21% | 21% | -1 | - |  |
| Pitiless Plunderer | 19% | 21% | 21% | -1 | 9.2 |  |
| Talisman of Hierarchy | 21% | 21% | 22% | -1 | 6.6 |  |
| Polluted Delta | 26% | 20% | 22% | -1 | - |  |
| Black Market Connections | 13% | 20% | 22% | -2 | 9.3 |  |
| Sacred Foundry | 22% | 20% | 22% | -2 | - |  |
| Carrion Feeder | 18% | 19% | 22% | -3 | 6.5 |  |
| Ashnod's Altar | 17% | 17% | 22% | -5 | 8.8 |  |
| Blade of Selves | 19% | 17% | 22% | -5 | 6.6 | random |
| Fellwar Stone | 16% | 17% | 22% | -6 | 6.6 |  |
| Talisman of Conviction | 19% | 16% | 23% | -6 | 6.3 |  |
| Goblin Bombardment | 0% | - | 21% | - | - | all |
| Indulge | 0% | - | 21% | - | - |  |
| Viscera Seer | 0% | - | 21% | - | - | all |

Never cast or played: Goblin Bombardment, Indulge, Viscera Seer

## Check by hand (Manafold or the Forge window)

Bots can be wrong about a card. Before acting on a finding, play or watch a few games and check:
- zurgo: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Reconnaissance, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo: rarely or never used by the bot: Goblin Bombardment, Indulge, Reconnaissance, Viscera Seer. Clunky, or just misplayed?
- zurgo-app5: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo-app5: rarely or never used by the bot: Goblin Bombardment, Indulge, Viscera Seer. Clunky, or just misplayed?
- zurgo-app10: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo-app10: rarely or never used by the bot: Goblin Bombardment, Indulge, Viscera Seer. Clunky, or just misplayed?
- zurgo-staples5: Forge's AI is flagged as weak with Blade of Selves, Goblin Bombardment, Mace of the Valiant, Phyrexian Altar, Phyrexian Tower, Urborg, Tomb of Yawgmoth, Viscera Seer. A person would play these better.
- zurgo-staples5: rarely or never used by the bot: Goblin Bombardment, Indulge, Viscera Seer. Clunky, or just misplayed?
- Record hand-played games in results/<job>/manual.csv (columns: date, platform, deck, seat, won, turns, notes).
