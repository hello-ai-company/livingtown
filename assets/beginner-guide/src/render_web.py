"""Small web fallback from the unchanged original Blender source scene."""
import bpy, os, sys
out = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.open_mainfile(filepath=os.path.join(out, 'livingtown-guide.blend'))
scene = bpy.context.scene
scene.render.resolution_x = 240
scene.render.resolution_y = 320
scene.cycles.samples = 48
scene.render.filepath = os.path.join(out, 'livingtown-guide-web.png')
bpy.ops.render.render(write_still=True)
print('WEB_FALLBACK_RENDER_COMPLETE')
