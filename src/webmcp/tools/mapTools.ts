import type { QueryAreaInput, ContributeKnowledgeInput, LivingTownStore, VerifyKnowledgeInput } from '../../data/supabase'
import type { ToolDefinition } from '../types'

export function mapTools(store: LivingTownStore): ToolDefinition[] {
  return [
    {
      name: 'contribute_knowledge',
      title: '街の暗黙知を登録',
      description: '街の暗黙知を1件登録する。閲覧者との会話から得た事実を構造化して渡す。本人の実体験は experienced、又聞きは heard、推測は guess とする。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'] },
          lat: { type: 'number' },
          lng: { type: 'number' },
          condition: { type: 'string', enum: ['always', 'rain', 'night', 'crowded'] },
          description: { type: 'string', maxLength: 200 },
          confidence: { type: 'string', enum: ['experienced', 'heard', 'guess'] },
        },
        required: ['category', 'lat', 'lng', 'condition', 'description', 'confidence'],
      },
      readOnlyHint: false,
      run: (input: ContributeKnowledgeInput) => {
        const result = store.contributeKnowledge(input)
        store.recordActivity('contribute_knowledge', `新しい暗黙知「${result.description}」を登録`)
        return { id: result.id, status: 'pending_verification', verifiedThreshold: 2 }
      },
    },
    {
      name: 'verify_knowledge',
      title: '暗黙知を追認・反証',
      description: '既存の暗黙知への追認または反証。閲覧者本人の知見に基づく場合に使う。',
      inputSchema: {
        type: 'object',
        properties: {
          knowledge_id: { type: 'string' },
          verdict: { type: 'string', enum: ['agree', 'disagree'] },
          comment: { type: 'string', maxLength: 200 },
        },
        required: ['knowledge_id', 'verdict'],
      },
      readOnlyHint: false,
      run: (input: VerifyKnowledgeInput) => {
        const result = store.verifyKnowledge(input)
        store.recordActivity('verify_knowledge', `${input.verdict === 'agree' ? '追認' : '反証'}を記録。現在の追認${result.agree_count}件`)
        return result
      },
    },
    {
      name: 'query_area',
      title: '周辺の暗黙知を検索',
      description: '指定地点周辺の暗黙知を検索する。条件（雨・夜など）で絞り込める。',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius_m: { type: 'number', maximum: 2000 },
          category: { type: 'string', enum: ['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'] },
          condition: { type: 'string', enum: ['always', 'rain', 'night', 'crowded'] },
        },
        required: ['lat', 'lng', 'radius_m'],
      },
      readOnlyHint: true,
      run: (input: QueryAreaInput) => {
        const result = store.queryArea(input)
        store.recordActivity('query_area', `${result.length}件の暗黙知を周辺検索`)
        return { items: result }
      },
    },
  ]
}
