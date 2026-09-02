import type { Household, Knowledge, RouteResult } from '../sim/types'
import { createTranslator, type ExperienceMode, type Locale } from '../i18n'
import { KnowledgeDetailCard } from './KnowledgeDetailCard'
import { MAP_CATEGORY_ORDER, type KnowledgeVisualView } from './knowledgeVisuals'
import { activeFilterCount, type MapFilterState } from './mapFilters'
import type { MapSurface } from './Map2D'

export type MapFocusPanelTab = 'details' | 'filters'

interface MapFilterPanelProps {
  filters: MapFilterState
  locale: Locale
  mode: ExperienceMode
  onChange: (filters: MapFilterState) => void
}

function MapFilterPanel({ filters, locale, mode, onChange }: MapFilterPanelProps) {
  const t = createTranslator(locale)
  const update = <K extends keyof MapFilterState>(key: K, value: MapFilterState[K]) => {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div id="maplibre-filter-panel" className="map-filter-bar map-side-panel__filter-content" aria-label={t('map.filterPanel')}>
      <div className="map-filter-bar__status" role="group" aria-label={t('map.filterGroup')}>
        <span className="map-filter-bar__label">{t('map.filterLabel')}</span>
        {([
          ['all', t('map.all')],
          ['verified', t('map.verifiedOnly')],
          ['affecting_route', t('map.affecting')],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" className={filters.status === value ? 'is-active' : ''} aria-pressed={filters.status === value} onClick={() => update('status', value)}>{label}</button>
        ))}
      </div>
      {mode === 'advanced' && <label htmlFor="map-category" className="map-filter-bar__category">{t('map.category')}
        <select id="map-category" name="category" aria-label={t('map.category')} value={filters.category} onChange={(event) => update('category', event.target.value as MapFilterState['category'])}>
          <option value="all">{t('map.allSignals')}</option>
          {MAP_CATEGORY_ORDER.map((category) => <option key={category} value={category}>{category === 'bottleneck' ? t('map.bottleneck') : t(`category.${category}`)}</option>)}
        </select>
      </label>}
      <label htmlFor="map-group" className="map-filter-bar__category">{t('map.group')}
        <select id="map-group" name="group" aria-label={t('map.group')} value={filters.group} onChange={(event) => update('group', event.target.value as MapFilterState['group'])}>
          <option value="all">{t('map.groupAll')}</option>
          <option value="disaster">{t('map.groupDisaster')}</option>
          <option value="safety">{t('map.groupSafety')}</option>
          <option value="crime_harassment">{t('map.groupCrime')}</option>
          <option value="community">{t('map.groupCommunity')}</option>
        </select>
      </label>
      <label htmlFor="map-time" className="map-filter-bar__category">{t('map.time')}
        <select id="map-time" name="time" aria-label={t('map.time')} value={filters.time} onChange={(event) => update('time', event.target.value as MapFilterState['time'])}>
          <option value="now">{t('map.now')}</option>
          <option value="today">{t('map.today')}</option>
          <option value="this_week">{t('map.thisWeek')}</option>
          <option value="all">{t('map.allTime')}</option>
        </select>
      </label>
      {mode === 'advanced' && <label htmlFor="map-basemap" className="map-filter-bar__category">{t('map.basemap')}
        <select id="map-basemap" name="basemap" aria-label={t('map.basemap')} value={filters.basemap} onChange={(event) => update('basemap', event.target.value as MapFilterState['basemap'])}>
          <option value="auto">{t('map.basemapAuto')}</option>
          <option value="gsi">{t('map.basemapGsi')}</option>
          <option value="global">{t('map.basemapGlobal')}</option>
        </select>
      </label>}
    </div>
  )
}

function RouteContext({ route, surface, locale }: { route?: RouteResult; surface: MapSurface; locale: Locale }) {
  if (!route || surface === 'map') return null
  const t = createTranslator(locale)
  const isEnglish = locale === 'en'
  const routeLabel = isEnglish ? `${route.eta_minutes} min · ${Math.round(route.distance_m)} m` : `${route.eta_minutes}分 · 約${Math.round(route.distance_m)}m`
  return (
    <section className="map-side-panel__route-context" aria-label={t('map.storyEyebrow')}>
      <span className="eyebrow">{t('map.storyEyebrow')}</span>
      <strong>{routeLabel}</strong>
      {route.avoided.length > 0 ? <ul>{route.avoided.map((avoided) => <li key={avoided.knowledge_id}>{avoided.reason}</li>)}</ul> : <p>{isEnglish ? 'No confirmed hazard changes this route under the current conditions.' : '現在の条件では、確認済みの危険による回避はありません。'}</p>}
    </section>
  )
}

export interface MapFocusPanelProps {
  tab: MapFocusPanelTab
  selectedView?: KnowledgeVisualView
  selectedHousehold?: Household
  selectedRoute?: RouteResult
  surface: MapSurface
  locale: Locale
  mode: ExperienceMode
  filters: MapFilterState
  showFilters: boolean
  onTabChange: (tab: MapFocusPanelTab) => void
  onClose: () => void
  onClearSelection: () => void
  onFilterStateChange: (filters: MapFilterState) => void
  onVerifyKnowledge?: (knowledgeId: string, verdict: 'agree' | 'disagree') => void
  onEditKnowledge?: (knowledge: Knowledge) => void
  onDeleteKnowledge?: (knowledge: Knowledge) => void
}

export function MapFocusPanel({ tab, selectedView, selectedHousehold, selectedRoute, surface, locale, mode, filters, showFilters, onTabChange, onClose, onClearSelection, onFilterStateChange, onVerifyKnowledge, onEditKnowledge, onDeleteKnowledge }: MapFocusPanelProps) {
  const t = createTranslator(locale)
  const filterCount = activeFilterCount(filters, mode)
  return (
    <aside className="map-side-panel" aria-label={locale === 'en' ? 'Map details and filters' : '地図の詳細と絞り込み'}>
      <div className="map-side-panel__head">
        <div className="map-side-panel__tabs" role="tablist" aria-label={locale === 'en' ? 'Map tools' : '地図の操作'}>
          <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'is-active' : ''} onClick={() => onTabChange('details')}>{t('map.details')}</button>
          {showFilters && <button type="button" role="tab" aria-selected={tab === 'filters'} className={tab === 'filters' ? 'is-active' : ''} onClick={() => onTabChange('filters')}>{t('map.filters')}{filterCount > 0 && <span> · {filterCount}</span>}</button>}
        </div>
        <button type="button" className="map-side-panel__close" onClick={onClose} aria-label={t('map.panelClose')}>×</button>
      </div>
      <div className="map-side-panel__content">
        {tab === 'filters' && showFilters ? <MapFilterPanel filters={filters} locale={locale} mode={mode} onChange={onFilterStateChange} /> : <>
          <RouteContext route={selectedRoute} surface={surface} locale={locale} />
          {selectedView ? <>
            <KnowledgeDetailCard view={selectedView} selectedHousehold={selectedHousehold} locale={locale} mode={mode} onClose={onClose} onVerify={onVerifyKnowledge} onEdit={onEditKnowledge} onDelete={onDeleteKnowledge} />
            <button type="button" className="map-side-panel__clear" onClick={onClearSelection}>{t('map.clearSelection')}</button>
          </> : <p className="map-side-panel__empty">{t('map.noSelection')}</p>}
        </>}
      </div>
    </aside>
  )
}
