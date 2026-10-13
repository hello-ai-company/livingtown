import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { initialFamily, familyReducer, type FamilyState } from '../family/model'
import { nextGuide } from './guide'
import { GuidedStart, GuideIcon } from './GuidedStart'
const now = '2026-10-12T01:00:00.000Z'
function confirmed(): FamilyState { const state = initialFamily(now); return familyReducer(state, { type: 'confirmMember', memberId: 'self', expectedRevision: 0 }) }
function calculated() { const state = confirmed(); return familyReducer(state, { type: 'calculate', expectedRevision: state.profileRevision, expectedDataRevision: state.dataRevision, confirmed: true, now }) }
describe('guided training without safety grants', () => {
  it('starts with family conditions and does not require guessing unknowns', () => { expect(nextGuide(initialFamily(now))).toMatchObject({ step: 1, target: 'family-members-title' }); expect(nextGuide(initialFamily(now)).detail).toContain('未知') })
  it('moves confirmed families to explicit comparison', () => { expect(nextGuide(confirmed())).toMatchObject({ step: 2, target: 'family-conditions-title' }) })
  it('moves results to reasons before any adoption', () => { expect(nextGuide(calculated())).toMatchObject({ step: 2, target: 'family-results-title' }) })
  it('treats adopted training as preparation, never safety completion', () => { const state = calculated(); const route = state.latest!.candidates.flatMap(candidate => candidate.routes).find(route => route.eligible)!; const adopted = familyReducer(state, { type:'adopt', routeId:route.id, expectedRevision:state.profileRevision, expectedDataRevision:state.dataRevision, confirmed:true, now }); expect(nextGuide(adopted)).toMatchObject({step:3,target:'family-workbook-area'}); expect(nextGuide(adopted).detail).toContain('安全確認の完了ではありません') })
  it('prioritizes STOP and fresh family reconfirmation', () => { const stopped = familyReducer(calculated(), {type:'trainingStop'}); expect(nextGuide(stopped)).toMatchObject({step:1,icon:'stop',target:'family-members-title'}); const reconfirmed = familyReducer(stopped,{type:'confirmMember',memberId:'self',expectedRevision:stopped.members[0].revision}); expect(nextGuide(reconfirmed).target).toBe('emergency-title') })
  it('does not suggest comparison when data failed', () => { expect(nextGuide({...confirmed(),dataError:'情報が不完全です'})).toMatchObject({target:'family-data-error',icon:'info'}) })
  it('does not relax an empty result', () => { const state=calculated(); state.latest={...state.latest!,candidates:[]}; expect(nextGuide(state).title).toContain('候補はありません') })
  it('uses short visible labels and decorative icons', () => { const html=renderToStaticMarkup(<GuidedStart state={initialFamily(now)} onStop={()=>{}} />); expect(html).toContain('aria-current="step"'); expect(html).toContain('歩行の訓練を停止'); expect(html).toContain('実際の避難案内ではありません'); expect(html).not.toContain('aria-label=""'); expect(renderToStaticMarkup(<GuideIcon name="people" />)).toContain('aria-hidden="true"') })
  it('disables redundant stop without offering implicit resume', () => { const state=familyReducer(initialFamily(now),{type:'trainingStop'}); const html=renderToStaticMarkup(<GuidedStart state={state} onStop={()=>{}} />); expect(html).toContain('disabled=""'); expect(html).toContain('訓練は停止中') })
})
