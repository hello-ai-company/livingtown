"""LivingTown Guide 1.0 — original procedural artwork, Blender 4.3+.
Run: blender -b -t 4 --python src/build_guide.py -- /absolute/output/dir
"""
import bpy, math, os, sys, json
from mathutils import Vector
from math import sin, cos, pi

OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(os.path.dirname(__file__), '..'))
os.makedirs(os.path.join(OUT, 'renders'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'qa'), exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for mat in list(bpy.data.materials): bpy.data.materials.remove(mat)

PALETTE = {
 'skin':'B9896B', 'skin_light':'C79576', 'hair':'333C3A',
 'jacket':'478C84', 'jacket_dark':'326C65', 'jacket_light':'67A49A',
 'shirt':'F3EADD', 'pants':'C4B69E', 'pants_dark':'AD9E86',
 'shoe':'F1EEE4', 'sole':'C7CECA', 'face':'45443B', 'lip':'845C4C'
}
def srgb(v): return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4
def col(key):
 h=PALETTE.get(key,key); return tuple(srgb(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,)

mat = bpy.data.materials.new('Guide · vertex palette · single runtime material')
mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value=.82
bsdf.inputs['Specular IOR Level'].default_value=.26
vc=mat.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name='Color'
mat.node_tree.links.new(vc.outputs['Color'],bsdf.inputs['Base Color'])
parts=[]
def finish(obj,name,color):
 obj.name=name
 bpy.context.view_layer.objects.active=obj; obj.select_set(True)
 if obj.type=='CURVE': bpy.ops.object.convert(target='MESH'); obj=bpy.context.object
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 obj.data.materials.clear(); obj.data.materials.append(mat)
 attr=obj.data.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
 rgba=col(color)
 for item in attr.data: item.color=rgba
 for p in obj.data.polygons: p.use_smooth=True
 parts.append(obj)
 obj.select_set(False)
 return obj
def mesh(name,verts,faces,color):
 data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
 obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
 return finish(obj,name,color)
def ellipsoid(name,loc,scale,color,segments=20,rings=12):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
 obj=bpy.context.object; obj.scale=scale
 return finish(obj,name,color)
def ring_body(name,rings,color,n=20):
 # rings are z, center x, center y, radius x, radius y
 verts=[(x+rx*cos(2*pi*j/n),y+ry*sin(2*pi*j/n),z) for z,x,y,rx,ry in rings for j in range(n)]
 faces=[tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))]
 for i in range(len(rings)-1):
  for j in range(n): faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 return mesh(name,verts,faces,color)
def tube(name,points,radii,color,n=14):
 verts=[]
 for i,p in enumerate(points):
  p=Vector(p); tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  tangent.normalize(); u=tangent.cross(Vector((0,1,0))).normalized(); v=tangent.cross(u).normalized()
  radius=radii[i]; a,b=radius if isinstance(radius,tuple) else (radius,radius)
  verts.extend(tuple(p+u*(a*cos(2*pi*j/n))+v*(b*sin(2*pi*j/n))) for j in range(n))
 faces=[tuple(reversed(range(n))),tuple((len(points)-1)*n+j for j in range(n))]
 for i in range(len(points)-1):
  for j in range(n): faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 return mesh(name,verts,faces,color)
def stroke(name,points,radius,color):
 curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.resolution_u=8
 curve.bevel_depth=radius; curve.bevel_resolution=2; curve.resolution_u=8
 spline=curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
 for p,co in zip(spline.bezier_points,points): p.co=co; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
 obj=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(obj)
 return finish(obj,name,color)

# Everyday clothing. All forms are designed from scratch; no external assets.
for side,sgn in [('L',-1),('R',1)]:
 ring_body('Trousers.'+side,[
  (.115,sgn*.108,.018,.047,.060),(.145,sgn*.108,.015,.055,.062),
  (.36,sgn*.103,.012,.060,.067),(.50,sgn*.098,.006,.066,.071),
  (.68,sgn*.091,.012,.077,.079),(.88,sgn*.085,.018,.087,.087),
  (.963,sgn*.081,.016,.086,.086)],'pants')
 ring_body('Trouser hem.'+side,[(.116,sgn*.108,.014,.048,.061),(.141,sgn*.108,.014,.055,.062)],'pants_dark')
 # Shoes use rounded volumes with a light, clearly separated sole.
 shoe=ellipsoid('Sneaker sole.'+side,(sgn*.108,-.044,.040),(.067,.126,.034),'sole',20,10)
 shoe=ellipsoid('Sneaker upper.'+side,(sgn*.108,-.046,.073),(.062,.117,.054),'shoe',20,10)
 ellipsoid('Sneaker collar.'+side,(sgn*.108,.01,.107),(.049,.055,.026),'shirt',16,8)
 for k in range(3):
  y=-.053-k*.020; z=.117-k*.006
  stroke('Lace.%s.%d'%(side,k),[(sgn*.108-.025,y,z),(sgn*.108,y-.003,z+.002),(sgn*.108+.025,y,z)],.0023,'sole')

