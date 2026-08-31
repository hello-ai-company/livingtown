import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ContributeKnowledgeInput } from '../data/repository'
import { ObservationComposer } from './ObservationComposer'

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
  it('renders the Japanese one-line composer and map-center label', () => {
    const markup = renderComposer()

    expect(markup).toContain('この場所で何がありましたか？')
    expect(markup).toContain('送信')
    expect(markup).toContain('投稿場所: 地図の中心付近')
    expect(markup).toContain('一言で大丈夫です。')
    expect(markup).toContain('地域からの報告')
  })

  it('renders the English one-line composer and community wording', () => {
    const markup = renderComposer({ locale: 'en' })

    expect(markup).toContain('What&#x27;s happening here?')
    expect(markup).toContain('Send')
    expect(markup).toContain('Report location: map center')
    expect(markup).toContain('Community report')
  })

  it('keeps the undo affordance attached to the pending community confirmation', () => {
    const markup = renderComposer({ lastPostedKnowledgeId: 'k-test', onUndo: () => undefined })

    expect(markup).toContain('地域情報として地図に追加しました。')
    expect(markup).toContain('確認が集まるまでは「地域からの報告」として表示されます。')
    expect(markup).toContain('取り消す')
  })
})
