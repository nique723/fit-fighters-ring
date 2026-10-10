import bpy, numpy as np, os, math
from mathutils import Vector

# normalized joint guesses: (f height fraction, |x| guess at native scale)
SPEC = {
 'crimson': dict(height=1.85, hipx=0.055, kneex=0.068, anklex=0.077, sh=(0.79,0.105), el=(0.60,0.155), wr=(0.505,0.19), tip=(0.43,0.21)),
 'white':   dict(height=1.83, hipx=0.06,  kneex=0.09,  anklex=0.112, sh=(0.79,0.105), el=(0.60,0.137), wr=(0.505,0.15), tip=(0.43,0.17)),
}

def load(name, fbx, gloves=None):
    bpy.ops.import_scene.fbx(filepath=fbx)
    ob=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent is None and not o.get('done')][-1]
    ob.name=name; ob['done']=1
    d=os.path.dirname(fbx); base=os.path.splitext(os.path.basename(fbx))[0]
    mat=ob.data.materials[0]; mat.name=name+'_mat'; mat.use_nodes=True
    nt=mat.node_tree; nt.nodes.clear()
    bsdf=nt.nodes.new('ShaderNodeBsdfPrincipled'); out=nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bsdf.outputs[0],out.inputs[0])
    tex=nt.nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(os.path.join(d,base+'.png'))
    nt.links.new(tex.outputs[0],bsdf.inputs['Base Color'])
    rt=nt.nodes.new('ShaderNodeTexImage'); rt.image=bpy.data.images.load(os.path.join(d,base+'_roughness.png')); rt.image.colorspace_settings.name='Non-Color'
    nt.links.new(rt.outputs[0],bsdf.inputs['Roughness'])
    nm=nt.nodes.new('ShaderNodeTexImage'); nm.image=bpy.data.images.load(os.path.join(d,base+'_normal.png')); nm.image.colorspace_settings.name='Non-Color'
    nmap=nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs[0],nmap.inputs['Color']); nt.links.new(nmap.outputs[0],bsdf.inputs['Normal'])
    # apply transforms, scale to height, feet at 0
    bpy.context.view_layer.objects.active=ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    v=np.array([x.co[:] for x in ob.data.vertices])
    sp=SPEC[name]; H0=v[:,2].max()-v[:,2].min(); k=sp['height']/H0
    z0=v[:,2].min()
    for x in ob.data.vertices:
        c=x.co; x.co=Vector((c.x*k,c.y*k,(c.z-z0)*k))
    v=np.array([x.co[:] for x in ob.data.vertices])
    H=sp['height']
    def cen(f, xg, side, w=0.045):
        z=f*H; s=v[np.abs(v[:,2]-z)<0.012*H]
        s=s[np.abs(s[:,0]-side*xg*k)<w*k] if xg is not None else s[np.abs(s[:,0])<w*k]
        if len(s)==0: return Vector((side*(xg or 0)*k,0,z))
        return Vector(((s[:,0].min()+s[:,0].max())/2,(s[:,1].min()+s[:,1].max())/2,z))
    J={}
    J['pelvis']=cen(0.50,None,1,0.05); J['spine']=cen(0.60,None,1,0.05); J['chest']=cen(0.71,None,1,0.05)
    J['neck']=cen(0.835,None,1,0.03); J['head']=cen(0.875,None,1,0.04); J['top']=Vector((J['head'].x,J['head'].y,H))
    for s,side in (('L',1),('R',-1)):
        J['clav'+s]=Vector((side*0.025*H,J['chest'].y,0.80*H))
        J['sh'+s]=cen(sp['sh'][0],sp['sh'][1],side,0.03)
        J['el'+s]=cen(sp['el'][0],sp['el'][1],side,0.035)
        J['wr'+s]=cen(sp['wr'][0],sp['wr'][1],side,0.035)
        J['tip'+s]=cen(sp['tip'][0],sp['tip'][1],side,0.035)
        J['hip'+s]=cen(0.47,sp['hipx'],side,0.03); J['hip'+s].z=0.49*H
        J['knee'+s]=cen(0.28,sp['kneex'],side,0.03)
        J['ank'+s]=cen(0.05,sp['anklex'],side,0.03)
        J['toe'+s]=Vector((J['ank'+s].x, v[:,1].min()*0.9, 0.01*H))
    # armature
    ad=bpy.data.armatures.new(name+'_arm'); arm=bpy.data.objects.new(name+'_rig',ad)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm
    for o in bpy.context.selected_objects: o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb=ad.edit_bones
    def B(n,h,t,parent=None,conn=False,roll_axis=None):
        b=eb.new(n); b.head=h; b.tail=t
        if parent: b.parent=eb[parent]; b.use_connect=conn
        if roll_axis is not None: b.align_roll(roll_axis)
        return b
    B('root',Vector((0,0,0)),Vector((0,0,0.2)))
    B('pelvis',J['pelvis'],J['spine'],'root')
    B('spine',J['spine'],J['chest'],'pelvis',True)
    B('chest',J['chest'],J['neck'],'spine',True)
    B('neck',J['neck'],J['head'],'chest',True)
    B('head',J['head'],J['top'],'neck',True)
    for s in 'LR':
        B('clav.'+s,J['clav'+s],J['sh'+s],'chest',False,Vector((0,-1,0)))
        B('upper_arm.'+s,J['sh'+s],J['el'+s],'clav.'+s,True,Vector((0,1,0)))
        B('forearm.'+s,J['el'+s],J['wr'+s],'upper_arm.'+s,True,Vector((0,1,0)))
        B('hand.'+s,J['wr'+s],J['tip'+s],'forearm.'+s,True,Vector((0,1,0)))
        B('thigh.'+s,J['hip'+s],J['knee'+s],'pelvis',False,Vector((0,-1,0)))
        B('shin.'+s,J['knee'+s],J['ank'+s],'thigh.'+s,True,Vector((0,-1,0)))
        B('foot.'+s,J['ank'+s],J['toe'+s],'shin.'+s,True,Vector((0,0,1)))
    bpy.ops.object.mode_set(mode='OBJECT')
    # skin
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    unw=sum(1 for vv in ob.data.vertices if not any(e.weight>0.01 for e in vv.groups))
    if unw>0:
        print('heat failed on',unw,'-> proxy transfer')
        for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
        px=ob.copy(); px.data=ob.data.copy(); bpy.context.scene.collection.objects.link(px)
        for m in list(px.modifiers): px.modifiers.remove(m)
        px.parent=None
        rm=px.modifiers.new('rm','REMESH'); rm.mode='VOXEL'; rm.voxel_size=0.008
        for o in bpy.context.selected_objects: o.select_set(False)
        px.select_set(True); bpy.context.view_layer.objects.active=px
        bpy.ops.object.modifier_apply(modifier='rm')
        px.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        for g in px.vertex_groups: ob.vertex_groups.new(name=g.name)
        dt=ob.modifiers.new('dt','DATA_TRANSFER'); dt.object=px; dt.use_vert_data=True
        dt.data_types_verts={'VGROUP_WEIGHTS'}; dt.vert_mapping='POLYINTERP_NEAREST'
        dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
        for o in bpy.context.selected_objects: o.select_set(False)
        ob.select_set(True); bpy.context.view_layer.objects.active=ob
        bpy.ops.object.modifier_move_to_index(modifier='dt',index=0)
        bpy.ops.object.modifier_apply(modifier='dt')
        bpy.data.objects.remove(px)
    empty=[g.name for g in ob.vertex_groups if not any(g.index==e.group for vv in ob.data.vertices[:0] for e in vv.groups)]
    # count unweighted verts
    # fix any leftover unweighted verts: nearest bone segment
    bones=[(b.name,b.head_local.copy(),b.tail_local.copy()) for b in arm.data.bones if b.name!='root']
    from mathutils.geometry import intersect_point_line
    for vv in ob.data.vertices:
        if any(e.weight>0.01 for e in vv.groups): continue
        best=None
        for n,h,t in bones:
            p,fr=intersect_point_line(vv.co,h,t); fr=max(0,min(1,fr)); q=h+(t-h)*fr
            dd=(vv.co-q).length
            if best is None or dd<best[0]: best=(dd,n)
        g=ob.vertex_groups.get(best[1]) or ob.vertex_groups.new(name=best[1])
        g.add([vv.index],1.0,'REPLACE')
    unw=sum(1 for vv in ob.data.vertices if not any(e.weight>0.01 for e in vv.groups))
    print('RIG',name,'unweighted verts',unw,'of',len(ob.data.vertices))
    return ob, arm, J

