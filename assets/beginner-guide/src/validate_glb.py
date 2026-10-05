"""Dependency-free GLB structural and finite-geometry checks."""
import sys, json, struct, math, hashlib, os
path=sys.argv[1]
raw=open(path,'rb').read()
magic,version,length=struct.unpack_from('<4sII',raw)
assert magic==b'glTF' and version==2 and length==len(raw)
offset=12; doc=None; binary=None
while offset<len(raw):
 size,kind=struct.unpack_from('<II',raw,offset); offset+=8
 data=raw[offset:offset+size]; offset+=size
 if kind==0x4E4F534A: doc=json.loads(data)
 elif kind==0x004E4942: binary=data
assert offset==len(raw) and doc is not None and binary is not None
formats={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
def values(index):
 a=doc['accessors'][index]; view=doc['bufferViews'][a['bufferView']]
 fmt,size=formats[a['componentType']]; n=components[a['type']]
 stride=view.get('byteStride',size*n); start=view.get('byteOffset',0)+a.get('byteOffset',0)
 assert start+(a['count']-1)*stride+size*n<=view.get('byteOffset',0)+view['byteLength']
 rows=[struct.unpack_from('<'+fmt*n,binary,start+i*stride) for i in range(a['count'])]
 assert all(math.isfinite(v) for r in rows for v in r)
 return rows
for i in range(len(doc['accessors'])): values(i)
positions=[]; triangles=0; degenerates=0; vertices=0; normals_bad=0
primitives=[p for m in doc['meshes'] for p in m['primitives']]
for p in primitives:
 assert p.get('mode',4)==4 and 'COLOR_0' in p['attributes']
 pos=values(p['attributes']['POSITION']); positions+=pos; vertices+=len(pos)
 norms=values(p['attributes']['NORMAL'])
 normals_bad+=sum(not .98<=sum(v*v for v in n)<=1.02 for n in norms)
 inds=[i[0] for i in values(p['indices'])]
 assert len(inds)%3==0 and max(inds)<len(pos)
 triangles+=len(inds)//3
 for k in range(0,len(inds),3):
  a,b,c=[pos[i] for i in inds[k:k+3]]
  ab=[b[i]-a[i] for i in range(3)]; ac=[c[i]-a[i] for i in range(3)]
  cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
  if sum(v*v for v in cross)<1e-20: degenerates+=1
assert normals_bad==0
assert degenerates==0
assert len(primitives)==1 and len(doc.get('materials',[]))==1
assert not doc.get('textures') and not doc.get('images') and not doc.get('animations')
assert all('uri' not in b for b in doc['buffers'])
result={
 'file':os.path.basename(path),'size_bytes':len(raw),'size_kib':round(len(raw)/1024,2),
 'sha256':hashlib.sha256(raw).hexdigest(),'glb_version':version,
 'meshes':len(doc['meshes']),'primitives_expected_drawcalls':len(primitives),
 'materials':len(doc.get('materials',[])),'textures':len(doc.get('textures',[])),
 'animations':len(doc.get('animations',[])),'external_dependencies':0,
 'vertices':vertices,'triangles':triangles,'degenerate_triangles':degenerates,
 'finite_geometry':True,'normalized_normals':True,
 'bounds_gltf_m':{'min':[min(p[i] for p in positions) for i in range(3)],'max':[max(p[i] for p in positions) for i in range(3)]},
 'color_attribute':'COLOR_0','under_300_KiB':len(raw)<300*1024,
 'front_axis_gltf':'+Z','up_axis_gltf':'+Y','idle_animation':'None; intentionally static.'}
print(json.dumps(result,indent=2))
