import { CATALOG, SAMPLE_CHECKED_AT, type Purpose } from '../beginner/model'
import type { Scenario } from '../sim/types'
import { reviewDestinationEvidence, type DestinationEvidence } from '../evidence/destinationEvidence'

export const REGION = { id: 'chiyoda-fictional', name: '千代田エリアを題材にした架空の訓練', version: 'practical-reimplementation-2026-10-12-v1', publishedAt: '2026-10-12T00:00:00.000Z' } as const
/** A source label is never a trust grant. These are our fixtures, not city data. */
export function regionalEvidence(purpose: Purpose): DestinationEvidence[] {
  return CATALOG.facilities.filter(facility => facility.uses.includes(purpose)).map(facility => ({
    schemaVersion: 1, id: facility.id, label: facility.name,
    role: purpose === 'emergency' ? 'emergency_place' : facility.id === 'care' ? 'welfare_shelter' : 'shelter',
    hazards: { flood: facility.disasters.flood === true ? 'supported' : facility.disasters.flood === false ? 'unsupported' : 'unknown', earthquake: facility.disasters.earthquake === true ? 'supported' : 'unknown' },
    designation: { publisher: 'LivingTown 自作の架空設定', url: 'https://github.com/hello-ai-company/livingtown', authority: 'fictional', issuedAt: SAMPLE_CHECKED_AT, observedAt: null, retrievedAt: REGION.publishedAt, validUntil: null },
    opening: { status: 'unknown', source: null },
  }))
}
export function RegionalEvidence({ scenario, purpose, now }: { scenario: Scenario; purpose: Purpose; now: string }) {
  const sources = regionalEvidence(purpose)
  return <section id="regional-evidence" className="practical-region" aria-labelledby="region-title">
    <div className="practical-section-heading"><span className="practical-number" aria-hidden="true">01</span><div><span className="practical-eyebrow">REGIONAL TRAINING · FICTIONAL</span><h2 id="region-title">{REGION.name}</h2></div></div>
    <p>地域を身近に考えるための練習です。施設名・道路・開設状態は架空で、千代田区の指定施設一覧や現地の状況とは対応していません。</p>
    <div className="practical-purpose"><strong>{purpose === 'emergency' ? '指定緊急避難場所の役割：危険から一時退避' : '指定避難所の役割：避難後の滞在'}</strong><p>指定緊急避難場所は災害種別ごとの指定です。指定避難所とは役割が異なり、兼ねる施設でも災害への対応と現在の開設・受入を分けて確認します。</p></div>
    <div className="practical-evidence-grid">{sources.map(source => {
      const review = reviewDestinationEvidence(source, scenario, new Date(now), { maximumOpeningAgeMs: 3600000, trustedOpeningSource: false, maximumDesignationAgeMs: 86400000, trustedDesignationSource: false })
      return <article className="practical-evidence-card" key={`${source.id}:${purpose}`}><h3>{source.label}</h3><span className="practical-unknown">現実の情報は未確認</span><dl><div><dt>対象災害への対応（架空設定）</dt><dd>{review.statedHazardSupport === 'supported' ? '対応する設定' : review.statedHazardSupport === 'unsupported' ? '対応しない設定' : '不明な設定'}</dd></div><div><dt>実際の災害別指定</dt><dd>未確認・行政データなし</dd></div><div><dt>現在の開設・受入</dt><dd>不明・現在情報なし{source.role === 'welfare_shelter' ? '。福祉避難所の受入には調整の確認が必要です' : ''}</dd></div><div><dt>架空属性の作成時点</dt><dd><time dateTime={source.designation.issuedAt!}>{source.designation.issuedAt!.slice(0, 10)}</time>（現在情報ではありません）</dd></div><div><dt>現地の観測・確認時点</dt><dd>なし</dd></div></dl><p>出典：{source.designation.publisher}。再表示・再計算で出典の日付を新しくしません。</p></article>
    })}</div>
    <details><summary>出典と確認準備について</summary><p>訓練パック作成：{REGION.publishedAt.slice(0, 10)} · {REGION.version}。これは取得・観測・現地確認日時ではありません。下の資料は制度・確認先を知るための参考で、この画面の施設・道路の安全や開設を裏づけません。</p><ul><li><a href="https://www.bousai.go.jp/taisaku/hinanbasyo.html" target="_blank" rel="noreferrer">内閣府：避難場所に関すること（別タブ）</a></li><li><a href="https://www.bousai.go.jp/oukyu/hinanjouhou/r3_hinanjouhou_guideline/" target="_blank" rel="noreferrer">内閣府：避難情報に関するガイドライン（別タブ）</a></li></ul></details>
  </section>
}
