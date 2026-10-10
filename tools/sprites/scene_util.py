import bpy, math
from mathutils import Vector
def light_rig(scale=1.0):
    sc=bpy.context.scene
    w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True
    bg=w.node_tree.nodes['Background']; bg.inputs[0].default_value=(0.05,0.055,0.07,1); bg.inputs[1].default_value=1.0
    def L(name,typ,loc,energy,color,size=1.0,rot=None):
        d=bpy.data.lights.new(name,typ); d.energy=energy; d.color=color
        if typ=='AREA': d.size=size
        o=bpy.data.objects.new(name,d); sc.collection.objects.link(o); o.location=loc
        if rot: o.rotation_euler=rot
        else:
            dirv=(Vector((0,0,1))-Vector(loc)); o.rotation_euler=dirv.to_track_quat('-Z','Y').to_euler()
        return o
    L('key','AREA',(-2.5,-1.0,4.5),900,(1,0.96,0.9),2.0)     # overhead ring light, camera side
    L('rim','AREA',(2.5,2.0,2.5),500,(1.0,0.65,0.35),1.0)     # warm back rim
    L('fill','AREA',(-3.5,1.5,1.5),120,(0.55,0.7,1.0),2.0)     # cool fill
def sprite_camera(pitch_deg, ortho_w, res_w, res_h, center_fwd, center_up):
    sc=bpy.context.scene
    cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
    cam.data.type='ORTHO'; cam.data.ortho_scale=ortho_w*max(1,res_h/res_w)
    sc.render.resolution_x=res_w; sc.render.resolution_y=res_h
    a=math.radians(pitch_deg)
    # camera on character's right (-X armature), looking +X, pitched down
    d=10
    target=Vector((0,-center_fwd,center_up))
    cam.location=target+Vector((-d*math.cos(a),0,d*math.sin(a)))
    cam.rotation_euler=(math.radians(90)-a,0,math.radians(-90))
    return cam