ring_body('Jacket body',[
 (.902,0,.015,.179,.114),(.925,0,.014,.181,.115),
 (1.02,0,.018,.165,.098),(1.17,0,.014,.159,.100),
 (1.31,0,.008,.182,.108),(1.395,0,.004,.204,.100),
 (1.438,0,.006,.185,.086),(1.472,0,.010,.083,.067)],'jacket',24)
ring_body('Jacket lower hem',[(.903,0,.013,.180,.115),(.927,0,.013,.182,.116)],'jacket_dark',24)
ring_body('Neck',[(1.442,0,0,.054,.052),(1.542,0,0,.055,.054)],'skin',20)
# Plain undershirt opening and soft, open overshirt collar.
mesh('Undershirt neckline',[(-.051,-.075,1.465),(.051,-.075,1.465),(.024,-.114,1.365),(-.024,-.114,1.365)],[(0,3,2,1)],'shirt')
mesh('Collar.L',[(-.075,-.068,1.468),(-.031,-.086,1.423),(-.046,-.11,1.364),(-.105,-.084,1.420)],[(3,2,1,0)],'jacket_light')
mesh('Collar.R',[(.075,-.068,1.468),(.031,-.086,1.423),(.046,-.11,1.364),(.105,-.084,1.420)],[(0,1,2,3)],'jacket_light')
stroke('Jacket center seam',[(0,-.106,1.35),(0,-.092,1.19),(0,-.114,.953)],.0016,'jacket_dark')
# Unmarked chest pocket and small warm accent, without insignia or role claims.
stroke('Chest pocket seam',[(-.138,-.080,1.319),(-.117,-.094,1.267),(-.078,-.106,1.267),(-.056,-.107,1.316)],.0020,'jacket_dark')
stroke('Chest pocket rim',[(-.138,-.081,1.319),(-.098,-.10,1.317),(-.056,-.108,1.316)],.0020,'jacket_light')
for side,sgn in [('L',-1),('R',1)]:
 tube('Sleeve.'+side,[(sgn*.145,.008,1.394),(sgn*.177,.007,1.392),(sgn*.203,.007,1.371),(sgn*.226,.006,1.318),(sgn*.259,.003,1.233),(sgn*.287,-.002,1.153),(sgn*.301,-.017,1.017)],
  [(.040,.057),(.063,.077),(.073,.080),(.071,.075),(.064,.064),(.058,.059),(.046,.047)],'jacket',20)
 tube('Sleeve cuff.'+side,[(sgn*.299,-.016,1.035),(sgn*.302,-.018,.998)],[.047,.044],'jacket_dark',16)
 tube('Wrist.'+side,[(sgn*.304,-.018,1.005),(sgn*.310,-.022,.968)],[.034,.036],'skin',12)
 hand=ellipsoid('Relaxed palm.'+side,(sgn*.314,-.026,.938),(.042,.026,.058),'skin',16,10)
 for k,length in enumerate([.047,.058,.056,.042]):
  x=sgn*(.287+.017*k)
  tube('Finger.%s.%d'%(side,k),[(x,-.027,.919),(x+sgn*.002,-.035,.895),(x+sgn*.001,-.041,.919-length)],
   [.0095,.010,.007],'skin',8)
  ellipsoid('Fingertip.%s.%d'%(side,k),(x+sgn*.001,-.041,.919-length),(.007,.008,.007),'skin',8,6)
 tube('Relaxed thumb.'+side,[(sgn*.280,-.032,.965),(sgn*.273,-.052,.944),(sgn*.279,-.060,.921)],[.014,.013,.010],'skin',10)
 ellipsoid('Thumb tip.'+side,(sgn*.279,-.060,.921),(.010,.010,.013),'skin',10,6)

# Adult proportions, unobtrusive facial features and short swept hair.
ring_body('Head',[
 (1.518,0,-.003,.030,.037),(1.530,0,-.005,.055,.052),
 (1.557,0,-.002,.079,.065),(1.603,0,0,.094,.079),
 (1.654,0,.004,.097,.083),(1.695,0,.008,.095,.081),
 (1.733,0,.012,.081,.070),(1.764,0,.013,.051,.044),
 (1.775,0,.013,.008,.008)],'skin_light',28)
for side,sgn in [('L',-1),('R',1)]:
 ellipsoid('Ear.'+side,(sgn*.095,.006,1.626),(.019,.025,.033),'skin',16,10)
 ellipsoid('Eye.'+side,(sgn*.038,-.0765,1.650),(.0105,.0044,.0061),'face',16,8)
 stroke('Eyebrow.'+side,[(sgn*.020,-.0795,1.672),(sgn*.038,-.0775,1.675),(sgn*.055,-.0700,1.671)],.0031,'hair')
