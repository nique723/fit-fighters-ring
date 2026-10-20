"""Bake Mixamo FBX clips into the shared move library (tools/sprites/clips/<name>.npz).

python3 bake_clips.py path/to/fbx_dir [more dirs or .fbx files...]

Stores, per bone, the world-space rest matrix and the world-space pose matrix for every frame,
so render_mocap.py never needs the 2 MB FBX files again. Clip name = file name, lowercased,
upload prefix stripped: 'cf5e6d70-Jab_Cross.fbx' -> 'jab_cross'.
"""
import bpy, sys, os, glob
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clips')


def clip_name(path):
    base = os.path.splitext(os.path.basename(path))[0].lower()
    return base.split('-', 1)[-1]


def bake(fbx):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    act = arm.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    names = [b.name for b in arm.data.bones]
    mw = arm.matrix_world
    rest = np.array([np.array(mw @ b.matrix_local) for b in arm.data.bones], dtype=np.float32)
    pose = np.zeros((f1 - f0 + 1, len(names), 4, 4), dtype=np.float32)
    sc = bpy.context.scene
    for i, f in enumerate(range(f0, f1 + 1)):
        sc.frame_set(f)
        for j, n in enumerate(names):
            pose[i, j] = np.array(mw @ arm.pose.bones[n].matrix)
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, clip_name(fbx) + '.npz')
    np.savez_compressed(out, names=np.array(names), rest=rest, pose=pose, f0=f0, fps=sc.render.fps)
    print('BAKED', clip_name(fbx), f'{f1 - f0 + 1} frames', f'{os.path.getsize(out) // 1024} KB')


if __name__ == '__main__':
    files = []
    for a in sys.argv[1:]:
        files += sorted(glob.glob(os.path.join(a, '*.fbx'))) if os.path.isdir(a) else [a]
    for f in files:
        bake(f)
