import type { ReplayControlInput, TownRepository } from '../../data/repository'
import type { ToolDefinition } from '../types'

export function replayTools(store: TownRepository): ToolDefinition[] {
  return [
    {
      name: 'control_replay',
      title: 'Control drill replay',
      description: 'Control the camera and playback of the 3D or 2D drill replay for the LivingTown demonstration area. Translate human instructions into camera actions.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['overview', 'focus_household', 'replay_route', 'highlight_bottleneck', 'pause', 'resume'] },
          target_id: { type: 'string' },
        },
        required: ['action'],
      },
      readOnlyHint: false,
      run: async (input: ReplayControlInput, context) => {
        const result = await store.controlReplay(input, { signal: context.signal })
        await store.recordActivity('control_replay', `リプレイを${result.now_showing}へ移動`)
        return result
      },
    },
    {
      name: 'get_debrief_summary',
      title: 'Get drill debrief summary',
      description: 'Return a debrief for the LivingTown demonstration area, including household times, bottlenecks, and community knowledge that changed routes.',
      inputSchema: { type: 'object', properties: {} },
      readOnlyHint: true,
      run: async (_input: unknown, context) => {
        const result = await store.getDebriefSummary({ signal: context.signal })
        await store.recordActivity('get_debrief_summary', `${result.households.length}世帯の振り返りを集計`)
        return result
      },
    },
  ]
}
