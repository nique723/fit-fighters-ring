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
import pose, scene_util, poses, automix
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
    'jab0': ('lead_jab', 7, 0.6), 'jab1': ('lead_jab', 10, 0.6),
    'jab2': ('lead_jab', 13, 0.6), 'jab3': ('lead_jab', 16, 0.6),
    'cross0': ('jab_cross', 17, 0.6), 'cross1': ('jab_cross', 19, 0.6),
    'cross2': ('jab_cross', 21, 0.6), 'cross3': ('jab_cross', 23, 0.6),
    'hook0': ('hook', 19, 0.75), 'hook1': ('hook', 34, 0.75),
    'hook2': ('hook', 37, 0.75), 'hook3': ('hook', 43, 0.75),
    'body0': ('boxing_3', 11, 0.6), 'body1': ('boxing_3', 15, 0.6),
    'body2': ('boxing_3', 19, 0.6), 'body3': ('boxing_3', 23, 0.6),
    'slip': ('dodging', 17, 1.0), 'duck': ('dodging', 45, 1.0),
    # lead uppercut: dip, rise, drive, top
    'upper0': ('uppercut_jab', 16, 0.7), 'upper1': ('uppercut_jab', 22, 0.7),
    'upper2': ('uppercut_jab', 24, 0.7), 'upper3': ('uppercut_jab', 26, 0.7),
    # shell block: gloves come up, full cover
    'block0': ('right_block', 10, 1.0), 'block1': ('right_block', 16, 1.0),
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
# Game frames that still come from IK (no clip yet). Empty: every move is mocap now.
IK_ONLY = []

