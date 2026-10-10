import bpy, math, random, sys, json, os
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
T=os.path.join(os.path.dirname(os.path.abspath(__file__)),'tex')+'/'
RW=int(os.environ.get('RW','960')); RH=RW*9//16
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene; col=sc.collection
rnd=random.Random(7)
def mat(name,color,rough=0.6,emit=None,estr=0,img=None,metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value=(*color,1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    if img:
        t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(T+img); m.node_tree.links.new(t.outputs[0],b.inputs['Base Color'])
        if emit=='img':
            m.node_tree.links.new(t.outputs[0],b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value=estr
    elif emit:
        b.inputs['Emission Color'].default_value=(*emit,1); b.inputs['Emission Strength'].default_value=estr
    return m
def box(name,loc,size,m,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc,rotation=rot); o=bpy.context.active_object; o.name=name; o.scale=size; o.data.materials.append(m); return o
def cyl(name,a,b,r,m,verts=16):
    a=Vector(a); b=Vector(b); d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.active_object; o.name=name; o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); o.data.materials.append(m); bpy.ops.object.shade_smooth(); return o
def plane_img(name,loc,w,h,img,rot,estr=0.0):
    bpy.ops.mesh.primitive_plane_add(size=1,location=loc,rotation=rot); o=bpy.context.active_object; o.scale=(w,h,1)
    o.data.materials.append(mat(name,(1,1,1),0.7,'img' if estr else None,estr,img)); return o
S=3.05  # half ring
# ring canvas + platform
plane_img('canvas',(0,0,0),2*S+0.6,2*S+0.6,'canvas.png',(0,0,0))
box('platform',(0,0,-0.62),(2*S+0.6,2*S+0.6,1.2),mat('apron',(0.03,0.04,0.15),0.8))
# apron skirt facing camera (near side) + far
for y,rz in ((-S-0.31,0),(S+0.31,math.pi)):
    plane_img('skirt',(0,y-0.002*(1 if y<0 else -1),-0.62),2*S+0.6,1.2,'apron.png',(math.radians(90),0,rz),0.6)
# posts + turnbuckle pads
post=mat('post',(0.8,0.8,0.85),0.25,metal=1.0)
pads={(-1,1):(0.7,0.02,0.03),(1,1):(0.02,0.08,0.6),(-1,-1):(0.85,0.85,0.85),(1,-1):(0.85,0.85,0.85)}
for (sx,sy),pc in pads.items():
    if sy<0: continue
    cyl('post',(sx*S,sy*S,0),(sx*S,sy*S,1.45),0.06,post)
    pm=mat('pad',pc,0.45)
    for z in (0.45,0.8,1.15): 
        o=box('pad',(sx*(S-0.05),sy*(S-0.05),z),(0.16,0.16,0.22),pm); o.rotation_euler=(0,0,math.radians(45))
# ropes: red white blue, 4 ropes, on far + sides (skip near)
rc=[(0.75,0.03,0.04),(0.9,0.9,0.92),(0.05,0.12,0.7),(0.75,0.03,0.04)]
for i,z in enumerate((0.42,0.72,1.02,1.32)):
    m=mat('rope%d'%i,rc[i],0.35)
    cyl('rope',(-S,S,z),(S,S,z),0.022,m)
    cyl('rope',(-S,S,z),(-S,-S,z),0.022,m)
    cyl('rope',(S,S,z),(S,-S,z),0.022,m)
# arena floor
box('floor',(0,8,-1.25),(60,60,0.1),mat('floor',(0.02,0.02,0.025),0.9))
# ringside press table + CRT monitors (far side)
box('table',(0,S+1.4,-0.85),(7,0.8,0.08),mat('tablecloth',(0.05,0.06,0.25),0.9))
crt=mat('crt',(0.1,0.1,0.1),0.4); scr=mat('scr',(0,0,0),0.2,(0.3,0.8,1.0),2.5)
for x in (-2.5,-1,0.6,2.2):
    box('crt',(x,S+1.5,-0.62),(0.45,0.4,0.38),crt); box('scr',(x,S+1.29,-0.62),(0.36,0.01,0.28),scr)
# crowd on risers: far side + left/right wings
shirt=[(0.9,0.1,0.5),(0.1,0.7,0.8),(0.95,0.8,0.1),(0.2,0.2,0.6),(0.6,0.05,0.05),(0.1,0.4,0.15),(0.85,0.85,0.85),(0.1,0.1,0.1),(0.4,0.25,0.15),(0.3,0.5,0.9),(0.55,0.0,0.6),(0.05,0.05,0.05)]
skin=[(0.35,0.2,0.12),(0.6,0.42,0.3),(0.2,0.11,0.07),(0.75,0.55,0.42),(0.45,0.28,0.18)]
shirt_m=[mat('sh%d'%i,tuple(v*0.45 for v in c),0.8) for i,c in enumerate(shirt)]; skin_m=[mat('sk%d'%i,tuple(v*0.6 for v in c),0.6) for i,c in enumerate(skin)]
riser=mat('riser',(0.04,0.04,0.05),0.9)
bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.21,depth=0.62); body_mesh=bpy.context.active_object.data; bpy.data.objects.remove(bpy.context.active_object)
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=0.11); head_mesh=bpy.context.active_object.data; bpy.data.objects.remove(bpy.context.active_object)
def person(x,y,z):
    bm=body_mesh.copy(); bm.materials.append(rnd.choice(shirt_m)); o=bpy.data.objects.new('p',bm); col.objects.link(o); o.location=(x,y,z+0.31); o.scale=(1+rnd.uniform(-.15,.2),0.8,1+rnd.uniform(-.1,.1))
    hm=head_mesh.copy(); hm.materials.append(rnd.choice(skin_m)); h=bpy.data.objects.new('h',hm); col.objects.link(h); h.location=(x+rnd.uniform(-.03,.03),y,z+0.74+rnd.uniform(-.05,.05))
    if rnd.random()<0.18:  # arm up
        cyl('arm',(x+0.18,y,z+0.55),(x+0.25+rnd.uniform(-.1,.1),y,z+1.05),0.05,rnd.choice(skin_m),6)
