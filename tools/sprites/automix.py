"""Auto-rig an unrigged Meshy mesh (A-pose, facing -Y, Z up) with a Mixamo-named skeleton,
so the shared move library retargets onto it exactly like a Meshy-rigged fighter.

Joints are measured from the mesh: torso/neck/head by horizontal slices, legs by slices per
side (crotch found where the legs split), arms by fitting a line through vertical slabs of each
arm and placing shoulder/elbow/wrist along it. The head bone points from the top of the neck to
the skull's centroid, so a Meshy head that tilts back (chin up) is straightened by the retarget.
Skin: Blender heat weights, voxel-proxy fallback, nearest-bone fill (same recipe as rig.py).
"""
import bpy, numpy as np
from mathutils import Vector
from mathutils.geometry import intersect_point_line

M = 'mixamorig:'


def _verts(ob):
    return np.array([ob.matrix_world @ v.co for v in ob.data.vertices])


def drop_long_faces(ob, frac=0.1):
    """Meshy exports can carry a stray sliver triangle spanning the body (e.g. foot to head). It is
    invisible at rest but stretches into a strand once posed. Delete faces with any edge > frac x height."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data)
    zs = [v.co.z for v in bm.verts]; lim = frac * (max(zs) - min(zs))
    bad = [f for f in bm.faces if any(e.calc_length() > lim for e in f.edges)]
    bmesh.ops.delete(bm, geom=bad, context='FACES')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    print('AUTORIG dropped stray long faces:', len(bad))


def fit_height(ob, H):
    """Scale to H metres, feet on the floor, centred."""
    drop_long_faces(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    v = _verts(ob); k = H / (v[:, 2].max() - v[:, 2].min()); z0 = v[:, 2].min()
    cx, cy = (v[:, 0].max() + v[:, 0].min()) / 2, (v[:, 1].max() + v[:, 1].min()) / 2
    for x in ob.data.vertices:
        c = x.co; x.co = Vector(((c.x - cx) * k, (c.y - cy) * k, (c.z - z0) * k))
    ob.data.update()


def joints(ob, H):
    v = _verts(ob)

    def sl(z, xlo=None, xhi=None, band=0.008):
        s = v[np.abs(v[:, 2] - z) < band * H]
        if xlo is not None: s = s[(s[:, 0] >= xlo) & (s[:, 0] <= xhi)]
        return s

    def cen(s, z):
        return Vector(((s[:, 0].min() + s[:, 0].max()) / 2, (s[:, 1].min() + s[:, 1].max()) / 2, z))

    J = {}
    # crotch: lowest height where the centre line (|x|<1.2% H) has mesh, scanning up from the knees
    crotch = None
    for f in np.arange(0.30, 0.60, 0.004):
        s = sl(f * H, -0.012 * H, 0.012 * H, 0.004)
        if len(s) > 3: crotch = f * H; break
    crotch = crotch or 0.47 * H
    hip_z = crotch + 0.035 * H
    # legs, per side
    for side, s_ in ((1, 'Left'), (-1, 'Right')):
        lo, hi = (0.004 * H, 0.2 * H) if side > 0 else (-0.2 * H, -0.004 * H)
        knee_z, ank_z = 0.285 * H, 0.05 * H
        J[s_ + 'UpLeg'] = cen(sl(crotch - 0.03 * H, lo, hi), hip_z)
        J[s_ + 'UpLeg'].x *= 0.9   # joint sits a little inside the thigh's centre
        J[s_ + 'Leg'] = cen(sl(knee_z, lo, hi), knee_z)
        J[s_ + 'Leg'].y -= 0.012 * H      # knee slightly forward so IK/heat bend the right way
        J[s_ + 'Foot'] = cen(sl(ank_z, lo, hi), ank_z)
        foot = v[(v[:, 2] < 0.06 * H) & (v[:, 0] * side > 0.004 * H) & (np.abs(v[:, 0]) < 0.2 * H)]
        toe_y = foot[:, 1].min()
        J[s_ + 'ToeBase'] = Vector((J[s_ + 'Foot'].x, J[s_ + 'Foot'].y + (toe_y - J[s_ + 'Foot'].y) * 0.65, 0.022 * H))
        J[s_ + 'Toe_End'] = Vector((J[s_ + 'Foot'].x, toe_y, 0.022 * H))
    # spine column
    tor = lambda f: cen(sl(f * H, -0.1 * H, 0.1 * H), f * H)
    J['Hips'] = Vector((0, (J['LeftUpLeg'].y + J['RightUpLeg'].y) / 2, hip_z + 0.012 * H))
    J['Spine'] = tor(0.575); J['Spine1'] = tor(0.64); J['Spine2'] = tor(0.705)
    J['Neck'] = tor(0.815); J['Head'] = cen(sl(0.865 * H, -0.06 * H, 0.06 * H), 0.865 * H)
    for k in ('Spine', 'Spine1', 'Spine2', 'Neck', 'Head'): J[k].x = 0.0
    top = v[v[:, 2] > 0.90 * H]
    skull = Vector(top.mean(0)); skull.x = 0
    d = (skull - J['Head']).normalized()
    J['HeadTop_End'] = J['Head'] + d * (H - J['Head'].z) / max(0.3, d.z)
    # arms: line through slab centroids between the shoulder and the hand
    for side, s_ in ((1, 'Left'), (-1, 'Right')):
        arm = v[(v[:, 0] * side > 0.0) & (v[:, 2] > 0.42 * H)]
        xmax = (arm[:, 0] * side).max()
        xs, ys, zs = [], [], []
        for x in np.arange(0.17 * H, xmax - 0.13 * H, 0.01 * H):
            s = arm[np.abs(arm[:, 0] * side - x) < 0.005 * H]
            if len(s) < 4: continue
            # keep the arm, not the torso, when they overlap: take the highest cluster's band
            xs.append(x); ys.append((s[:, 1].min() + s[:, 1].max()) / 2); zs.append((s[:, 2].min() + s[:, 2].max()) / 2)
        az, bz = np.polyfit(xs, zs, 1); ay, by = np.polyfit(xs, ys, 1)
        P = lambda x: Vector((side * x, ay * x + by, az * x + bz))
        sh_x = 0.108 * H
        tip = arm[np.argmax(arm[:, 0] * side)]
        dirv = (P(xmax) - P(sh_x)).normalized()
        sh = P(sh_x)
        wrist = Vector(tip) - dirv * 0.105 * H
        J[s_ + 'Arm'] = sh
        J[s_ + 'ForeArm'] = sh + (wrist - sh) * 0.474
        J[s_ + 'Hand'] = wrist
        J[s_ + 'HandTip'] = Vector(tip)
        J[s_ + 'Shoulder'] = Vector((side * 0.025 * H, J['Spine2'].y, sh.z + 0.02 * H))
    return J


PARENT = {'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck',
          'HeadTop_End': 'Head'}
for s_ in ('Left', 'Right'):
    PARENT.update({s_ + 'Shoulder': 'Spine2', s_ + 'Arm': s_ + 'Shoulder', s_ + 'ForeArm': s_ + 'Arm',
                   s_ + 'Hand': s_ + 'ForeArm', s_ + 'UpLeg': 'Hips', s_ + 'Leg': s_ + 'UpLeg',
                   s_ + 'Foot': s_ + 'Leg', s_ + 'ToeBase': s_ + 'Foot', s_ + 'Toe_End': s_ + 'ToeBase'})
TAIL = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End'}
for s_ in ('Left', 'Right'):
    TAIL.update({s_ + 'Shoulder': s_ + 'Arm', s_ + 'Arm': s_ + 'ForeArm', s_ + 'ForeArm': s_ + 'Hand',
                 s_ + 'Hand': s_ + 'HandTip', s_ + 'UpLeg': s_ + 'Leg', s_ + 'Leg': s_ + 'Foot',
                 s_ + 'Foot': s_ + 'ToeBase', s_ + 'ToeBase': s_ + 'Toe_End'})


def build(ob, H, name='fighter'):
    J = joints(ob, H)
    ad = bpy.data.armatures.new(name + '_arm'); arm = bpy.data.objects.new(name + '_rig', ad)
    bpy.context.scene.collection.objects.link(arm)
    for o in bpy.context.selected_objects: o.select_set(False)
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = ad.edit_bones
    order = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End']
    for s_ in ('Left', 'Right'):
        order += [s_ + n for n in ('Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End')]
    for n in order:
        b = eb.new(M + n); b.head = J[n]
        t = J.get(TAIL.get(n, ''), None)
        b.tail = t if t is not None and (t - J[n]).length > 1e-4 else J[n] + Vector((0, -0.03 * H, 0) if 'Toe' in n else (0, 0, 0.05 * H))
        if n in PARENT: b.parent = eb[M + PARENT[n]]
    bpy.ops.object.mode_set(mode='OBJECT')
    skin(ob, arm)
    return arm


def skin(ob, arm):
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    unw = sum(1 for vv in ob.data.vertices if not any(e.weight > 0.01 for e in vv.groups))
    if unw > len(ob.data.vertices) * 0.02:
        print('heat failed on', unw, '-> voxel proxy transfer')
        for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
        px = ob.copy(); px.data = ob.data.copy(); bpy.context.scene.collection.objects.link(px)
        for m in list(px.modifiers): px.modifiers.remove(m)
        px.parent = None
        rm = px.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.008
        for o in bpy.context.selected_objects: o.select_set(False)
        px.select_set(True); bpy.context.view_layer.objects.active = px
        bpy.ops.object.modifier_apply(modifier='rm')
        px.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        for g in px.vertex_groups: ob.vertex_groups.new(name=g.name)
        dt = ob.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = px; dt.use_vert_data = True
        dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
        dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
        for o in bpy.context.selected_objects: o.select_set(False)
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_move_to_index(modifier='dt', index=0)
        bpy.ops.object.modifier_apply(modifier='dt')
        bpy.data.objects.remove(px)
    bones = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones]
    for vv in ob.data.vertices:
        if any(e.weight > 0.01 for e in vv.groups): continue
        best = None
        for n, h, t in bones:
            p, fr = intersect_point_line(vv.co, h, t); fr = max(0, min(1, fr)); q = h + (t - h) * fr
            dd = (vv.co - q).length
            if best is None or dd < best[0]: best = (dd, n)
        g = ob.vertex_groups.get(best[1]) or ob.vertex_groups.new(name=best[1])
        g.add([vv.index], 1.0, 'REPLACE')
    # legs: no weight bleeding across the gap between them (below the hips only)
    hz = arm.data.bones[M + 'Hips'].head_local.z
    for vv in ob.data.vertices:
        if vv.co.z > hz: continue
        side = 'Left' if vv.co.x > 0 else 'Right'; other = 'Right' if side == 'Left' else 'Left'
        drop = [e.group for e in vv.groups if ob.vertex_groups[e.group].name in
                (M + other + 'UpLeg', M + other + 'Leg', M + other + 'Foot', M + other + 'ToeBase')]
        if not drop: continue
        for gi in drop: ob.vertex_groups[gi].remove([vv.index])
        tot = sum(e.weight for e in vv.groups)
        if tot <= 0.01: ob.vertex_groups[M + side + 'UpLeg'].add([vv.index], 1.0, 'REPLACE')
        else:
            for e in vv.groups: e.weight /= tot
    prune(ob, arm)
    print('AUTORIG unweighted after fill:', sum(1 for vv in ob.data.vertices if not any(e.weight > 0.01 for e in vv.groups)))


def prune(ob, arm, far=0.18, ratio=2.5):
    """Drop weights to bones that are far from a vertex (proxy transfer can tag a leg vertex with the
    hand, which drags a strand of mesh across the body when posed). Keep a weight only if the bone
    segment is within max(far m, ratio x the nearest weighted bone's distance)."""
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}
    names = {g.index: g.name for g in ob.vertex_groups}
    dropped = 0
    for vv in ob.data.vertices:
        ds = []
        for e in vv.groups:
            n = names[e.group]
            if n not in segs or e.weight <= 0: continue
            h, t = segs[n]; p, fr = intersect_point_line(vv.co, h, t); fr = max(0, min(1, fr))
            ds.append((e.group, (vv.co - (h + (t - h) * fr)).length))
        if len(ds) < 2: continue
        near = min(d for _, d in ds)
        bad = [g for g, d in ds if d > max(far, ratio * near)]
        if not bad or len(bad) == len(ds): continue
        for g in bad: ob.vertex_groups[g].remove([vv.index]); dropped += 1
        tot = sum(e.weight for e in vv.groups)
        for e in vv.groups: e.weight /= tot
    print('AUTORIG pruned far weights:', dropped)