# height: only needed for unrigged meshes (auto-rigged by automix.py); rigged GLBs keep their size.
# glove_model: textured glove (gloves/*.glb, a RIGHT glove: cuff -Z, fist +Z, palm -Y, thumb +X).
# glove_colors: recolor its leather {'main': rgb for the black panels, 'accent': rgb for the gold}; None = as built.
#   optional 'main_metal' / 'accent_metal' (0-1) set how metallic each panel is.
# glove/cuff: colours for the old primitive gloves, used only when glove_model is absent.
FIGHTERS = {
    # gold body (metallic) + black thumb: black gloves disappear against his navy hoodie at sprite size
    'kamarian': dict(glove_model='gloves/fight_glove.glb',
                     glove_colors={'main': (0.95, 0.68, 0.18), 'accent': (0.03, 0.03, 0.03), 'main_metal': 1.0, 'accent_metal': 0.0},
                     glove=(0.62, 0.40, 0.03, 1), cuff=(0.03, 0.03, 0.035, 1), moves={}),
    # heavyweight: white body + metallic blue thumb (the third colourway)
    'malachi': dict(height=1.88, glove_model='gloves/fight_glove.glb',
                    glove_colors={'main': (0.86, 0.86, 0.88), 'accent': (0.04, 0.16, 0.62), 'main_metal': 0.0, 'accent_metal': 1.0},
                    glove=(0.9, 0.9, 0.9, 1), cuff=(0.05, 0.1, 0.5, 1), moves={}),
    # green body + gold thumb: black gloves would vanish against his black top with the guard up.
    # Model: Meshy-rigged GLB (height ignored; rigged models keep their own size)
    'joe': dict(height=1.78, glove_model='gloves/fight_glove.glb',
                glove_colors={'main': (0.04, 0.40, 0.17), 'accent': (0.85, 0.62, 0.16), 'main_metal': 0.0, 'accent_metal': 1.0},
                glove=(0.05, 0.4, 0.17, 1), cuff=(0.03, 0.03, 0.03, 1), moves={}),
    # orange body + gold thumb: pops against his navy tee and dark pants, echoes the gold shirt print
    'kd': dict(height=1.75, glove_model='gloves/fight_glove.glb',
               glove_colors={'main': (0.92, 0.36, 0.05), 'accent': (0.85, 0.62, 0.16), 'main_metal': 0.0, 'accent_metal': 1.0},
               glove=(0.92, 0.36, 0.05, 1), cuff=(0.03, 0.03, 0.03, 1), moves={}),
    'lamar': dict(height=1.80, glove_model='gloves/fight_glove.glb',
                  glove_colors={'main': (0.50, 0.025, 0.035), 'accent': (0.03, 0.03, 0.03)},
                  glove=(0.42, 0.015, 0.025, 1), cuff=(0.02, 0.02, 0.02, 1), moves={}),
    # pink body + black thumb: matches the pink trim on her tank and her black training gloves.
    # Meshy-rigged A-pose at 1.56 m in the file; fit=True scales it to her real 5'5".
    'kelly': dict(height=1.65, fit=True, glove_model='gloves/fight_glove.glb',
                  glove_colors={'main': (0.85, 0.16, 0.42), 'accent': (0.03, 0.03, 0.03), 'main_metal': 0.0, 'accent_metal': 0.0},
                  glove=(0.85, 0.16, 0.42, 1), cuff=(0.03, 0.03, 0.03, 1), moves={}),
    # purple body + rose-gold thumb: pops on her white tank, picks up her pink shoes/wrap, and never
    # matches Kelly's pink in the same ring. Meshy-rigged A-pose at 1.61 m; fit=True -> her real 5'7".
    'tiffany': dict(height=1.70, fit=True, glove_model='gloves/fight_glove.glb',
                    glove_colors={'main': (0.40, 0.10, 0.60), 'accent': (0.95, 0.55, 0.62), 'main_metal': 0.0, 'accent_metal': 1.0},
                    glove=(0.40, 0.10, 0.60, 1), cuff=(0.95, 0.55, 0.62, 1), moves={}),
    # teal body + metallic gold thumb: matches his mint boxing shoes and the gold logo on his gray tank.
    # Meshy-rigged (arms-down photos): pass the rigged GLB; height is only a note here.
    'lj': dict(height=1.83, glove_model='gloves/fight_glove.glb',
               glove_colors={'main': (0.05, 0.50, 0.46), 'accent': (0.85, 0.62, 0.16), 'main_metal': 0.0, 'accent_metal': 1.0},
               glove=(0.05, 0.50, 0.46, 1), cuff=(0.03, 0.03, 0.03, 1), moves={}),
    # black body + metallic red thumb: pops against his white tee, echoes the red/black shirt logo.
    # Meshy-rigged (arms-down photos); hand_drop 0.6: his hands rested on his jogger pockets, so more
    # finger bits are fused to the pants than LJ's (default 0.95 left a fragment at the right hip)
    'jersey': dict(height=1.83, hand_drop=0.6, glove_model='gloves/fight_glove.glb',
                   glove_colors={'main': (0.03, 0.03, 0.035), 'accent': (0.78, 0.05, 0.06), 'main_metal': 0.0, 'accent_metal': 1.0},
                   glove=(0.03, 0.03, 0.035, 1), cuff=(0.78, 0.05, 0.06, 1), moves={}),
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


# Meshy's own rigging (2026 rig: 24 bones, no fingers) -> Mixamo names. Its spine counts down from
# the hips (Spine02 is lowest). Use this rig when the photos were shot arms-down: automix needs a
# wide A-pose to find the arms. Renaming a bone renames its vertex group too, so skinning holds.
MESHY_BONES = {'Hips': 'Hips', 'Spine02': 'Spine', 'Spine01': 'Spine1', 'Spine': 'Spine2', 'neck': 'Neck',
               'Head': 'Head', 'head_end': 'HeadTop_End'}
for _s in ('Left', 'Right'):
    MESHY_BONES.update({f'{_s}{b}': f'{_s}{b}' for b in
                        ('Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase')})


def mixamo_names(arm):
    """Rename a Meshy-rigged armature's bones to mixamorig:* so the move library finds them."""
    if any(b.name.startswith(M) for b in arm.data.bones): return
    n = 0
    for b in list(arm.data.bones):
        if b.name in MESHY_BONES: b.name = M + MESHY_BONES[b.name]; n += 1
    print('MESHY rig renamed bones:', n)


def fix_hand_weights(arm, meshes, radius=0.07, reach=0.22, drop_at=0.95):
    """An arms-down Meshy mesh is skinned with the hands resting on the hips, so some hip/shirt
    vertices get forearm/hand weight. Once the guard comes up they follow the glove and stretch into
    strands. Strip forearm/hand weight from any vertex farther than `radius` (m) from that arm's
    elbow-to-fingertip segment, and give it back to the bones it already had (or the nearest body bone).
    Meshy's hand bone is short, so the segment runs from the elbow through the wrist and on `reach` m
    along the forearm line to cover the fingers. Vertices whose weight is at least `drop_at` stray hand
    are deleted (finger bits fused to the hip or a pocket); FIGHTERS[id]['hand_drop'] overrides it."""
    from mathutils.geometry import intersect_point_line
    mw = arm.matrix_world
    segs = {}
    for s_ in ('Left', 'Right'):
        fa = arm.data.bones[M + s_ + 'ForeArm']; hb = arm.data.bones[M + s_ + 'Hand']
        elbow, wrist = mw @ fa.head_local, mw @ hb.head_local
        segs[s_] = (elbow, wrist + (wrist - elbow).normalized() * reach)
    body = [b for b in arm.data.bones if not any(k in b.name for k in ('Arm', 'Hand', 'Shoulder'))]
    for ob in meshes:
        vg = ob.vertex_groups; names = {g.index: g.name for g in vg}
        limb = {g.index: s_ for g in vg for s_ in ('Left', 'Right')
                if g.name in (M + s_ + 'ForeArm', M + s_ + 'Hand')}
        fixed, drop = 0, []
        for v in ob.data.vertices:
            hits = [(g.group, g.weight) for g in v.groups if g.group in limb and g.weight > 0]
            if not hits: continue
            p = ob.matrix_world @ v.co
            far = []
            for gi, w in hits:
                a_, b_ = segs[limb[gi]]
                q, t = intersect_point_line(p, a_, b_)
                q = a_ if t < 0 else b_ if t > 1 else q
                if (p - q).length > radius: far.append((gi, w))
            if not far: continue
            total = sum(g.weight for g in v.groups) or 1.0
            if sum(w for _, w in far) / total >= drop_at:
                drop.append(v.index)   # all hand: a stray finger/palm bit (the glove replaces the hand)
                continue
            for gi, _ in far: vg[gi].remove([v.index])
            rest = [g for g in v.groups if g.weight > 0]
            if not rest:   # nothing left: hand it to the nearest body bone
                nb = min(body, key=lambda bb: (p - mw @ ((bb.head_local + bb.tail_local) / 2)).length)
                g = vg.get(nb.name) or vg.new(name=nb.name)
                g.add([v.index], 1.0, 'REPLACE')
            fixed += 1
        if drop:
            import bmesh
            bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.verts[i] for i in drop], context='VERTS')
            bm.to_mesh(ob.data); bm.free(); ob.data.update()
        print('MESHY rig dropped stray hand verts:', len(drop))
        print('MESHY rig stripped stray hand/forearm weight from verts:', fixed)


