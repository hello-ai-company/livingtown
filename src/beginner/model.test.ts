import { describe, expect, it } from 'vitest'
import { CATALOG, NEEDS, evaluateCandidates, initialAnswers, type Catalog, type Answers } from './model'
import { DEMO_KNOWLEDGE } from '../data/demoData'
import { validateGuideBinary } from './guideScene.mjs'

const run = (answers = initialAnswers(), scenario: 'flood' | 'earthquake' = 'earthquake', purpose: 'emergency' | 'stay' = 'emergency', catalog: Catalog = CATALOG) => evaluateCandidates(answers, scenario, purpose, [], 'current', catalog, new Date('2026-10-05T01:00:00Z'))
const eligible = (answers: Answers) => run(answers).candidates.flatMap(candidate => candidate.routes).filter(route => route.eligible).map(route => route.id)
describe('fictional destination/route explanation', () => {
  it('compares two destinations in earthquake without assigning a destination', () => {
    expect(run().candidates.filter(candidate => candidate.eligible).map(candidate => candidate.facility.id)).toEqual(['hill', 'hall'])
    expect(run().candidates).toHaveLength(3)
  })
  it('stairs requirement excludes stairs; skipped does not pretend no support is needed', () => {
    const answers = initialAnswers(); answers.stairs = 'required'
    expect(eligible(answers)).not.toContain('hill-short')
    expect(eligible(answers)).toContain('hill-rest')
    const skipped = initialAnswers(); skipped.stairs = 'skipped'
    expect(run(skipped).candidates[0].routes[0].impacts[0].reason).toContain('不要とはみなしません')
  })
  it('wheel users require confirmed step/width/slope and facility entrance; unknown is excluded', () => {
    const answers = initialAnswers(); answers.wheels = 'required'
    expect(eligible(answers)).toEqual(expect.arrayContaining(['hill-rest', 'hall-rest']))
    expect(eligible(answers)).not.toContain('hall-short')
    const unknown = structuredClone(CATALOG); unknown.facilities[0].stepFreeEntrance = null
    expect(run(answers, 'earthquake', 'emergency', unknown).candidates[0].eligible).toBe(false)
  })
  it('missing data fields never become confirmed accessibility facts', () => {
    const answers = initialAnswers(); answers.wheels = 'required'
    const unknown = structuredClone(CATALOG); Reflect.deleteProperty(unknown.segments.find(edge => edge.id === 'south-east')!, 'step')
    expect(run(answers, 'earthquake', 'emergency', unknown).candidates.every(candidate => !candidate.eligible)).toBe(true)
  })
  it('rest is based on longest distance between explicit rest locations', () => {
    const answers = initialAnswers(); answers.rest = 'required'
    expect(eligible(answers)).toEqual(['hill-rest', 'hall-rest'])
    expect(run(answers).candidates[0].routes.find(route => route.id === 'hill-short')!.impacts.find(item => item.need === 'rest')!.fact).toBe(false)
  })
  it.each(['power', 'guidance', 'companion'] as const)('required %s yields no candidate; preference keeps explicit unknown', need => {
    const answers = initialAnswers(); answers[need] = 'required'
    expect(eligible(answers)).toEqual([])
    answers[need] = 'preferred'
    expect(eligible(answers).length).toBeGreaterThan(0)
    expect(run(answers).candidates[0].routes[0].cautions.join(' ')).toContain('未対応／要確認')
  })
  it('disaster and purpose differ, welfare facility never implies admission', () => {
    expect(run(initialAnswers(), 'flood').candidates.filter(candidate => candidate.eligible).map(candidate => candidate.facility.id)).toEqual(['hill'])
    const stay = run(initialAnswers(), 'earthquake', 'stay')
    expect(stay.candidates.filter(candidate => candidate.eligible).map(candidate => candidate.facility.id)).toEqual(['hall'])
    expect(stay.candidates[2].routes[0].exclusions.join(' ')).toContain('受入を保証しません')
  })
  it('all closed or unknown road information gives no eligible path', () => {
    for (const mode of ['all_closed', 'unknown'] as const) expect(evaluateCandidates(initialAnswers(), 'earthquake', 'emergency', [], mode).candidates.every(candidate => !candidate.eligible)).toBe(true)
  })
  it('only visible condition-matching community confirmations block roads and expose actual dates, never official status', () => {
    const report = { ...DEMO_KNOWLEDGE[0], agree_count: 2, updated_at: '2026-10-04T05:00:00Z' }
    const wet = evaluateCandidates(initialAnswers(), 'flood', 'emergency', [report], 'current')
    expect(wet.candidates[0].routes.find(route => route.id === 'hill-short')!.exclusions.join(' ')).toContain('行政の安全確認ではありません')
    expect(wet.reportTimes).toEqual([report.updated_at])
    const expired = { ...report, report_type: 'incident' as const, expires_at: '2026-10-01T00:00:00Z' }
    expect(evaluateCandidates(initialAnswers(), 'flood', 'emergency', [expired], 'current').reportTimes).toEqual([])
  })
  it('malformed or disconnected paths fail closed', () => {
    const catalog = structuredClone(CATALOG)
    for (const path of catalog.paths) path.segments = ['missing-edge']
    expect(run(initialAnswers(), 'earthquake', 'emergency', catalog).candidates.every(candidate => !candidate.eligible)).toBe(true)
    const wrongGoal = structuredClone(CATALOG); wrongGoal.facilities[0].node = 'care'
    expect(run(initialAnswers(), 'earthquake', 'emergency', wrongGoal).candidates[0].eligible).toBe(false)
  })
  it('chosen explanation is captured from the same assessment as candidate eligibility', () => {
    const answers = initialAnswers(); answers.stairs = 'required'; answers.power = 'preferred'
    const route = run(answers).candidates[0].routes.find(item => item.id === 'hill-rest')!
    expect(route.eligible).toBe(true)
    expect(route.impacts.find(item => item.need === 'stairs')!.reason).toBe('階段のない道です（架空の属性）')
    expect(route.impacts.find(item => item.need === 'power')!.reason).toContain('満たす根拠がありません')
    expect(Object.keys(answers).sort()).toEqual(NEEDS.map(item => item.id).sort())
  })
})

