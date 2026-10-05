// Optional, same-origin illustration only. Never receives preferences or data.
import { AmbientLight, Box3, Color, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function validateGuideBinary(bytes) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 20 || bytes.byteLength > 1024 * 1024) throw Error('INVALID_LOCAL_MODEL');
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw Error('INVALID_LOCAL_MODEL');
  const length = view.getUint32(12, true);
  if (length > bytes.byteLength - 20) throw Error('INVALID_LOCAL_MODEL');
  const document = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + length)));
  // The original Blender material uses only the built-in specular shader extension.
  // Compression/decoder extensions remain disabled; all external resource URIs remain rejected.
  const extensions = [...(document.extensionsUsed || []), ...(document.extensionsRequired || [])];
  if (extensions.some(name => name !== 'KHR_materials_specular') || document.buffers?.some(item => item.uri !== undefined) || document.images?.some(item => item.uri !== undefined)) throw Error('EXTERNAL_MODEL_RESOURCES_DISABLED');
  return document;
}
export async function mountGuide(host, signal, onFailure) {
  let renderer; let model; let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    model?.traverse(object => { object.geometry?.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) if (material) { for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); } });
    if (renderer) { renderer.domElement.removeEventListener('webglcontextlost', lost); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
  };
  const lost = event => { event.preventDefault(); dispose(); onFailure(); };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const response = await fetch('/media/beginner-guide.glb', { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]), credentials: 'omit', redirect: 'error' });
    if (!response.ok || Number(response.headers.get('content-length')) > 1024 * 1024) throw Error('MODEL_UNAVAILABLE');
    const bytes = await response.arrayBuffer(); validateGuideBinary(bytes); signal.throwIfAborted();
    const loaded = await new GLTFLoader().parseAsync(bytes, ''); model = loaded.scene;
    if (signal.aborted || disposed) { model.traverse(object => { object.geometry?.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose(); }); throw Error('STOPPED'); }
    const box = new Box3().setFromObject(model); const size = box.getSize(new Vector3()); const center = box.getCenter(new Vector3());
    if (![...size.toArray(), ...center.toArray()].every(Number.isFinite) || size.y <= 0) throw Error('INVALID_LOCAL_MODEL');
    model.position.sub(center); const scene = new Scene(); scene.background = new Color('#eff4ee'); scene.add(model, new AmbientLight(0xffffff, 2));
    const light = new DirectionalLight(0xffffff, 3); light.position.set(2, 3, 4); scene.add(light);
    const camera = new PerspectiveCamera(35, 1, .01, 100); camera.position.set(0, size.y * .1, Math.max(size.y, size.x, size.z) * 2.3); camera.lookAt(0, 0, 0);
    renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(240, 240); renderer.domElement.setAttribute('aria-hidden', 'true'); renderer.domElement.addEventListener('webglcontextlost', lost); host.append(renderer.domElement);
    renderer.render(scene, camera);
    return { dispose, turn: delta => { if (!disposed) { model.rotation.y += delta; renderer.render(scene, camera); } } };
  } catch (error) { dispose(); throw error; }
}