def load_target(glb, height=None, name='fighter', hand_drop=0.95, fit=False):
    bpy.ops.import_scene.gltf(filepath=glb)
    rigged = bool([o for o in bpy.data.objects if o.type == 'ARMATURE'])
    if not rigged:
        if not height: raise SystemExit('unrigged mesh: set height in FIGHTERS')
        ob = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
        automix.fit_height(ob, height)
        automix.build(ob, height, name)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    if any(abs(s - 1) > 1e-4 for s in arm.scale):
        # Meshy rigs import at 0.01 scale (cm armature); set_world_rot assumes a unit-scale armature,
        # otherwise every posed bone comes out 100x. Bake the scale into armature + skinned meshes.
        for o in bpy.context.selected_objects: o.select_set(False)
        for o in [arm] + [c for c in arm.children_recursive if c.type == 'MESH']: o.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        print('MESHY rig scale applied')
    if rigged and fit and height:
        # rigged models keep their file size; fit=True scales the rig + skin to the real height
        bpy.context.view_layer.update()
        sk = [o for o in arm.children_recursive if o.type == 'MESH']
        zs = [(o.matrix_world @ v.co).z for o in sk for v in o.data.vertices]
        k = height / (max(zs) - min(zs))
        arm.scale = (k, k, k)
        for o in bpy.context.selected_objects: o.select_set(False)
        for o in [arm] + sk: o.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        print('RIG scaled to height', height, 'x', round(k, 3))
    mixamo_names(arm)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    if rigged: fix_hand_weights(arm, meshes, drop_at=hand_drop)   # Meshy-rigged (arms-down) models only; automix rigs are A-pose
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
        tb = arm.data.bones.get(M + s + 'HandThumb1')
        # thumb side: the thumb bone if rigged, else forward (-Y) in an A-pose
        th = (hb.matrix_local.inverted() @ tb.head_local) if tb else (hb.matrix_local.inverted().to_3x3() @ Vector((0, -1, 0)))
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


