# 🎨 The monster cast

The 60 sprites (`a00.png`–`a29.png`, `b00.png`–`b29.png`) were cut from the
two source sheets, backgrounds removed. Who's who is declared in
[`js/config.js`](../../js/config.js) — every monster and squad creature has a
`sprite: 'aXX'` field — and [`js/sprites.js`](../../js/sprites.js) builds the
manifest from it automatically.

Special cameos wired in `js/sprites.js`:

| file | role |
|---|---|
| `b08.png` | the player portrait (sidebar) |
| `a02.png` | Clucker, the menagerie hen |
| `a07.png` | Glitchy, the Lucky Lift slot-bot |
| `a14.png` | the Pink Reaper (death screen) |

To reskin anything, just replace the PNG (square, transparent background,
~176px). If a file is missing the game falls back to an emoji placeholder —
no code changes needed.
