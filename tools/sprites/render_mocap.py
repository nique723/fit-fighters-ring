"""Mixamo-rigged fighter (Meshy GLB) + the shared move library -> sprite frames.

  python3 render_mocap.py kamarian path/to/fighter.glb out/kamarian            # every frame
  python3 render_mocap.py kamarian path/to/fighter.glb out/kamarian jab2,hook1  # some frames
  python3 render_mocap.py kamarian path/to/fighter.glb out/probe --probe hook 13,19,25,31

Clips come from clips/*.npz (bake new Mixamo FBX with bake_clips.py). MOVES maps every game frame
to (clip, clip frame, comp) and is shared by all fighters; a fighter can override any entry.
Frames with no clip fall back to the IK poses in poses.py, scaled to the fighter's height.

comp = fraction of the clip's forward hip drift cancelled so the sprite stays on its anchor
(1 = fully in place; punches keep some lunge so the shot still reaches). Sideways drift is
always cancelled (sideways is depth from this camera).

Retarget, per bone, world space: R_tgt = R_src(t) @ R_src_rest^-1 @ A @ R_tgt_rest, where A swings
the target's rest bone direction onto the source's. The target keeps its own A-pose rest (its slight
elbow/knee bend is what the IK fallback needs to solve), so the Mixamo T-pose rest doesn't matter.
"""
import bpy, sys, os, math, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pose, scene_util, poses
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, 'clips')

# ---- shared move list: game frame -> (clip, clip frame @30fps, comp) --------------------------
MOVES = {
    'idle0': ('jab_cross', 53, 1.0), 'idle1': ('jab_cross', 55, 1.0),
    'idle2': ('jab_cross', 57, 1.0), 'idle3': ('jab_cross', 59, 1.0),
    'walk0': ('medium_step_forward', 1, 1.0), 'walk1': ('medium_step_forward', 5, 1.0),
    'walk2': ('medium_step_forward', 8, 1.0), 'walk3': ('medium_step_forward', 25, 1.0),
    'jab0': ('jab_cross', 9, 0.6), 'jab1': ('jab_cross', 12, 0.6),
    'jab2': ('jab_cross', 15, 0.6), 'jab3': ('jab_cross', 17, 0.6),
    'cross0': ('jab_cross', 17, 0.6), 'cross1': ('jab_cross', 19, 0.6),
    'cross2': ('jab_cross', 21, 0.6), 'cross3': ('jab_cross', 23, 0.6),
    'hook0': ('hook', 19, 0.75), 'hook1': ('hook', 34, 0.75),
    'hook2': ('hook', 37, 0.75), 'hook3': ('hook', 43, 0.75),
    'body0': ('boxing_3', 11, 0.6), 'body1': ('boxing_3', 15, 0.6),
    'body2': ('boxing_3', 19, 0.6), 'body3': ('boxing_3', 23, 0.6),
    'slip': ('dodging', 17, 1.0), 'duck': ('dodging', 45, 1.0),
    # hit reactions: impact, peak, recover
    'hitlight0': ('light_hit_to_head', 5, 1.0), 'hitlight1': ('light_hit_to_head', 9, 1.0),
    'hitlight2': ('light_hit_to_head', 15, 1.0),
    'hithead0': ('medium_hit_to_head_2', 4, 1.0), 'hithead1': ('medium_hit_to_head_2', 10, 1.0),
    'hithead2': ('medium_hit_to_head_2', 19, 1.0),
    'hitbig0': ('head_hit_2', 7, 1.0), 'hitbig1': ('head_hit_2', 13, 1.0), 'hitbig2': ('head_hit_2', 22, 1.0),
    'hitbody0': ('hit_to_body', 10, 1.0), 'hitbody1': ('hit_to_body', 19, 1.0), 'hitbody2': ('hit_to_body', 31, 1.0),
    'hitrib0': ('big_rib_hit', 13, 1.0), 'hitrib1': ('big_rib_hit', 25, 1.0), 'hitrib2': ('big_rib_hit', 37, 1.0),
    # knockdown: fall, flat, get up
    'down0': ('stunned_2', 9, 1.0), 'down1': ('stunned_2', 21, 1.0), 'down2': ('stunned_2', 33, 1.0, 0.3),
    'down3': ('stunned_2', 45, 1.0, 0.3),   # 4th value: slide forward (m) so he fits the frame lying down
    'rise0': ('getting_up', 19, 1.0, 0.3), 'rise1': ('getting_up', 31, 1.0), 'rise2': ('getting_up', 43, 1.0),
    'rise3': ('getting_up', 55, 1.0),
    'kneel': ('standing', 1, 1.0),
    'victory0': ('victory', 19, 1.0), 'victory1': ('victory', 28, 1.0), 'victory2': ('victory', 46, 1.0),
    'victory3': ('victory', 64, 1.0),
}
# Game frames that still come from IK (no clip yet). upper2/3 reuse upper1 at export time.
IK_ONLY = ['upper0', 'upper1']