for row in range(14):
    y=S+3.0+row*0.85; z=-1.2+row*0.42
    box('riser',(0,y,z-0.25),(40,0.85,0.5),riser)
    n=int(36+row*2)
    for i in range(n):
        x=-17+i*(34/n)+rnd.uniform(-0.12,0.12)
        if rnd.random()<0.93: person(x,y+rnd.uniform(-0.1,0.1),z)
for side in (-1,1):
    for row in range(8):
        x=side*(S+3.2+row*0.85); z=-1.2+row*0.42
        box('riser',(x,S+1,z-0.25),(0.85,14,0.5),riser)
        for j in range(16):
            y=-6+j*0.75+rnd.uniform(-.1,.1)
            if rnd.random()<0.9: person(x,y,z)
# back wall + banners
box('wall',(0,S+16,4),(50,0.3,14),mat('wall',(0.015,0.015,0.03),0.9))
plane_img('banner',(0,S+9,4.55),8.4,2.1,'banner_main.png',(math.radians(90),0,0),1.6)
#plane_img('bl',(-8.5,S+12.6,2.9),1.5,3.0,'banner_l.png',(math.radians(90),0,0),1.4)
#plane_img('br',(8.5,S+12.6,2.9),1.5,3.0,'banner_r.png',(math.radians(90),0,0),1.4)
# scoreboard / jumbotron-ish CRT bank above banner
box('truss',(0,0,6.2),(8,0.25,0.25),mat('truss',(0.3,0.3,0.32),0.4,metal=1))
# lights
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True
bg=w.node_tree.nodes['Background']; bg.inputs[0].default_value=(0.01,0.012,0.02,1); bg.inputs[1].default_value=1
def spot(loc,target,energy,color,angle=40,blend=0.4,size=0.3):
    d=bpy.data.lights.new('s','SPOT'); d.energy=energy; d.color=color; d.spot_size=math.radians(angle); d.spot_blend=blend; d.shadow_soft_size=size
    o=bpy.data.objects.new('s',d); col.objects.link(o); o.location=loc
    o.rotation_euler=(Vector(target)-Vector(loc)).to_track_quat('-Z','Y').to_euler(); return o
