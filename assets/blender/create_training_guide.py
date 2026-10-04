"""Original LivingTown waiting illustration. Blender 4.3; no external assets.
blender -b --python assets/blender/create_training_guide.py -- --output /tmp/livingtown-guide
The dots are decorative, never a real route or measured progress.
"""
import bpy, math, os, sys
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
out=args[args.index('--output')+1] if '--output' in args else '/tmp/livingtown-guide'
os.makedirs(out,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=288;scene.render.resolution_y=192;scene.render.resolution_percentage=100
scene.render.fps=12;scene.frame_start=1;scene.frame_end=36
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.world.color=(.6,.7,.64)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.86,.93,.88,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
scene.view_settings.view_transform='Standard'
scene.render.filepath=out+'/frame-'
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
green=mat('Forest green',(.04,.29,.20));sand=mat('Warm ivory',(.86,.90,.82));gold=mat('Guide amber',(.86,.53,.14));light=mat('Sage',(.38,.58,.47))
def cube(name,location,scale,material,bevel=.1):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3;o.modifiers.new('Normals','WEIGHTED_NORMAL');return o
cube('Quiet town base',(0,0,-.16),(6,4,.28),sand,.2)
for x,y,z in [(-1.85,.9,.8),(1.85,.85,1.05),(-1.9,-.8,.6),(1.7,-.7,.65)]:
 cube('Town house',(x,y,z/2),(.85,.65,z),light)
 cube('Roof',(x,y,z+.05),(1,.8,.15),green)
for x in [-.8,0,.8]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.10,location=(x,0,.02));bpy.context.object.data.materials.append(green)
# A small guide, with no face or progress percentage. One gentle pass, not a loop.
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.22,location=(-.8,0,.62));guide=bpy.context.object;guide.name='Guide orb';guide.data.materials.append(gold)
for frame,x,z in [(1,-.8,.62),(12,-.25,.67),(24,.3,.67),(36,.8,.62)]:
 guide.location=(x,0,z);guide.keyframe_insert(data_path='location',frame=frame)
if guide.animation_data:
 for curve in guide.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='BEZIER'
bpy.ops.object.light_add(type='AREA',location=(0,-3,7));bpy.context.object.data.energy=450;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=5
bpy.ops.object.camera_add(location=(5,-7,7));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.15))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=7.6;scene.camera=cam
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('assets/blender/training-guide.blend'),compress=True)
bpy.ops.render.render(animation=True)
