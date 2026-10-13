import type { FamilyState } from '../family/model'
import { nextGuide, type GuideIconName } from './guide'
import './guided.css'
const paths: Record<GuideIconName, string> = {
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  compare: 'M5 4v16M19 4v16M2 8l3-4 3 4M16 16l3 4 3-4M10 8h5M9 16h5',
  check: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  stop: 'M8 2h8l6 6v8l-6 6H8l-6-6V8zM9 8v8M15 8v8',
  info: 'M12 8h.01M12 11v6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2M7 3v6h10V3M7 21v-8h10v8',
  experiment: 'M9 3h6M10 3v6L3 20h18L14 9V3M6 15h12',
  arrow: 'M5 12h14M13 6l6 6-6 6',
}
export function GuideIcon({ name }: { name: GuideIconName }) {
  return <svg className="guide-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>
}
export function focusGuideTarget(target: string) {
  const element = document.getElementById(target)
  if (!element) return
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: 'start', behavior: 'auto' })
}
export function GuidedStart({ state, onStop }: { state: FamilyState; onStop: () => void }) {
  const next = nextGuide(state)
  const steps = [{ title: '家族', target: 'family-members-title', icon: 'people' }, { title: '候補を比較', target: 'family-conditions-title', icon: 'compare' }, { title: '確認の準備', target: 'family-workbook-area', icon: 'check' }] as const
  return <>
    <nav className="guided-steps" aria-label="訓練の3ステップ">{steps.map((step, index) => <button key={step.target} type="button" aria-current={next.step === index + 1 ? 'step' : undefined} onClick={() => focusGuideTarget(step.target)}><GuideIcon name={step.icon} /><span><small>STEP {index + 1}</small>{step.title}</span></button>)}</nav>
    <section className="guided-next" aria-labelledby="guided-next-title"><div className="guided-next-icon"><GuideIcon name={next.icon} /></div><div><small>次にすること</small><h2 id="guided-next-title" aria-live="polite" aria-atomic="true">{next.title}</h2><p>{next.detail}</p><button className="primary-button guided-next-button" type="button" onClick={() => focusGuideTarget(next.target)}>{next.action}<GuideIcon name="arrow" /></button></div></section>
    <button className="secondary-button" type="button" onClick={() => focusGuideTarget('family-workbook-area')}><GuideIcon name="check" />家族に合う確認アシストを見る</button>
    <div className="guided-safety-bar"><span><GuideIcon name="info" />架空の訓練 · 実際の避難案内ではありません</span><button className="practical-stop" type="button" disabled={state.walkingStopped} onClick={onStop}><GuideIcon name="stop" />{state.walkingStopped ? '訓練は停止中' : '歩行の訓練を停止'}</button></div>
  </>
}
