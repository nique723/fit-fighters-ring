# Sprite + arena pipeline (Blender, headless)

Turns un-rigged Meshy A-pose FBX exports into pre-rendered fighter frames, and renders the 1990s arena.

```bash
pip install bpy==5.2.2          # Blender as a Python module (Python 3.13)
python3 make_tex.py             # banners, canvas logo, apron → tex/
python3 render_sprites.py crimson path/to/Crimson_Guard.fbx out/crimson
python3 render_sprites.py white   path/to/White_Lightning.fbx out/white
python3 render_mocap.py rising path/to/Rising.glb path/to/anims/ out/rising   # Meshy-rigged GLB + Mixamo FBX clips
RW=1440 SAMPLES=24 HAZE=0.016 FSTOP=1.2 OUT=arena.png python3 arena.py
```

- `rig.py` — finds joints by slicing the mesh, builds a skeleton, heat-weights it (voxel proxy fallback). Per-model joint guesses live in `SPEC`; a new character needs one entry. `add_gloves()` puts gloves on a gloveless model.
- `poses.py` — every frame as IK targets in a fighter frame (forward, left, up in meters). Edit numbers, re-render.
- `render_sprites.py` — 480×504 frames, feet anchored at (0.4, 0.9716), 240 px/m. Convert to WebP into `public/fighters/{p,o}/`.
- `arena.py` — prints the floor projection table. If the camera changes, paste it into `src/stage.js` (PROJ).
- Sprites are rendered at 8° camera pitch to match the arena camera.

## Mocap fighters (`render_mocap.py`)

For Meshy models that come **already rigged** (Mixamo bone names) plus Mixamo FBX clips.

- Each sprite frame is one clip frame: `FIGHTERS[<id>]['frames']` maps `jab2 -> ('jab_cross', 15, 0.6)` = clip, frame (30 fps), root-drift cancel (1 = in place).
- Clips are found by file name in the anim folder (`Jab_Cross.fbx` -> `jab_cross`).
- Any game frame without a clip falls back to the IK poses in `poses.py`, scaled to the fighter's height.
- Gloves are added (`glove` colour in the spec). Fists come from the mocap.
- Convert PNG -> WebP (q82) into `public/fighters/<id>/` and add `{ id, name }` to `CONFIG.roster`.

Rising (`rising`): Jab_Cross (idle, jab, cross), Boxing (hook), Boxing_3 (body), Medium_Step_Forward (walk). Uppercut, slip, duck, hit reactions and knockdown are still IK.
