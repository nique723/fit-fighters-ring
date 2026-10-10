import bpy, math
from mathutils import Vector, Matrix, Euler

def P(f,l,u): return Vector((l,-f,u))   # fighter frame -> armature space

RPOLE=90
def setup_ik(arm):
    sc=bpy.context.scene
    tg={}
    for n in ['lh','rh','lp','rp','lf','rf','lk','rk']:
        e=bpy.data.objects.new(arm.name+'_'+n,None); sc.collection.objects.link(e); tg[n]=e
    pb=arm.pose.bones
    def ik(bone,target,pole,chain,angle):
        c=pb[bone].constraints.new('IK'); c.target=target; c.pole_target=pole; c.chain_count=chain; c.pole_angle=angle
        return c
    ik('forearm.L',tg['lh'],tg['lp'],2,math.radians(-90))
    ik('forearm.R',tg['rh'],tg['rp'],2,math.radians(RPOLE))
    ik('shin.L',tg['lf'],tg['lk'],2,math.radians(-90))
    ik('shin.R',tg['rf'],tg['rk'],2,math.radians(-90))
    for s_ in 'LR':
        e=bpy.data.objects.new(arm.name+'_fr'+s_,None); bpy.context.scene.collection.objects.link(e)
        bone=arm.data.bones['foot.'+s_]
        e.matrix_world=arm.matrix_world@bone.matrix_local
        e['rest']=[list(r) for r in e.matrix_world.to_3x3()]
        tg['fr'+s_]=e
        c=pb['foot.'+s_].constraints.new('COPY_ROTATION'); c.target=e
    for b in pb: b.rotation_mode='XYZ'
    arm['tg']=1
    return tg

def rot_world(arm, bone, R, pivot_from_rest=True):
    """apply extra world-ish (armature space) rotation R to bone about its head"""
    pb=arm.pose.bones[bone]
    M=pb.matrix.copy()
    loc=M.to_translation()
    newM=Matrix.Translation(loc)@R.to_4x4()@Matrix.Translation(-loc)@M
    pb.matrix=newM
    bpy.context.view_layer.update()

DEF=dict(drop=0.05, shift=(0,0,0), yaw_p=-38, yaw_c=-8, lean=6, side=0, head=0, head_side=0,
         lh=(0.30,0.06,1.47), rh=(0.16,-0.10,1.50), lp=(0.0,0.45,1.0), rp=(-0.25,-0.45,0.95),
         lf=(0.30,0.12,0.0), rf=(-0.28,-0.12,0.0), lk=(1.0,0.3,0.6), rk=(1.0,-0.3,0.6), heel=0)

def apply(arm, tg, pose):
    p=dict(DEF); p.update(pose)
    for b in arm.pose.bones:
        b.location=(0,0,0); b.rotation_euler=(0,0,0); b.rotation_quaternion=(1,0,0,0); b.scale=(1,1,1)
    bpy.context.view_layer.update()
    # pelvis: translate + yaw + lean
    sf,sl,su=p['shift']
    pb=arm.pose.bones['pelvis']
    M=pb.matrix.copy(); M.translation=M.translation+P(sf,sl,su-p['drop']); pb.matrix=M
    bpy.context.view_layer.update()
    Z=Vector((0,0,1)); LEFT=P(0,1,0); FWD=P(1,0,0)
    rot_world(arm,'pelvis',Matrix.Rotation(math.radians(p['yaw_p']),3,Z))
    lean=math.radians(p['lean']); side=math.radians(p['side']); yc=math.radians(p['yaw_c'])
    for b,frac in (('spine',0.5),('chest',0.5)):
        rot_world(arm,b,Matrix.Rotation(yc*frac,3,Z)@Matrix.Rotation(lean*frac,3,LEFT)@Matrix.Rotation(-side*frac,3,FWD))
    rot_world(arm,'neck',Matrix.Rotation(math.radians(-p['lean']*0.5+p['head']*0.5),3,LEFT))
    rot_world(arm,'head',Matrix.Rotation(math.radians(p['head']*0.5),3,LEFT)@Matrix.Rotation(math.radians(-p['head_side']),3,FWD)@Matrix.Rotation(math.radians(-p['yaw_p']*0.35),3,Z))
    for s_,key,yaw in (('L','lf',p.get('lyaw',-20)),('R','rf',p.get('ryaw',-55))):
        e=tg['fr'+s_]; R0=Matrix(e['rest'])
        e.rotation_euler=(Matrix.Rotation(math.radians(yaw),3,Z)@R0).to_euler()
        e.location=tg[key].location if False else e.location
    for k in ['lh','rh','lp','rp','lf','rf','lk','rk']:
        f,l,u=p[k]; tg[k].location=arm.matrix_world@P(f,l,u)
    bpy.context.view_layer.update()
