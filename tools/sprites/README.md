# Sprite + arena pipeline (Blender, headless)

Turns un-rigged Meshy A-pose FBX exports into pre-rendered fighter frames, and renders the 1990s arena.

```bash
pip install bpy==5.2.2          # Blender as a Python module (Python 3.13)
python3 make_tex.py             # banners, canvas logo, apron → tex/
python3 render_sprites.py crimson path/to/Crimson_Guard.fbx out/crimson
python3 render_sprites.py white   path/to/White_Lightning.fbx out/white
RW=1440 SAMPLES=24 HAZE=0.016 FSTOP=1.2 OUT=arena.png python3 arena.py
```

- `rig.py` — finds joints by slicing the mesh, builds a skeleton, heat-weights it (voxel proxy fallback). Per-model joint guesses live in `SPEC`; a new character needs one entry. `add_gloves()` puts gloves on a gloveless model.
- `poses.py` — every frame as IK targets in a fighter frame (forward, left, up in meters). Edit numbers, re-render.
- `render_sprites.py` — 480×504 frames, feet anchored at (0.4, 0.9716), 240 px/m. Convert to WebP into `public/fighters/{p,o}/`.
- `arena.py` — prints the floor projection table. If the camera changes, paste it into `src/stage.js` (PROJ).
- Sprites are rendered at 8° camera pitch to match the arena camera.
