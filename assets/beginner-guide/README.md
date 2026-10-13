# LivingTown Guide 1.0

Original procedural artwork, CC0-1.0. The original creator supplied the complete source in an authorized task message on 2026-10-05. These are not medical models and carry no claims about health, diagnosis, professional role or ability. Keep all HTML input controls independent of the illustration.

`src/build_guide.py` is unchanged and SHA256 is `537fb90ef0582535c24016d18372e2cf2ec379bb3e0f719e59b43f9c9128be3c`. `validate_glb.py` and `render_runtime.py` are unchanged original checks. `render_web.py` is a local small-fallback rendering helper which opens the unchanged source scene; it does not modify the scene or original generator.

Generated with the existing Blender4.3.2 in a new local staging directory. No new dependencies, downloads, keys or cloud operations. The original Library ZIP transfer failed twice and was never received; these files were regenerated from the original source, not extracted from that ZIP.

```bash
# Use a new empty output directory. This generates a .blend, GLB and PNGs.
blender -b -t 4 --python assets/beginner-guide/src/build_guide.py -- /absolute/new/output
python3 assets/beginner-guide/src/validate_glb.py /absolute/new/output/livingtown-guide.glb
blender -b -t 4 --python assets/beginner-guide/src/render_runtime.py -- /absolute/new/output
blender -b -t 4 --python assets/beginner-guide/src/render_web.py -- /absolute/new/output
```

Runtime: `public/media/beginner-guide.glb`, 282888bytes, 5919vertices, 11406triangles, 1mesh/primitive/material, no textures/animations/external dependencies. SHA256: `da6045e63b20567cba529d50b887d34c8cc554e181cf9d050341509fe7b9be3b`.

Web fallback: `public/media/beginner-guide.png`, 240×320 transparent PNG, 70346bytes. SHA256: `0b0f0dff1125e8e517434f9005c3777ba914be373442376d895271d126cf6843`.

The built-in `KHR_materials_specular` material extension is supported by the existing Three.js loader. The app rejects other extensions and external image/buffer URIs. Source staging retains the editable .blend and full-resolution render. Validation, front/back and actual-GLB roundtrip render are in `artifacts/beginner-training/`; asset provenance is recorded in `asset-provenance.json`.
