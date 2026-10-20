# Sprite + arena pipeline (Blender, headless)

Turns un-rigged Meshy A-pose FBX exports into pre-rendered fighter frames, and renders the 1990s arena.

```bash
pip install bpy==5.2.2          # Blender as a Python module (Python 3.13)
python3 make_tex.py             # banners, canvas logo, apron → tex/
python3 render_sprites.py crimson path/to/Crimson_Guard.fbx out/crimson
python3 render_sprites.py white   path/to/White_Lightning.fbx out/white
python3 render_mocap.py kamarian path/to/Kamarian.glb path/to/anims/ out/kamarian   # Meshy-rigged GLB + Mixamo FBX clips
RW=1440 SAMPLES=24 HAZE=0.016 FSTOP=1.2 OUT=arena.png python3 arena.py
```

- `rig.py` — finds joints by slicing the mesh, builds a skeleton, heat-weights it (voxel proxy fallback). Per-model joint guesses live in `SPEC`; a new character needs one entry. `add_gloves()` puts gloves on a gloveless model.
- `poses.py` — every frame as IK targets in a fighter frame (forward, left, up in meters). Edit numbers, re-render.
- `render_sprites.py` — 480×504 frames, feet anchored at (0.4, 0.9716), 240 px/m. Convert to WebP into `public/fighters/{p,o}/`.
- `arena.py` — prints the floor projection table. If the camera changes, paste it into `src/stage.js` (PROJ).
- Sprites are rendered at 8° camera pitch to match the arena camera.

## Mocap fighters (`render_mocap.py` + move library)

For Meshy models that come **already rigged** (Mixamo bone names). All fighters share one move library.

**Move library** — `clips/*.npz`, baked from Mixamo FBX (3.3 MB for 19 clips instead of ~35 MB of FBX):

```bash
python3 bake_clips.py path/to/new_mixamo_fbx/     # adds/updates clips/<name>.npz
```

**`MOVES`** in `render_mocap.py` maps every game frame to `(clip, clip frame @30fps, comp[, forward m])`:
`comp` = how much forward hip drift is cancelled (1 = in place). Every fighter uses `MOVES`; a fighter can
override entries in `FIGHTERS[<id>]['moves']`. Game frames with no clip yet (`IK_ONLY`: uppercut) use the IK poses.

**Pick frames by eye**, not by guessing:

```bash
python3 render_mocap.py kamarian fighter.glb out/probe --probe hook 13,19,25,31,37
```

**Unrigged Meshy model?** Set `height` (m) in `FIGHTERS[<id>]`; `automix.py` measures the joints from the
mesh, builds a Mixamo-named skeleton and skins it, then everything below works the same. Fighters taller than
~1.7 m render on a taller canvas so a raised glove fits; copy `anchorX/anchorY` from `anchor.json` into the
roster entry as `anchor: [x, y]`.

**Gloves** — `gloves/fight_glove.glb`: a textured lace-up fight glove built in Meshy (multi-image-to-3d, task
`01a157a6-977a-77fe-955c-398fa258fba5`) from AI reference views, cut from 1.4M to 150k faces (lower than that
breaks the texture seams). Set `glove_model` per fighter; `glove_colors` recolors its black panels (`main`) and
gold panels (`accent`), with optional `main_metal` / `accent_metal`. The bare hand under the glove is removed.

**New fighter = 4 steps**
1. Add `FIGHTERS['<id>'] = dict(glove=..., cuff=..., moves={})`.
2. `python3 render_mocap.py <id> path/to/model.glb out/<id>` (~3 min, 2 cores).
3. PNG -> WebP q82 into `public/fighters/<id>/` (also write `hithead`=`hithead1`, `hitbody`=`hitbody1`,
   `upper2`/`upper3`=`upper1` for the legacy frame names).
4. Add `{ id, name, trait, mocap: true, stats }` to `CONFIG.roster`.

Clips in use: lead_jab (jab), jab_cross (idle, cross), uppercut_jab (lead uppercut), right_block (shell block), hook, boxing_3 (body), medium_step_forward (walk),
dodging (slip, duck), light_hit_to_head / medium_hit_to_head_2 / head_hit_2 (head reactions by punch),
hit_to_body / big_rib_hit (body; rib = body counter), stunned_2 + getting_up (knockdown), victory.
Baked but unused: boxing, step_backward, right_pivot, left_pivot, taunt, standing, receive_stomach_uppercut.
