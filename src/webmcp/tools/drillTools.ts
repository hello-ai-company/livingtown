import type {
  EvacuationRouteInput,
  RegisterHouseholdInput,
  ReportBottleneckInput,
  TownRepository,
} from '../../data/repository'
import type { ToolDefinition } from '../types'

export function drillTools(store: TownRepository): ToolDefinition[] {
  return [
    {
      name: 'register_household',
      title: 'Register drill household',
      description: 'Register a temporary drill household inside the LivingTown demonstration routing area. Send only constraint enums and temporary coordinates; never send diagnoses, names, contact details, or exact addresses. The server snaps the point to the demo graph.',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string', maxLength: 20 },
          constraints: { type: 'array', items: { type: 'string', enum: ['wheelchair', 'infant', 'elderly', 'pet'] } },
          start_lat: { type: 'number' },
          start_lng: { type: 'number' },
          location_scope: { type: 'string', enum: ['temporary_drill'], description: 'Mark this as a temporary drill session location.' },
        },
        required: ['constraints', 'start_lat', 'start_lng'],
      },
      readOnlyHint: false,
      run: async (input: RegisterHouseholdInput, context) => {
        const result = await store.registerHousehold(input, { signal: context.signal })
        await store.recordActivity('register_household', `${result.label ?? '匿名世帯'}を制約enumのみで登録`)
        return { household_id: result.id }
      },
    },
    {
      name: 'get_evacuation_route',
      title: 'Calculate evacuation route',
      description: 'Calculate a route within the LivingTown demonstration routing area using household constraints and verified community knowledge. Explain every avoided item to people.',
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
      run: async (input: EvacuationRouteInput, context) => {
        const result = await store.getEvacuationRoute(input, { signal: context.signal })
        await store.recordActivity('get_evacuation_route', `${result.eta_minutes}分の経路を計算。${result.avoided.length}件を回避・再評価`)
        return result
      },
    },
    {
      name: 'report_bottleneck',
      title: 'Report drill bottleneck',
      description: 'Report a narrow, uneven, or crowded point found during a drill inside the LivingTown demonstration routing area.',
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
      run: async (input: ReportBottleneckInput, context) => {
        const result = await store.reportBottleneck(input, { signal: context.signal })
        await store.recordActivity('report_bottleneck', `severity ${result.severity} の詰まりを報告`)
        return { id: result.id }
      },
    },
  ]
}
