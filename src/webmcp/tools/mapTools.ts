import type { DeleteKnowledgeInput, QueryAreaInput, ContributeKnowledgeInput, UpdateKnowledgeInput, VerifyKnowledgeInput, TownRepository } from '../../data/repository'
import { WORLD_MAP_BOUNDS } from '../../map/basemaps'
import type { ToolDefinition } from '../types'

export function mapTools(store: TownRepository): ToolDefinition[] {
  const sharedMode = store.dataMode === 'SUPABASE_SHARED'
  const definitions: ToolDefinition[] = [
    {
      name: 'contribute_knowledge',
      title: 'Contribute community knowledge',
      description: 'Create one community knowledge report at any supported location worldwide. Keep personal data out of free text and label the source as experienced, heard, or guess.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'] },
          lat: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLat, maximum: WORLD_MAP_BOUNDS.maxLat, description: 'Latitude in Web Mercator-supported world bounds.' },
          lng: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLng, maximum: WORLD_MAP_BOUNDS.maxLng, description: 'Longitude in world bounds.' },
          condition: { type: 'string', enum: ['always', 'rain', 'night', 'crowded'] },
          description: { type: 'string', maxLength: 200 },
          confidence: { type: 'string', enum: ['experienced', 'heard', 'guess'] },
        },
        required: ['category', 'lat', 'lng', 'condition', 'description', 'confidence'],
      },
      readOnlyHint: false,
      run: async (input: ContributeKnowledgeInput, context) => {
        const result = await store.contributeKnowledge(input, { signal: context.signal })
        await store.recordActivity('contribute_knowledge', `新しい暗黙知「${result.description}」を登録`)
        return { id: result.id, status: 'pending_verification', verifiedThreshold: 2 }
      },
    },
    {
      name: 'delete_knowledge',
      title: 'Delete community knowledge',
      description: 'Delete only a report owned by the current authenticated identity. The server checks ownership, requires confirm_delete=true, and invalidates routes that used the report.',
      inputSchema: {
        type: 'object',
        properties: {
          knowledge_id: { type: 'string' },
          confirm_delete: { type: 'boolean', const: true, description: 'Explicitly confirm deletion and route recalculation.' },
        },
        required: ['knowledge_id', 'confirm_delete'],
      },
      readOnlyHint: false,
      run: async (input: DeleteKnowledgeInput, context) => {
        const result = await store.deleteKnowledge(input, { signal: context.signal })
        await store.recordActivity('delete_knowledge', '所有する暗黙知を削除。避難経路の再計算が必要')
        return result
      },
    },
    {
      name: 'verify_knowledge',
      title: 'Verify community knowledge',
      description: sharedMode
        ? 'Confirm or dispute an existing report. In shared mode the server derives an opaque verifier identity from the authenticated session; do not provide verifier_id. Duplicate votes from the same identity are ignored.'
        : 'Confirm or dispute an existing report in the local demo using a pseudonymous verifier fixture. Duplicate votes from the same fixture are ignored; the format alone does not prove identity or prevent personal data.',
      inputSchema: {
        type: 'object',
        properties: {
          knowledge_id: { type: 'string' },
          ...(sharedMode ? {} : { verifier_id: { type: 'string', pattern: '^anon-[A-Za-z0-9][A-Za-z0-9_-]{2,63}$' } }),
          verdict: { type: 'string', enum: ['agree', 'disagree'] },
          comment: { type: 'string', maxLength: 200 },
        },
        required: sharedMode ? ['knowledge_id', 'verdict'] : ['knowledge_id', 'verifier_id', 'verdict'],
      },
      readOnlyHint: false,
      run: async (input: VerifyKnowledgeInput, context) => {
        const result = await store.verifyKnowledge(input, { signal: context.signal })
        await store.recordActivity(
          'verify_knowledge',
          result.duplicate
            ? `同じidentityの重複投票を無視。現在の追認${result.agree_count}件`
            : `${input.verdict === 'agree' ? '追認' : '反証'}を記録。現在の追認${result.agree_count}件`,
        )
        return result
      },
    },
    {
      name: 'query_area',
      title: 'Query community knowledge',
      description: 'Search community observations around a geographic point anywhere in the supported world, optionally filtering by category and condition.',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLat, maximum: WORLD_MAP_BOUNDS.maxLat, description: 'Latitude in Web Mercator-supported world bounds.' },
          lng: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLng, maximum: WORLD_MAP_BOUNDS.maxLng, description: 'Longitude in world bounds.' },
          radius_m: { type: 'number', maximum: 2000 },
          category: { type: 'string', enum: ['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'] },
          condition: { type: 'string', enum: ['always', 'rain', 'night', 'crowded'] },
        },
        required: ['lat', 'lng', 'radius_m'],
      },
      readOnlyHint: true,
      run: async (input: QueryAreaInput, context) => {
        const result = await store.queryArea(input, { signal: context.signal })
        await store.recordActivity('query_area', `${result.length}件の暗黙知を周辺検索`)
        return { items: result }
      },
    },
    {
      name: 'update_knowledge',
      title: 'Update community knowledge',
      description: 'Update only a report owned by the current authenticated identity. The server checks ownership, accepts worldwide coordinates, and requires confirm_reverification_reset=true when existing votes must be reset. Never send owner_id.',
      inputSchema: {
        type: 'object',
        properties: {
          knowledge_id: { type: 'string' },
          category: { type: 'string', enum: ['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'] },
          lat: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLat, maximum: WORLD_MAP_BOUNDS.maxLat, description: 'Latitude in Web Mercator-supported world bounds.' },
          lng: { type: 'number', minimum: WORLD_MAP_BOUNDS.minLng, maximum: WORLD_MAP_BOUNDS.maxLng, description: 'Longitude in world bounds.' },
          condition: { type: 'string', enum: ['always', 'rain', 'night', 'crowded'] },
          description: { type: 'string', maxLength: 200 },
          confidence: { type: 'string', enum: ['experienced', 'heard', 'guess'] },
          confirm_reverification_reset: { type: 'boolean', description: 'Set true to reset existing votes and require fresh verification.' },
        },
        required: ['knowledge_id', 'category', 'lat', 'lng', 'condition', 'description', 'confidence'],
      },
      readOnlyHint: false,
      run: async (input: UpdateKnowledgeInput, context) => {
        const result = await store.updateKnowledge(input, { signal: context.signal })
        await store.recordActivity('update_knowledge', result.reverification_required ? '暗黙知を更新し、再検証を要求' : '暗黙知を更新')
        return result
      },
    },
  ]
  const order = ['contribute_knowledge', 'delete_knowledge', 'query_area', 'update_knowledge', 'verify_knowledge']
  return order.map((name) => definitions.find((tool) => tool.name === name)!).filter(Boolean)
}
