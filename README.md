# Fit Fighters — Ring Proto

2.5D boxing prototype — 1990s fight-night arena. Phaser 3 + Vite.

- **Roster:** Crimson Guard (black kit, red gloves), White Lightning, Kamarian (fast hands, quick feet, big engine — but small, so every punch he eats drains his stamina; full mocap set: hit reactions, knockdown + get-up, victory). Each fighter has 6 ratings (1-10, 30-point budget) in `CONFIG.roster` that change real combat numbers — see `src/ratings.js`. Pick with the **Fighter** button before the bell, or `?p=kamarian&o=o`.
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
