"""Roundtrip visual check of the actual exported GLB in the source light rig."""
import bpy, os, sys
out=os.path.abspath(sys.argv[sys.argv.index('--')+1])
bpy.ops.wm.open_mainfile(filepath=os.path.join(out,'livingtown-guide.blend'))
for obj in list(bpy.data.objects):
 if obj.type=='MESH': bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(out,'livingtown-guide.glb'))
for obj in bpy.context.selected_objects:
 obj.hide_render=False; obj.hide_viewport=False; obj.hide_set(False)
scene=bpy.context.scene
scene.render.resolution_x=576; scene.render.resolution_y=768
scene.render.filepath=os.path.join(out,'qa','runtime-roundtrip.png')
bpy.ops.render.render(write_still=True)
print('ROUNDTRIP_RENDER_COMPLETE')