FIGHTERS = {
    'kamarian': dict(glove=(0.62, 0.40, 0.03, 1), cuff=(0.03, 0.03, 0.035, 1), moves={}),
}

M = 'mixamorig:'
# primary child: defines each bone's direction for rest matching
CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head',
         'Head': 'HeadTop_End'}
for s in ('Left', 'Right'):
    CHILD.update({s+'Shoulder': s+'Arm', s+'Arm': s+'ForeArm', s+'ForeArm': s+'Hand', s+'Hand': s+'HandMiddle1',
                  s+'UpLeg': s+'Leg', s+'Leg': s+'Foot', s+'Foot': s+'ToeBase', s+'ToeBase': s+'Toe_End'})
    for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for i in (1, 2, 3):
            CHILD[f'{s}Hand{f}{i}'] = f'{s}Hand{f}{i+1}'
# IK pose names used by pose.py -> mixamo bones
IKNAME = {'Hips': 'pelvis', 'Spine': 'spine', 'Spine2': 'chest', 'Neck': 'neck', 'Head': 'head',
          'LeftArm': 'upper_arm.L', 'LeftForeArm': 'forearm.L', 'RightArm': 'upper_arm.R', 'RightForeArm': 'forearm.R',
          'LeftUpLeg': 'thigh.L', 'LeftLeg': 'shin.L', 'LeftFoot': 'foot.L',
          'RightUpLeg': 'thigh.R', 'RightLeg': 'shin.R', 'RightFoot': 'foot.R'}
REF_H = 1.85   # height poses.py was tuned on


class Clip:
    """A baked clip: world rest + per-frame world pose matrices per bone."""
    def __init__(self, name):
        d = np.load(os.path.join(CLIPS, name + '.npz'))
        self.name = name
        self.idx = {str(n): i for i, n in enumerate(d['names'])}
        self.rest = d['rest']; self.pose = d['pose']; self.f0 = int(d['f0'])

    def has(self, n): return n in self.idx
    def _m(self, a): return Matrix([list(r) for r in a])
    def rest3(self, n): return self._m(self.rest[self.idx[n]]).to_3x3().normalized()
    def rest_head(self, n): return Vector(self.rest[self.idx[n]][:3, 3])
    def frame(self, f): return max(0, min(len(self.pose) - 1, f - self.f0))
    def pose3(self, n, f): return self._m(self.pose[self.frame(f)][self.idx[n]]).to_3x3().normalized()
    def pose_head(self, n, f): return Vector(self.pose[self.frame(f)][self.idx[n]][:3, 3])

    def rest_dir(self, n):
        short = n[len(M):]
        c = CHILD.get(short)
        if c and self.has(M + c):
            d = self.rest_head(M + c) - self.rest_head(n)
            if d.length > 1e-5: return d.normalized()
        return (self.rest3(n) @ Vector((0, 1, 0))).normalized()


_clips = {}
def clip(name):
    if name not in _clips: _clips[name] = Clip(name)
    return _clips[name]


def order(arm):
    out = []
    def walk(b):
        out.append(b.name)
        for c in b.children: walk(c)
    for b in arm.data.bones:
        if b.parent is None: walk(b)
    return out


def head_w(arm, name, rest=False):
    if rest: return arm.matrix_world @ arm.data.bones[name].head_local
    return arm.matrix_world @ arm.pose.bones[name].head


