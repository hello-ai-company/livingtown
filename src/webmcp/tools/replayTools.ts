import type { ReplayControlInput, TownRepository } from '../../data/repository'
import type { ToolDefinition } from '../types'

export function replayTools(store: TownRepository): ToolDefinition[] {
  return [
    {
      name: 'control_replay',
      title: '3Dリプレイを操縦',
      description: '3Dまたは2Dリプレイのカメラと再生を操縦する。人間の口頭指示をカメラ操作に翻訳する。',
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
      title: '訓練の振り返りを取得',
      description: '訓練全体の集計（世帯別所要時間、ボトルネック、経路変更に寄与した暗黙知）を返す。',
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
