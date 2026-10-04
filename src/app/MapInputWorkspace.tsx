import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'

const MapVisibility = createContext(true)
export const useWorkspaceMapVisible = () => useContext(MapVisibility)

/** Keep inputs mounted when switching views; hidden controls leave the tab order. */
export function MapInputWorkspace({ map, children, inputOpen = true, picking = false, mapFocusKey = 0, inputFocusKey = 0, title, locale = 'ja' }: {
  map: ReactNode; children: ReactNode; inputOpen?: boolean; picking?: boolean; mapFocusKey?: number; inputFocusKey?: number; title: string; locale?: 'ja' | 'en'
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches)
  const [view, setView] = useState<'map' | 'input'>(inputOpen && !picking ? 'input' : 'map')
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)')
    const update = () => {
      const focused = document.activeElement
      if (media.matches && tabs.current.includes(focused as HTMLButtonElement)) {
        const pane = focused === tabs.current[0] ? 'map' : 'input'
        requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-workspace-pane="${pane}"]`)?.focus({ preventScroll: true }))
      }
      if (!media.matches) {
        if (focused instanceof HTMLElement && root.current?.contains(focused)) {
          setView(focused.closest('[data-workspace-pane="input"]') ? 'input' : 'map')
        }
      }
      setWide(media.matches)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    setView(inputOpen && !picking ? 'input' : 'map')
    if (inputOpen && !window.matchMedia('(min-width: 1100px)').matches) {
      const frame = requestAnimationFrame(() => tabs.current[picking ? 0 : 1]?.focus())
      return () => cancelAnimationFrame(frame)
    }
  }, [inputOpen, picking])
  useEffect(() => {
    if (!mapFocusKey) return
    setView('map')
    if (!window.matchMedia('(min-width: 1100px)').matches) tabs.current[0]?.focus()
  }, [mapFocusKey])
  useEffect(() => {
    if (!inputFocusKey) return
    setView('input')
    if (!window.matchMedia('(min-width: 1100px)').matches) tabs.current[1]?.focus()
  }, [inputFocusKey])
  const mapVisible = wide || !inputOpen || view === 'map'
  const select = (next: 'map' | 'input') => {
    setView(next)
    // A tab switch is presentation only: no submit, cancellation or reconfirmation.
    tabs.current[next === 'map' ? 0 : 1]?.focus({ preventScroll: true })
  }
  return <div ref={root} className={`map-input-workspace${inputOpen ? ' map-input-workspace--open' : ''}`}>
    {inputOpen && <div className="workspace-switch" role="tablist" aria-label={locale === 'ja' ? '地図と入力を切り替える' : 'Switch map and input'} hidden={wide}>
      {(['map', 'input'] as const).map((name, index) => <button key={name} ref={element => { tabs.current[index] = element }} type="button" role="tab" id={`${id}-${name}-tab`} aria-selected={view === name} aria-controls={`${id}-${name}`} tabIndex={view === name ? 0 : -1} onClick={() => select(name)} onKeyDown={event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); select(event.key === 'Home' ? 'map' : event.key === 'End' ? 'input' : view === 'map' ? 'input' : 'map') }
      }}>{name === 'map' ? (locale === 'ja' ? '地図を見る' : 'View map') : title}</button>)}
      <p>{locale === 'ja' ? '切り替えても入力を保持します' : 'Your inputs are kept when switching'}</p>
    </div>}
    <div id={`${id}-map`} tabIndex={-1} data-workspace-pane="map" className="workspace-map" hidden={!mapVisible} role={!wide && inputOpen ? 'tabpanel' : 'region'} aria-label={locale === 'ja' ? '訓練の地図' : 'Training map'} aria-labelledby={!wide && inputOpen ? `${id}-map-tab` : undefined}>
      <MapVisibility.Provider value={mapVisible}>{map}</MapVisibility.Provider>
    </div>
    <div id={`${id}-input`} tabIndex={-1} data-workspace-pane="input" className="workspace-input" hidden={!inputOpen || (!wide && view !== 'input')} role={!wide && inputOpen ? 'tabpanel' : 'region'} aria-label={title} aria-labelledby={!wide && inputOpen ? `${id}-input-tab` : undefined}>{children}</div>
  </div>
}