def recolor_glove(mat, colors):
    """Swap the glove's black leather -> main and gold -> accent, keeping the leather's shading."""
    img = next(n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and
               any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links))
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    rgb = px[:, :3]; mx = rgb.max(1); mn = rgb.min(1); sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    gold = (sat > 0.35) & (mx > 0.15) & (r >= g) & (g > b * 1.2)
    black = (mx < 0.28) & ~gold
    for mask, key in ((black, 'main'), (gold, 'accent')):
        if not mask.any(): continue
        v = mx[mask]; shade = np.clip(v / max(1e-4, float(np.median(v))), 0.35, 2.2)[:, None]
        rgb[mask] = np.clip(np.array(colors[key], dtype=np.float32)[None, :] * shade, 0, 1)
    px[:, :3] = rgb
    new = img.copy(); new.pixels = px.ravel().tolist(); new.pack()
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image == img: n.image = new
    # metallic lives in the blue channel of the glTF metallic-roughness map (same UVs)
    mr = next((n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image != new and
               any(l.to_socket.name == 'Color' for l in n.outputs[0].links)), None)
    if mr is not None and ('main_metal' in colors or 'accent_metal' in colors) and tuple(mr.image.size) == tuple(img.size):
        q = np.array(mr.image.pixels[:], dtype=np.float32).reshape(-1, 4)
        if 'main_metal' in colors: q[black, 2] = colors['main_metal']
        if 'accent_metal' in colors: q[gold, 2] = colors['accent_metal']
        m2 = mr.image.copy(); m2.colorspace_settings.name = 'Non-Color'; m2.pixels = q.ravel().tolist(); m2.pack(); mr.image = m2
    print('GLOVE recolor: black px', int(black.sum()), 'gold px', int(gold.sum()))


def add_model_gloves(arm, meshes, spec, H):
    """Attach the textured glove to each hand bone: fist along the bone, thumb toward the thumb
    (or forward in an A-pose), left glove mirrored. The hand mesh inside is removed."""
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, spec['glove_model']))
    src = bpy.context.selected_objects[0]
    if spec.get('glove_colors'):
        recolor_glove(src.data.materials[0], spec['glove_colors'])
    vz = [v.co.z for v in src.data.vertices]; glen = max(vz) - min(vz)
    k = H / 1.75; s_ = 0.31 * k / glen
    wrist = Vector((0, 0, min(vz) + 0.62 * glen))        # wrist sits at the top of the taped cuff
    for side in ('Left', 'Right'):
        hb = arm.data.bones[M + side + 'Hand']; Bm = hb.matrix_local.to_3x3()
        A = Vector((0, 1, 0))
        tb = arm.data.bones.get(M + side + 'HandThumb1')
        T = (Bm.inverted() @ (tb.head_local - hb.head_local)) if tb else (Bm.inverted() @ Vector((0, -1, 0)))
        T = (T - A * T.dot(A)).normalized(); C = A.cross(T)
        if side == 'Right': R = Matrix((T, C, A)).transposed(); S = Matrix.Diagonal((1, 1, 1))
        else: R = Matrix((-T, -C, A)).transposed(); S = Matrix.Diagonal((-1, 1, 1))
        L = R @ S * s_
        o = src.copy(); o.data = src.data; bpy.context.scene.collection.objects.link(o)
        o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = M + side + 'Hand'
        o.matrix_parent_inverse.identity()
        o.matrix_basis = Matrix.Translation((0, -hb.length, 0)) @ Matrix.Translation(-(L @ wrist)) @ L.to_4x4()
    bpy.data.objects.remove(src)
    # the bare hand would poke through the glove: delete vertices that mostly follow a hand bone
    import bmesh
    for ob in meshes:
        gi = {g.index for g in ob.vertex_groups if 'Hand' in g.name}
        bm = bmesh.new(); bm.from_mesh(ob.data); dl = bm.verts.layers.deform.active
        if dl is None: bm.free(); continue
        kill = [v for v in bm.verts if sum(w for g, w in v[dl].items() if g in gi) > 0.2]
        bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(ob.data); bm.free(); ob.data.update()
        print('GLOVE removed hand verts:', len(kill))


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


