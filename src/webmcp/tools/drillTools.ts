import type {
  EvacuationRouteInput,
  LivingTownStore,
  RegisterHouseholdInput,
  ReportBottleneckInput,
} from '../../data/supabase'
import type { ToolDefinition } from '../types'

export function drillTools(store: LivingTownStore): ToolDefinition[] {
  return [
    {
      name: 'register_household',
      title: '訓練参加世帯を登録',
      description: '訓練参加世帯を登録する。プライバシー原則として制約enumとデモエリア内の一時座標だけを渡し、診断名・病名・氏名・メール・電話・正確な住所は持ち込まない。座標はサーバー側でデモグラフのノードへスナップされる。',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string', maxLength: 20 },
          constraints: { type: 'array', items: { type: 'string', enum: ['wheelchair', 'infant', 'elderly', 'pet'] } },
          start_lat: { type: 'number' },
          start_lng: { type: 'number' },
          location_scope: { type: 'string', enum: ['temporary_drill'], description: '一時的な訓練セッションの座標であることを明示する。' },
        },
        required: ['constraints', 'start_lat', 'start_lng'],
      },
      readOnlyHint: false,
      run: (input: RegisterHouseholdInput) => {
        const result = store.registerHousehold(input)
        store.recordActivity('register_household', `${result.label ?? '匿名世帯'}を制約enumのみで登録`)
        return { household_id: result.id }
      },
    },
    {
      name: 'get_evacuation_route',
      title: '避難経路を計算',
      description: '世帯の制約と検証済みの街の暗黙知を反映した避難経路を返す。avoided に回避理由が入るので、人間に必ず説明する。',
      inputSchema: {
        type: 'object',
        properties: {
          household_id: { type: 'string' },
          scenario: { type: 'string', enum: ['earthquake', 'flood'] },
          weather: { type: 'string', enum: ['clear', 'rain'] },
          time_of_day: { type: 'string', enum: ['day', 'night'] },
        },
        required: ['household_id', 'scenario', 'weather', 'time_of_day'],
      },
      readOnlyHint: false,
      run: (input: EvacuationRouteInput) => {
        const result = store.getEvacuationRoute(input)
        store.recordActivity('get_evacuation_route', `${result.eta_minutes}分の経路を計算。${result.avoided.length}件を回避・再評価`)
        return result
      },
    },
    {
      name: 'report_bottleneck',
      title: '現地の詰まりを報告',
      description: '訓練中に現地で見つかった詰まり（狭い・段差・人が滞留）を報告する。',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          severity: { type: 'integer', minimum: 1, maximum: 3 },
          description: { type: 'string', maxLength: 200 },
          household_id: { type: 'string' },
        },
        required: ['lat', 'lng', 'severity'],
      },
      readOnlyHint: false,
      run: (input: ReportBottleneckInput) => {
        const result = store.reportBottleneck(input)
        store.recordActivity('report_bottleneck', `severity ${result.severity} の詰まりを報告`)
        return { id: result.id }
      },
    },
  ]
}