ellipsoid('Nose',(0,-.083,1.618),(.015,.022,.023),'skin_light',16,10)
stroke('Gentle smile',[(-.022,-.071,1.579),(0,-.075,1.573),(.022,-.071,1.579)],.0025,'lip')
verts=[(0,.006,1.795)]; ns,nr=32,10
for r in range(1,nr+1):
 for j in range(ns):
  theta=2*pi*j/ns
  front=max(0,-sin(theta))
  # Hairline rises at the forehead; lower at the sides and back.
  phimax=1.74-.72*front+.08*cos(theta)
  phi=phimax*r/nr
  x=.106*sin(phi)*cos(theta)
  y=.006+.101*sin(phi)*sin(theta)
  z=1.650+.145*cos(phi)
  # Small hand-shaped asymmetric sweep, not photoreal individual hair.
  x+=.009*(1-r/nr)*sin(phi)
  verts.append((x,y,z))
faces=[]
for j in range(ns): faces.append((0,1+j,1+(j+1)%ns))
for r in range(nr-1):
 for j in range(ns): faces.append((1+r*ns+j,1+(r+1)*ns+j,1+(r+1)*ns+(j+1)%ns,1+r*ns+(j+1)%ns))
mesh('Short swept hair',verts,faces,'hair')

# Root + separate editable parts. Runtime is joined to a single mesh/material.
root=bpy.data.objects.new('LivingTownGuide',None); bpy.context.collection.objects.link(root)
root['purpose']='Fictional evacuation-training illustration; no health or diagnostic meaning.'
root['license']='CC0-1.0; original procedural artwork'
root['front_blender']='-Y'; root['height_m']=1.795
for obj in parts: obj.parent=root
editable=bpy.data.collections.new('EDITABLE · Original named parts'); bpy.context.scene.collection.children.link(editable)
for obj in parts:
 for collection in list(obj.users_collection): collection.objects.unlink(obj)
 editable.objects.link(obj)
for obj in bpy.context.selected_objects: obj.select_set(False)
copies=[]
for obj in parts:
 clone=obj.copy(); clone.data=obj.data.copy(); clone.parent=None; bpy.context.collection.objects.link(clone); clone.select_set(True); copies.append(clone)
bpy.context.view_layer.objects.active=copies[0]; bpy.ops.object.join(); runtime=bpy.context.object
runtime.name='LivingTownGuide_Runtime'
for poly in runtime.data.polygons: poly.material_index=0
while len(runtime.data.materials)>1: runtime.data.materials.pop(index=len(runtime.data.materials)-1)
# Quantized normalized byte vertex colors, no UVs or image texture dependencies.
for uv in list(runtime.data.uv_layers): runtime.data.uv_layers.remove(uv)
runtime['purpose']='Decorative fictional-training guide; use independent HTML controls.'
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'livingtown-guide.glb'),export_format='GLB',use_selection=True,
 export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,
 export_texcoords=False,export_normals=True,export_materials='EXPORT',export_extras=False)
runtime.hide_render=True; runtime.hide_viewport=True
runtime.hide_set(True)

# Render stage stays separate from the exported model.
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=96
scene.cycles.use_denoising=False
scene.render.resolution_x=768; scene.render.resolution_y=1024; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Soft studio world'); scene.world=world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.80,.85,.84,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5
def area(name,loc,power,size,color):
 data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size; data.color=color
 obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=loc
 obj.rotation_euler=(Vector((0,0,.9))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(-3,-4,5),350,4.0,(1,.93,.84))
area('Fill softbox',(3,-2,3),180,3.0,(.82,.94,1))
area('Rim softbox',(1,3,4),400,3.0,(1,1,.95))
camera_data=bpy.data.cameras.new('Portrait camera'); camera=bpy.data.objects.new('Portrait camera',camera_data)
scene.collection.objects.link(camera); scene.camera=camera
camera_data.type='ORTHO'; camera_data.ortho_scale=2.14
def set_camera(pos):
 camera.location=pos; camera.rotation_euler=(Vector((0,0,.89))-camera.location).to_track_quat('-Z','Y').to_euler()
set_camera((2.1,-6,2.55))
scene.render.filepath=os.path.join(OUT,'livingtown-guide-fallback.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'livingtown-guide.blend'))
bpy.ops.render.render(write_still=True)
set_camera((0,-6,1.72)); scene.render.filepath=os.path.join(OUT,'renders','guide-front.png'); bpy.ops.render.render(write_still=True)
set_camera((-3,5,2.3)); scene.render.filepath=os.path.join(OUT,'renders','guide-back.png'); bpy.ops.render.render(write_still=True)
set_camera((2.1,-6,2.55)); scene.render.filepath=os.path.join(OUT,'livingtown-guide-fallback.png')
# Maintain the ready-to-render three-quarter source scene.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'livingtown-guide.blend'))
stats={'blender_version':bpy.app.version_string,'editable_mesh_parts':len(parts),'runtime_meshes':1,
 'runtime_materials':len(runtime.data.materials),'textures':0,'animations':0,
 'source_vertices':len(runtime.data.vertices),'source_faces':len(runtime.data.polygons),
 'height_m':1.795,'render_size':[768,1024]}
with open(os.path.join(OUT,'qa','blender-build.json'),'w') as f: json.dump(stats,f,indent=2)
print('LIVINGTOWN_BUILD_COMPLETE',json.dumps(stats))
