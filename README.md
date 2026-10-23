# Fit Fighters — Ring Proto

2.5D boxing prototype — 1990s fight-night arena. Phaser 3 + Vite.

- **Roster:** Crimson Guard (black kit, red gloves), White Lightning, Kamarian (fast hands, quick feet, big engine — but small, so every punch he eats drains his stamina; full mocap set: hit reactions, knockdown + get-up, victory). Lamar (guard always up, heavy hands, experience — slow feet and hands, short gas tank; auto-rigged from an unrigged Meshy mesh). Malachi (heavyweight: longest reach and heaviest hands on the roster — slow feet and hands, short gas tank). Joe (power and a high guard, but new to boxing — stays stunned longer, small counter window, telegraphs; slow feet). KD Sykes (fastest hands, footwork, engine — but his hands drop, light power and chin). LJ (6'0" power puncher, big engine, clean mechanics — one year in, so a low guard and a light chin). Jersey (Tyshon: 6'0" out-boxer, long reach, quick hands, good feet — no gas tank, light power). Each fighter has 8 ratings (1-10, 40-point budget: hand speed, footwork, power, reach, chin, engine, guard, experience) in `CONFIG.roster` that change real combat numbers — see `src/ratings.js`. Fight-night flow: landing page (`src/title.js`: key art with spotlights, arena lights, crowd flashes and haze; ENTER THE ARENA brings up the crowd; LIVE bug; menu with Play, Tonight's card — scrolling real-roster matchups you can tap straight into — How to play, Sound) -> Tale of the Tape select (`src/select.js`) -> ring walk-in (`src/intro.js`: main event card, bell, ROUND 1, FIGHT!) -> round starts. Crowd, cheers and bell are synthesized (`src/arena-audio.js`); the crowd reacts to power shots and knockdowns. Pick on the select screen (You, then Opponent, ratings side by side; **Fighters** reopens it before the bell), or skip it with `?p=kamarian&o=o`. Only the two picked fighters' frames are downloaded. As the opponent each fighter fights in character (`ai` in `CONFIG.roster`).
- Fighters are pre-rendered 3D sprites (Meshy models, auto-rigged and posed in Blender — see `tools/sprites`).
- Move left/right **and** in/out of the ring. Punches only land when you share a lane (`arena.laneTolerance`); step off the line to make him miss, circle past him to switch sides.
- Broadcast camera zooms in close and pulls out as the fighters separate (`CONFIG.camera`).

## Local

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Controls

- WASD / arrows — move (W/S = in/out of the ring)
- J jab · K cross · H lead hook · L body · U uppercut
- Space — slip · I (or Shift) — duck
- ` — debug overlay

You can move before the bell. Touch devices get a D-pad and seven punch/defense buttons.

The lead hook is the round punch: shorter reach than the straights, but it sweeps twice the lane width (`punches.hook.lane`), so it catches an opponent who stepped off the line. Duck under it.

Camera is optional. Press **Camera**, allow the webcam, hold guard 2 seconds, throw one jab. Pose runs on-device. Video never leaves the browser.

## Deploy

Import this repo in Vercel. Vite is detected automatically. Output folder: `dist`.

Live: nique-ring.vercel.app (rebuild from this repo, not the Sep 6 CLI placeholder).
