# 🎨 Drop your sprites here

The game runs with emoji placeholders until PNG files appear in this folder —
**no code changes needed**. Add a file with the right name and it is picked up
automatically on the next page load.

Recommended: square PNGs with transparency, **64×64 or 128×128**, pixel-art
friendly (the game renders them with `image-rendering: pixelated`).

## Monsters
| file | replaces |
|---|---|
| `rat.png` | 🐀 Rat |
| `bat.png` | 🦇 Cave Bat |
| `slime.png` | 🫠 Slime |
| `slimeling.png` | 🫧 Slimeling |
| `ghost.png` | 👻 Ghost |
| `skeleton.png` | 💀 Skeleton |
| `spider.png` | 🕷️ Tomb Spider |
| `orc.png` | 👹 Orc Brute |
| `shaman.png` | 🧙 Gloom Shaman |
| `mimic.png` | 👿 Mimic (exposed) |
| `ogre.png` | 🧌 Ogre Warden (elite) |
| `wraith.png` | 🪦 Vault Wraith (elite) |
| `colossus.png` | 🗿 Bone Colossus (boss) |
| `heart.png` | ❤️‍🔥 The Dungeon Heart (boss) |

## Board features
| file | replaces |
|---|---|
| `chest.png` | 🎁 closed chest (mimics use this too!) |
| `chest_open.png` | opened chest décor |
| `gold.png` | 🪙 gold vein |
| `stairs.png` | 🪜 stairs down |
| `web.png` | 🕸️ spider web overlay |
| `rubble.png` | 🪨 rubble |
| `corpse.png` | 🦴 corpse décor |
| `lock.png` | ⛓️ boss seal on stairs |

## Card art (`card_<id>.png`)
`card_slash.png`, `card_bow.png`, `card_torch.png`, `card_heal.png`,
`card_dagger.png`, `card_excavate.png`, `card_ward.png`, `card_relocate.png`,
`card_scry.png`, `card_whirlwind.png`, `card_purify.png`, `card_fireball.png`,
`card_chain.png`, `card_midas.png`, `card_focus.png`, `card_divination.png`

## Relics (`relic_<id>.png`)
`relic_lantern.png`, `relic_whetstone.png`, `relic_quiver.png`,
`relic_bloodvial.png`, `relic_luckycoin.png`, `relic_compass.png`,
`relic_boots.png`, `relic_ghostglass.png`, `relic_stormring.png`

The full manifest lives in [`js/sprites.js`](../../js/sprites.js) — add new
entries there if you invent new monsters or cards.