const glb = (document: object) => {
  const text = new TextEncoder().encode(JSON.stringify(document)); const padding = (4 - text.length % 4) % 4
  const bytes = new ArrayBuffer(20 + text.length + padding); const view = new DataView(bytes)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true); view.setUint32(12, text.length + padding, true); view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(bytes, 20).fill(32); new Uint8Array(bytes, 20, text.length).set(text); return bytes
}
describe('optional illustration resource boundary', () => {
  it('accepts a small self-contained GLB envelope', () => expect(validateGuideBinary(glb({ asset: { version: '2.0' } }))).toEqual({ asset: { version: '2.0' } }))
  it('accepts the original built-in specular material without decoder dependencies', () => expect(validateGuideBinary(glb({ extensionsUsed: ['KHR_materials_specular'] }))).toEqual({ extensionsUsed: ['KHR_materials_specular'] }))
  it.each([{ buffers: [{ uri: 'https://external.test/model.bin' }] }, { images: [{ uri: 'https://external.test/image.png' }] }, { extensionsUsed: ['unknown-extension'] }, { extensionsUsed: ['KHR_draco_mesh_compression'] }, { extensionsUsed: ['EXT_meshopt_compression'] }, { extensionsRequired: ['KHR_texture_basisu'] }])('refuses model resources that can trigger external IO', document => expect(() => validateGuideBinary(glb(document))).toThrow('EXTERNAL_MODEL_RESOURCES_DISABLED'))
  it('rejects oversized/truncated/malformed data', () => {
    expect(() => validateGuideBinary(new ArrayBuffer(2))).toThrow()
    expect(() => validateGuideBinary(new ArrayBuffer(2 * 1024 * 1024))).toThrow()
    const bytes = glb({}); new DataView(bytes).setUint32(12, 10000, true); expect(() => validateGuideBinary(bytes)).toThrow()
  })
})