def rest_dir_tgt(arm, name):
    short = name[len(M):] if name.startswith(M) else name
    c = CHILD.get(short)
    if c and (M + c) in arm.data.bones:
        d = head_w(arm, M + c, True) - head_w(arm, name, True)
        if d.length > 1e-5: return d.normalized()
    b = arm.data.bones[name]
    return (arm.matrix_world.to_3x3() @ (b.tail_local - b.head_local)).normalized()


def set_world_rot(arm, name, R3, loc=None):
    pb = arm.pose.bones[name]
    mw = arm.matrix_world
    if loc is None: loc = mw @ pb.head
    pb.matrix = mw.inverted() @ (Matrix.Translation(loc) @ R3.to_4x4())
    bpy.context.view_layer.update()


def load_target(glb):
    bpy.ops.import_scene.gltf(filepath=glb)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    for o in bpy.data.objects:
        if o.type == 'MESH' and o not in meshes: o.hide_render = True; o.hide_viewport = True
    if arm.animation_data: arm.animation_data.action = None
    reset(arm)
    return arm, meshes


def reset(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def retarget_frame(arm, src, frame, comp, k, fwd=0.0):
    reset(arm)
    for n in order(arm):
        if not src.has(n): continue
        t_rest = (arm.matrix_world @ arm.data.bones[n].matrix_local).to_3x3().normalized()
        A = rest_dir_tgt(arm, n).rotation_difference(src.rest_dir(n)).to_matrix()
        R = src.pose3(n, frame) @ src.rest3(n).inverted() @ A @ t_rest
        loc = None
        if n == M + 'Hips':
            h = src.pose_head(n, frame)
            # fighter frame: forward = -Y, left = +X. Cancel sideways drift fully, forward by comp.
            loc = Vector((0.0, h.y * k * (1 - comp) - fwd, h.z * k))
        set_world_rot(arm, n, R, loc)
    # keep the lowest point of the feet on the floor (proportions differ from the mocap actor).
    # Use the lower of: planted foot vs rest, or anything (hips/hands) below the floor on knockdowns.
    dz = min((head_w(arm, M + s + 'Foot') - head_w(arm, M + s + 'Foot', rest=True)).z for s in ('Left', 'Right'))
    hb = arm.pose.bones[M + 'Hips']
    set_world_rot(arm, M + 'Hips', (arm.matrix_world @ hb.matrix).to_3x3().normalized(), head_w(arm, M + 'Hips') - Vector((0, 0, dz)))


def floor_fix(meshes, arm):
    """After posing: if any vertex is below z=0 (lying/kneeling poses), lift the hips so it touches."""
    dg = bpy.context.evaluated_depsgraph_get()
    zmin = min(min((o.matrix_world @ v.co).z for v in o.evaluated_get(dg).to_mesh().vertices) for o in meshes)
    for o in meshes: o.evaluated_get(dg).to_mesh_clear()
    if zmin < -0.005:
        hb = arm.pose.bones[M + 'Hips']
        set_world_rot(arm, M + 'Hips', (arm.matrix_world @ hb.matrix).to_3x3().normalized(), head_w(arm, M + 'Hips') + Vector((0, 0, -zmin)))


def add_gloves(arm, color, cuff, k):
    mat = bpy.data.materials.new('glove'); mat.use_nodes = True
    b = mat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = color
    b.inputs['Roughness'].default_value = 0.32
    try: b.inputs['Coat Weight'].default_value = 0.5
    except Exception: pass
    mc = bpy.data.materials.new('cuff'); mc.use_nodes = True
    mc.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = cuff
    mc.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.5
    for s in ('Left', 'Right'):
        hb = arm.data.bones[M + s + 'Hand']; L = hb.length
        th = hb.matrix_local.inverted() @ arm.data.bones[M + s + 'HandThumb1'].head_local
        tx = 1 if th.x > 0 else -1; tz = 1 if th.z > 0 else -1
        parts = []
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
        g = bpy.context.active_object; g.scale = (0.062*k, 0.115*k, 0.068*k); g.location = (0, 0.075*k, 0)
        g.data.materials.append(mat); parts.append(g)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1)
        t = bpy.context.active_object; t.scale = (0.03*k, 0.065*k, 0.032*k)
        t.location = (tx*0.05*k, 0.035*k, tz*0.02*k); t.data.materials.append(mat); parts.append(t)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1, depth=1)
        c = bpy.context.active_object; c.scale = (0.052*k, 0.052*k, 0.11*k); c.rotation_euler = (math.radians(90), 0, 0)
        c.location = (0, -0.04*k, 0); c.data.materials.append(mc); parts.append(c)
        for p in parts:
            bpy.ops.object.shade_smooth()
            mw = p.matrix_basis.copy()
            p.parent = arm; p.parent_type = 'BONE'; p.parent_bone = M + s + 'Hand'
            p.matrix_parent_inverse.identity()
            p.matrix_basis = Matrix.Translation((0, -L, 0)) @ mw
    return mats_meshes()


