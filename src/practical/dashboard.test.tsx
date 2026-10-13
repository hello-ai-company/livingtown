import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FamilyDashboard } from '../family/FamilyDashboard'
import { LocalTownRepository } from '../data/supabase'
it('renders the integrated training and preparation release with unique targets and no external form', () => {
  const html = renderToStaticMarkup(<FamilyDashboard repository={new LocalTownRepository({ persist: false })} onInvalidate={() => {}} />)
  for (const label of ['千代田エリア', '状況が変わったときの練習', '障害物と情報の変化', '匿名の協力者', '家族の準備ワークブック', '架空の訓練条件をファイル', '最大8人']) expect(html).toContain(label)
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1])
  expect(new Set(ids).size).toBe(ids.length)
  for (const target of [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1])) expect(ids).toContain(target)
  expect(html).not.toContain('<form'); expect(html).not.toContain('autofocus')
  expect(html).toContain('以前の未公開ソースそのものの復元ではありません')
})
