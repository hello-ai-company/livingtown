import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Knowledge } from '../sim/types'
import { MyReportsPanel } from './MyReportsPanel'

const base: Knowledge = {
  id: 'private-owner-id-must-not-render',
  category: 'theft',
  lat: 35.681,
  lng: 139.76,
  condition: 'always',
  description: 'raw private text should be masked',
  confidence: 'heard',
  agree_count: 1,
  disagree_count: 0,
  created_at: '2026-09-01T00:00:00.000Z',
  can_edit: true,
  report_type: 'incident',
  expires_at: '2026-09-30T00:00:00.000Z',
}

describe('MyReportsPanel', () => {
  it('renders only can_edit reports with safe descriptions and owner actions', () => {
    const markup = renderToStaticMarkup(<MyReportsPanel knowledge={[base, { ...base, id: 'someone-elses-row', can_edit: false, description: 'should not be visible' }]} locale="en" onEdit={() => undefined} onDelete={() => undefined} onPost={() => undefined} />)

    expect(markup).toContain('My reports')
    expect(markup).toContain('A community report mentions possible theft nearby.')
    expect(markup).toContain('Edit')
    expect(markup).toContain('Delete')
    expect(markup).not.toContain('should not be visible')
    expect(markup).not.toContain('private-owner-id-must-not-render')
  })

  it('marks an expired owner report separately from an active report', () => {
    const markup = renderToStaticMarkup(<MyReportsPanel knowledge={[{ ...base, expires_at: '2026-08-01T00:00:00.000Z' }]} locale="ja" onEdit={() => undefined} onDelete={() => undefined} onPost={() => undefined} />)

    expect(markup).toContain('期限切れ')
    expect(markup).toContain('地域からの投稿')
  })

  it('offers a first-use post action when the owned set is empty', () => {
    const markup = renderToStaticMarkup(<MyReportsPanel knowledge={[{ ...base, can_edit: false }]} locale="en" onEdit={() => undefined} onDelete={() => undefined} onPost={() => undefined} />)

    expect(markup).toContain('No reports yet')
    expect(markup).toContain('Report something')
  })
})
