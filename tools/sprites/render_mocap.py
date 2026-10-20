"""Mixamo-rigged fighter (Meshy GLB) + Mixamo mocap FBX clips -> sprite frames.

python3 render_mocap.py rising path/to/fighter.glb path/to/anim_dir out/rising [frame,frame,...]

Clips are matched by file name (case-insensitive, any prefix): e.g. '...Jab_Cross.fbx'.
Moves with no clip fall back to the IK poses in poses.py, scaled to the fighter's height.

Retarget, per bone, world space: R_tgt = R_src(t) @ R_src_rest^-1 @ A @ R_tgt_rest, where A swings
the target's rest bone direction onto the source's. The target keeps its own A-pose rest (its slight
elbow/knee bend is what the IK fallback needs to solve), and the Mixamo T-pose rest doesn't matter.
"""
import bpy, sys, os, math, json, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pose, scene_util, poses
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

# ---- per-fighter spec -------------------------------------------------------------------
# comp: fraction of the clip's root (hip) drift cancelled so the sprite stays on its anchor.
#   1.0 = fully in place. Punches keep some lunge so the shot still reaches.
FIGHTERS = {
    'rising': dict(
        glove=(0.62, 0.40, 0.03, 1),   # gold
        cuff=(0.03, 0.03, 0.035, 1),
        frames={
            'idle0': ('jab_cross', 53, 1.0), 'idle1': ('jab_cross', 55, 1.0),
            'idle2': ('jab_cross', 57, 1.0), 'idle3': ('jab_cross', 59, 1.0),
            'walk0': ('medium_step_forward', 1, 1.0), 'walk1': ('medium_step_forward', 5, 1.0),
            'walk2': ('medium_step_forward', 8, 1.0), 'walk3': ('medium_step_forward', 25, 1.0),
            'jab0': ('jab_cross', 9, 0.6), 'jab1': ('jab_cross', 12, 0.6),
            'jab2': ('jab_cross', 15, 0.6), 'jab3': ('jab_cross', 17, 0.6),
            'cross0': ('jab_cross', 17, 0.6), 'cross1': ('jab_cross', 19, 0.6),
            'cross2': ('jab_cross', 21, 0.6), 'cross3': ('jab_cross', 23, 0.6),
            'hook0': ('boxing', 11, 0.6), 'hook1': ('boxing', 13, 0.6),
            'hook2': ('boxing', 15, 0.6), 'hook3': ('boxing', 17, 0.6),
            'body0': ('boxing_3', 11, 0.6), 'body1': ('boxing_3', 15, 0.6),
            'body2': ('boxing_3', 19, 0.6), 'body3': ('boxing_3', 23, 0.6),
        },
    ),
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


def dir_w(arm, name, rest=False):
    short = name[len(M):] if name.startswith(M) else name
    c = CHILD.get(short)
    if c and (M+c) in arm.data.bones:
        d = head_w(arm, M+c, rest) - head_w(arm, name, rest)
        if d.length > 1e-5: return d.normalized()
    if rest:
        b = arm.data.bones[name]; return (arm.matrix_world.to_3x3() @ (b.tail_local - b.head_local)).normalized()
    pb = arm.pose.bones[name]; return (arm.matrix_world.to_3x3() @ (pb.tail - pb.head)).normalized()


def set_world_rot(arm, name, R3, loc=None):
    pb = arm.pose.bones[name]
    mw = arm.matrix_world
    if loc is None: loc = mw @ pb.head
    W = Matrix.Translation(loc) @ R3.to_4x4()
    # keep bone's own scale out of it
    pb.matrix = mw.inverted() @ W
    bpy.context.view_layer.update()


def load_target(glb):
    bpy.ops.import_scene.gltf(filepath=glb)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    for o in bpy.data.objects:
        if o.type == 'MESH' and o not in meshes: o.hide_render = True; o.hide_viewport = True
    if arm.animation_data: arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    return arm, meshes


def load_clip(fbx):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx)
    new = [o for o in bpy.data.objects if o not in before]
    src = [o for o in new if o.type == 'ARMATURE'][0]
    for o in new:
        if o.type == 'MESH': bpy.data.objects.remove(o)
    return src


