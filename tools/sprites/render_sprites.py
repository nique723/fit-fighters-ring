import bpy, sys, math, json, os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import rig, pose, scene_util, poses
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
name,fbx,outdir=sys.argv[1],sys.argv[2],sys.argv[3]
only=sys.argv[4].split(',') if len(sys.argv)>4 else None
os.makedirs(outdir,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
ob,arm,J=rig.load(name,fbx)
if name=='crimson': rig.add_gloves(arm)
tg=pose.setup_ik(arm)
scene_util.light_rig()
RW,RH=480,504
cam=scene_util.sprite_camera(8, 2.0, RW, RH, 0.2, 1.0)
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=int(os.environ.get('SAMPLES','32')); sc.render.film_transparent=True
sc.cycles.use_denoising=True
bpy.context.view_layer.update()
a=world_to_camera_view(sc,cam,Vector((0,0,0)))
json.dump({'anchorX':a.x,'anchorY':1-a.y,'w':RW,'h':RH,'pxPerM':RW/2.0},open(outdir+'/anchor.json','w'))
for k,v in poses.POSES.items():
    if only and k not in only: continue
    pose.apply(arm,tg,v)
    sc.render.filepath=f'{outdir}/{k}.png'; bpy.ops.render.render(write_still=True)