def add_gloves(arm, color=(0.32,0.012,0.018,1), cuff=(0.02,0.02,0.02,1)):
    import bmesh
    mat=bpy.data.materials.new('glove'); mat.use_nodes=True
    b=mat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value=color
    b.inputs['Roughness'].default_value=0.32
    try: b.inputs['Coat Weight'].default_value=0.5
    except Exception: pass
    mc=bpy.data.materials.new('cuff'); mc.use_nodes=True
    mc.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=cuff
    mc.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=0.5
    for s in 'LR':
        hb=arm.data.bones['hand.'+s]; L=hb.length
        parts=[]
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1)
        g=bpy.context.active_object; g.scale=(0.06,0.12,0.066); g.location=(0,L*0.45,0)
        g.data.materials.append(mat); parts.append(g)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1)
        t=bpy.context.active_object; t.scale=(0.03,0.07,0.032)
        t.location=((0.05 if s=='L' else -0.05),L*0.18,0.02); t.data.materials.append(mat); parts.append(t)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=1,depth=1)
        c=bpy.context.active_object; c.scale=(0.056,0.056,0.12); c.rotation_euler=(math.radians(90),0,0); c.location=(0,-L*0.25,0)
        c.data.materials.append(mc); parts.append(c)
        for p in parts:
            bpy.ops.object.shade_smooth()
            mw=p.matrix_basis.copy()
            p.parent=arm; p.parent_type='BONE'; p.parent_bone='hand.'+s
            # bone-parent space origin is bone tail; offset back to head
            p.matrix_parent_inverse.identity()
            from mathutils import Matrix
            p.matrix_basis=Matrix.Translation((0,-L,0))@mw
