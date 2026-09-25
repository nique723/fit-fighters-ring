# Fit Fighters — Ring Proto

Side-view boxing feel prototype. Player vs dummy. Phaser 3 + Vite.

## Local

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Controls

- A / D — retreat / close
- J jab · K cross · L body
- Space — slip
- ` — debug overlay

Touch devices get six on-screen buttons.

Camera is optional. Press **Camera**, allow the webcam, hold guard 2 seconds, throw one jab. Pose runs on-device. Video never leaves the browser.

## Deploy

Import this repo in Vercel. Vite is detected automatically. Output folder: `dist`.

Live: nique-ring.vercel.app (rebuild from this repo, not the Sep 6 CLI placeholder).
