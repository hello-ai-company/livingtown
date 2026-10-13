// Node-only binary fixture check; keeps filesystem types out of the browser TS project.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateGuideBinary } from './guideScene.mjs';

it('accepts the regenerated runtime guide as one small self-contained mesh and material', () => {
  const bytes = Uint8Array.from(readFileSync(new URL('../../public/media/beginner-guide.glb', import.meta.url))).buffer;
  const document = validateGuideBinary(bytes);
  expect(bytes.byteLength).toBeLessThan(300 * 1024);
  expect(document.meshes).toHaveLength(1); expect(document.materials).toHaveLength(1);
  expect(document.extensionsUsed).toEqual(['KHR_materials_specular']);
  expect(document.buffers.every(buffer => buffer.uri === undefined)).toBe(true);
});