def retarget_frame(arm, src, frame, comp, k):
    sc = bpy.context.scene
    sc.frame_set(frame)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    for n in order(arm):
        if n not in src.data.bones: continue
        s_rest = (src.matrix_world @ src.data.bones[n].matrix_local).to_3x3().normalized()
        s_pose = (src.matrix_world @ src.pose.bones[n].matrix).to_3x3().normalized()
        t_rest = (arm.matrix_world @ arm.data.bones[n].matrix_local).to_3x3().normalized()
        # A swings the target's rest direction onto the source's, so rest poses may differ (A vs T)
        A = dir_w(arm, n, rest=True).rotation_difference(dir_w(src, n, rest=True)).to_matrix()
        R = s_pose @ s_rest.inverted() @ A @ t_rest
        loc = None
        if n == M+'Hips':
            h = head_w(src, n)
            # fighter frame: forward = -Y, left = +X. Cancel lateral drift fully, forward by comp.
            loc = Vector((h.x * k * 0.0, h.y * k * (1 - comp), h.z * k))
        set_world_rot(arm, n, R, loc)
    # keep the planted foot on the floor (proportions differ from the mocap actor)
    dz = min((head_w(arm, M+s+'Foot') - head_w(arm, M+s+'Foot', rest=True)).z for s in ('Left', 'Right'))
    hb = arm.pose.bones[M+'Hips']
    set_world_rot(arm, M+'Hips', (arm.matrix_world @ hb.matrix).to_3x3().normalized(), head_w(arm, M+'Hips') - Vector((0, 0, dz)))


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
        hb = arm.data.bones[M+s+'Hand']; L = hb.length
        # which local side the thumb is on
        th = hb.matrix_local.inverted() @ arm.data.bones[M+s+'HandThumb1'].head_local
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
            p.parent = arm; p.parent_type = 'BONE'; p.parent_bone = M+s+'Hand'
            p.matrix_parent_inverse.identity()
            p.matrix_basis = Matrix.Translation((0, -L, 0)) @ mw
    # hide fingers inside the glove: fists are already closed by the mocap


def ik_setup(arm):
    for short, new in IKNAME.items():
        arm.data.bones[M+short].name = new
    for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'
    tg = pose.setup_ik(arm)
    return tg


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
    name, glb, animdir, outdir = sys.argv[1:5]
    only = sys.argv[5].split(',') if len(sys.argv) > 5 else None
    spec = FIGHTERS[name]
    os.makedirs(outdir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm, meshes = load_target(glb)
    clips = {}
    for f in glob.glob(os.path.join(animdir, '*.fbx')):
        base = os.path.splitext(os.path.basename(f))[0].lower()
        clips[base.split('-', 1)[-1]] = f   # tolerate upload prefixes like 'cf5e6d70-'
    need = {c for c, _, _ in spec['frames'].values()}
    missing = need - set(clips)
    if missing: raise SystemExit(f'missing clips: {missing}')
    clips = {k: clips[k] for k in need}
    print('CLIPS', {k: os.path.basename(v) for k, v in clips.items()})
    srcs = {k: load_clip(v) for k, v in clips.items()}
    first = next(iter(srcs.values()))
    # height & hip scale
    vz = [(ob.matrix_world @ v.co).z for ob in meshes for v in ob.data.vertices]
    H = max(vz) - min(vz)
    k_hip = head_w(arm, M+'Hips', rest=True).z / head_w(first, M+'Hips', rest=True).z
    print('HEIGHT', round(H, 3), 'hip scale', round(k_hip, 3))
    add_gloves(arm, spec['glove'], spec['cuff'], H / 1.75)

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

    # mocap frames
    for key, (clip, fr, comp) in spec['frames'].items():
        if only and key not in only: continue
        retarget_frame(arm, srcs[clip], fr, comp, k_hip)
        # stand on the floor: lowest foot at z=0
        render(key)
    # IK fallback for everything the clips don't cover
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    tg = ik_setup(arm)
    kh = H / REF_H
    ank = min(head_w(arm, 'foot.' + s_, rest=True).z for s_ in 'LR')
    pose.calibrate_poles(arm, tg, scaled(poses.POSES['duck'], kh, ank))
    for key, p in poses.POSES.items():
        if key in spec['frames'] or (only and key not in only): continue
        pose.apply(arm, tg, scaled(p, kh, ank))
        render(key)


if __name__ == "__main__": main()