for x in (-2.2,0,2.2):
    for y in (-1.6,1.6):
        spot((x,y,7.5),(x*0.6,y*0.6,0),1500,(1,0.95,0.85),34,0.35)
spot((-9,-6,6),(0,0,1),3000,(1.0,0.35,0.7),20,0.6)   # magenta follow
spot((9,-6,6),(0,0,1),3000,(0.3,0.8,1.0),20,0.6)     # cyan follow
spot((0,S+5,9),(0,S+9,4.55),1500,(1,0.9,0.7),30,0.3) # banner wash
# crowd soft light
d=bpy.data.lights.new('crowd','AREA'); d.energy=260; d.size=20; d.color=(0.6,0.55,0.8)
o=bpy.data.objects.new('crowd',d); col.objects.link(o); o.location=(0,S+7,7); o.rotation_euler=(0,0,0)
# flashbulbs (static sparkles)
fm=mat('flash',(1,1,1),0.5,(1,1,1),40)
for i in range(0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=6,radius=0.035,location=(rnd.uniform(-14,14),S+3+rnd.uniform(0,10),rnd.uniform(-0.4,4)))
    bpy.context.active_object.data.materials.append(fm)
# haze volume
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,8,4)); hz=bpy.context.active_object; hz.scale=(50,40,12)
hz.location=(0,10,5)
hm=bpy.data.materials.new('haze'); hm.use_nodes=True; nt=hm.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF'])
vs=nt.nodes.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value=float(os.environ.get('HAZE','0.018')); vs.inputs['Anisotropy'].default_value=0.4
nt.links.new(vs.outputs[0],nt.nodes['Material Output'].inputs['Volume']); hz.data.materials.append(hm)
# camera
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); col.objects.link(cam); sc.camera=cam
CAM=json.loads(os.environ.get('CAM','{"y":-9.4,"h":2.6,"pitch":8,"focal":40}'))
cam.location=(0,CAM['y'],CAM['h']); cam.rotation_euler=(math.radians(90-CAM['pitch']),0,0)
cam.data.lens=CAM['focal']; cam.data.sensor_width=36; cam.data.sensor_fit='HORIZONTAL'
cam.data.dof.use_dof=True; cam.data.dof.focus_distance=9.5; cam.data.dof.aperture_fstop=float(os.environ.get('FSTOP','2.8'))
sc.render.resolution_x=RW; sc.render.resolution_y=RH
sc.render.engine='CYCLES'; sc.cycles.samples=int(os.environ.get('SAMPLES','24')); sc.cycles.use_denoising=True
sc.cycles.volume_step_rate=4; sc.cycles.max_bounces=4
sc.view_settings.view_transform='AgX'; sc.view_settings.look='AgX - Punchy' if 'AgX - Punchy' in [l for l in []] else 'None'
bpy.context.view_layer.update()
# projection table: depth y -> floor screen y (px of 960x540) and px per meter
tab=[]
for i in range(13):
    y=-2.4+i*0.3
    a=world_to_camera_view(sc,cam,Vector((0,y,0))); b=world_to_camera_view(sc,cam,Vector((1,y,0)))
    tab.append({'y':round(y,3),'sy':round((1-a.y)*540,2),'ppm':round((b.x-a.x)*960,3),'cx':round(a.x*960,2)})
# ring edges at screen
for y in (-S,S):
    a=world_to_camera_view(sc,cam,Vector((-S,y,0))); print('ring edge y',y,'screen',round(a.x*960),round((1-a.y)*540))
json.dump(tab,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'proj.json'),'w'),indent=0)
for t in tab: print(t)
sc.render.filepath=os.environ.get('OUT','arena.png'); bpy.ops.render.render(write_still=True)