def render_hero(arm, meshes, H, k_hip, outdir):
    """Full-body portrait for menus: guard-up stance, front three-quarter from the lead side,
    perspective lens, ring lighting with a warm key and a red rim. 720x1080, transparent."""
    retarget_frame(arm, clip('jab_cross'), 55, 1.0, k_hip)
    floor_fix(meshes, arm)
    sc = bpy.context.scene
    cam = bpy.data.objects.new('hero_cam', bpy.data.cameras.new('hero_cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 70
    sc.render.resolution_x, sc.render.resolution_y = 720, 1080
    target = Vector((0.05, 0.0, H * 0.52))
    # fighter faces -Y, lead (left) side is +X: camera in front, swung toward the lead shoulder
    yaw = math.radians(16); dist = H * 2.45
    cam.location = target + Vector((math.sin(yaw) * dist, -math.cos(yaw) * dist, H * 0.06))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    def light(name, loc, energy, color, size):
        d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.color = color; d.size = size
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, H * 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    light('hero_key', (2.2, -3.0, 3.4), 900, (1.0, 0.94, 0.86), 2.5)        # warm overhead key, front
    light('hero_rim_r', (-2.4, 2.2, 2.6), 650, (1.0, 0.25, 0.22), 1.2)      # red rim, behind
    light('hero_rim_b', (2.6, 2.4, 2.2), 380, (0.45, 0.6, 1.0), 1.2)       # blue rim, behind other side
    light('hero_fill', (-3.0, -2.5, 1.2), 110, (0.7, 0.8, 1.0), 3.0)       # cool fill
    sc.render.filepath = f'{outdir}/hero.png'; bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[1:]
    probe = None
    hero = '--hero' in args
    if hero: args = [a for a in args if a != '--hero']
    if '--probe' in args:
        i = args.index('--probe'); probe = (args[i + 1], [int(x) for x in args[i + 2].split(',')]); args = args[:i]
    name, glb, outdir = args[:3]
    only = args[3].split(',') if len(args) > 3 else None
    spec = FIGHTERS[name]
    moves = dict(MOVES); moves.update(spec.get('moves', {}))
    os.makedirs(outdir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm, meshes = load_target(glb, spec.get('height'), name, spec.get('hand_drop', 0.95), spec.get('fit', False))
    vz = [(ob.matrix_world @ v.co).z for ob in meshes for v in ob.data.vertices]
    H = max(vz) - min(vz)
    ref = clip('jab_cross')
    k_hip = head_w(arm, M + 'Hips', rest=True).z / ref.rest_head(M + 'Hips').z
    print('HEIGHT', round(H, 3))
    if spec.get('glove_model'): add_model_gloves(arm, meshes, spec, H)
    else: add_gloves(arm, spec['glove'], spec['cuff'], H / 1.75)
    meshes = [o for o in mats_meshes() if o.parent_type != 'BONE']   # floor check: body only

    scene_util.light_rig()
    # 240 px/m like every fighter. Canvas grows with height so a raised glove (victory) fits:
    # 1.68 m -> the standard 480x504; taller fighters get a taller canvas and their own anchor.
    RW = 480
    RH = max(504, int(math.ceil((1.27 * H + 0.1) * 240 / 8) * 8))
    cam = scene_util.sprite_camera(8, 2.0, RW, RH, 0.2, RH / 240 / 2 - 0.05)
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
        # floor-frame slide scales with height: a 6'2" body lying down is longer
        retarget_frame(arm, clip(cname), fr, comp, k_hip, fwd * H / 1.68)
        floor_fix(meshes, arm)
        render(key)

    if hero:
        render_hero(arm, meshes, H, k_hip, outdir)
        return
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