def mats_meshes():
    return [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render]


def ik_setup(arm):
    for short, new in IKNAME.items():
        arm.data.bones[M + short].name = new
    for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'
    return pose.setup_ik(arm)


def scaled(p, k, ankle=0.0):
    """poses.py numbers are for a 1.85 m fighter with IK feet at z=0; scale to this one and lift the
    foot targets (the IK end is the ankle joint) to this model's ankle height."""
    d = dict(pose.DEF); d.update(p)
    for key in ('lh', 'rh', 'lp', 'rp', 'lf', 'rf', 'lk', 'rk', 'shift'):
        d[key] = tuple(v * k for v in d[key])
    for key in ('lf', 'rf'):
        f, l, u = d[key]; d[key] = (f, l, u + ankle)
    d['drop'] = d['drop'] * k
    return d


def main():
    args = sys.argv[1:]
    probe = None
    if '--probe' in args:
        i = args.index('--probe'); probe = (args[i + 1], [int(x) for x in args[i + 2].split(',')]); args = args[:i]
    name, glb, outdir = args[:3]
    only = args[3].split(',') if len(args) > 3 else None
    spec = FIGHTERS[name]
    moves = dict(MOVES); moves.update(spec.get('moves', {}))
    os.makedirs(outdir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm, meshes = load_target(glb)
    vz = [(ob.matrix_world @ v.co).z for ob in meshes for v in ob.data.vertices]
    H = max(vz) - min(vz)
    ref = clip('jab_cross')
    k_hip = head_w(arm, M + 'Hips', rest=True).z / ref.rest_head(M + 'Hips').z
    print('HEIGHT', round(H, 3))
    add_gloves(arm, spec['glove'], spec['cuff'], H / 1.75)
    meshes = mats_meshes()

    scene_util.light_rig()
    RW, RH = 480, 504
    cam = scene_util.sprite_camera(8, 2.0, RW, RH, 0.2, 1.0)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'
    sc.cycles.samples = int(os.environ.get('SAMPLES', '32')); sc.render.film_transparent = True
    sc.cycles.use_denoising = True
    bpy.context.view_layer.update()
    a = world_to_camera_view(sc, cam, Vector((0, 0, 0)))
    json.dump({'anchorX': a.x, 'anchorY': 1 - a.y, 'w': RW, 'h': RH, 'pxPerM': RW / 2.0, 'height': H},
              open(outdir + '/anchor.json', 'w'))

    def render(key):
        sc.render.filepath = f'{outdir}/{key}.png'; bpy.ops.render.render(write_still=True)

    def mocap(key, cname, fr, comp, fwd=0.0):
        retarget_frame(arm, clip(cname), fr, comp, k_hip, fwd)
        floor_fix(meshes, arm)
        render(key)

    if probe:
        for fr in probe[1]: mocap(f'{probe[0]}_f{fr:03d}', probe[0], fr, 1.0)
        return
    for key, m in moves.items():
        if only and key not in only: continue
        mocap(key, *m)
    # IK fallback for game frames no clip covers yet
    todo = [k for k in IK_ONLY if not only or k in only]
    if not todo: return
    reset(arm)
    tg = ik_setup(arm)
    kh = H / REF_H
    ank = min(head_w(arm, 'foot.' + s_, rest=True).z for s_ in 'LR')
    pose.calibrate_poles(arm, tg, scaled(poses.POSES['duck'], kh, ank))
    for key in todo:
        pose.apply(arm, tg, scaled(poses.POSES[key], kh, ank))
        render(key)


if __name__ == '__main__':
    main()
