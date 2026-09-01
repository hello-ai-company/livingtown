import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ContributeKnowledgeInput } from '../data/repository'
import { buildObservationPreview, isVoiceInputSupported, ObservationComposer } from './ObservationComposer'

const location = { lat: 35.6813, lng: 139.7611 }
const noopSubmit = async (_input: ContributeKnowledgeInput): Promise<void> => undefined

function renderComposer(overrides: Partial<Parameters<typeof ObservationComposer>[0]> = {}) {
  return renderToStaticMarkup(
    <ObservationComposer
      locale="ja"
      mode="advanced"
      location={location}
      locationSource="center"
      onRequestLocationChange={() => undefined}
      onSubmit={noopSubmit}
      {...overrides}
    />,
  )
}

describe('ObservationComposer', () => {
  it('builds a reviewable normal preview without posting it', () => {
    const preview = buildObservationPreview('雨の日は歩道に水がたまります。', location, 'ja', new Date('2026-09-01T12:00:00.000Z'))

    expect(preview.category).toBe('flood')
    expect(preview.safeDescription).toBe('雨の日は歩道に水がたまります。')
    expect(preview.sensitive).toBe(false)
    expect(preview.input.description).toBe('雨の日は歩道に水がたまります。')
  })

  it('builds a sensitive preview with a safe summary and coarse-location precision', () => {
    const preview = buildObservationPreview('A bicycle was stolen yesterday.', location, 'en', new Date('2026-09-01T12:00:00.000Z'))

    expect(preview.category).toBe('theft')
    expect(preview.safeDescription).toBe('A community report mentions possible theft nearby.')
    expect(preview.sensitive).toBe(true)
    expect(preview.precisionMeters).toBe(150)
    expect(preview.input.description).toContain('stolen')
  })

  it('keeps relative incident time in the review payload', () => {
    const preview = buildObservationPreview('昨日、駅前で盗難がありました。', location, 'ja', new Date('2026-09-01T12:00:00.000Z'))

    expect(preview.input.observed_at).toBe('2026-08-31T12:00:00.000Z')
    expect(preview.input.report_type).toBe('incident')
  })

  it('does not show voice controls in a non-browser test environment', () => {
    expect(isVoiceInputSupported()).toBe(false)
    expect(renderComposer()).not.toContain('音声入力')
  })

  it('renders the Japanese one-line composer and map-center label', () => {
    const markup = renderComposer()

    expect(markup).toContain('この場所で何がありましたか？')
    expect(markup).toContain('送信')
    expect(markup).toContain('投稿場所: 地図の中心付近')
    expect(markup).toContain('一言で大丈夫です。')
    expect(markup).toContain('地域からの投稿')
  })

  it('renders the English one-line composer and community wording', () => {
    const markup = renderComposer({ locale: 'en' })

    expect(markup).toContain('What&#x27;s happening here?')
    expect(markup).toContain('Send')
    expect(markup).toContain('Report location: map center')
    expect(markup).toContain('Community post')
  })

  it('keeps the undo affordance attached to the pending community confirmation', () => {
    const markup = renderComposer({ lastPostedKnowledgeId: 'k-test', onUndo: () => undefined })

    expect(markup).toContain('地域情報として地図に追加しました。')
    expect(markup).toContain('確認が集まるまでは「確認中」として表示されます。')
    expect(markup).toContain('取り消す')
  })
})
