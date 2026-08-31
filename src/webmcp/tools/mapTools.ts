import type { DeleteKnowledgeInput, QueryAreaInput, ContributeKnowledgeInput, UpdateKnowledgeInput, VerifyKnowledgeInput, TownRepository } from '../../data/repository'
import type { ToolDefinition } from '../types'

export function mapTools(store: TownRepository): ToolDefinition[] {
  const sharedMode = store.dataMode === 'SUPABASE_SHARED'
  const definitions: ToolDefinition[] = [
    {
      name: 'contribute_knowledge',
      title: '街の暗黙知を登録',
      description: '街の暗黙知を1件登録する。閲覧者との会話から得た事実を構造化して渡す。自由文には氏名・住所・電話番号・診断名などを含めない。本人の実体験は experienced、又聞きは heard、推測は guess とする。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'] },
          lat: { type: 'number', minimum: 20, maximum: 46.5 },
          lng: { type: 'number', minimum: 122, maximum: 154 },
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
      title: '街の暗黙知を削除',
      description: '現在の認証済み匿名identityが所有する暗黙知だけを削除する。confirm_delete=trueが必要で、所有権はserver-sideで判定する。削除すると既存の避難経路は無効になる。',
      inputSchema: {
        type: 'object',
        properties: {
          knowledge_id: { type: 'string' },
          confirm_delete: { type: 'boolean', const: true, description: '削除と経路の再計算が必要になることを確認する。' },
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
      title: '暗黙知を追認・反証',
      description: sharedMode
        ? '既存の暗黙知への追認または反証。共有モードでは認証済みSupabase identityからserver-sideでopaque pseudonymous verifier idを割り当てるため、verifier_idは入力しない。同じknowledgeへの同一identityの重複投票は無視する。'
        : '既存の暗黙知への追認または反証。ローカルデモではpseudonymous identifierを入力する。同じ暗黙知への同一識別子の重複投票は無視する。形式だけではPII非保持や本人性を保証しない。',
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
      title: '周辺の暗黙知を検索',
      description: '指定地点周辺の暗黙知を検索する。条件（雨・夜など）で絞り込める。',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number', minimum: 20, maximum: 46.5 },
          lng: { type: 'number', minimum: 122, maximum: 154 },
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
      title: '街の暗黙知を更新',
      description: '現在の認証済み匿名identityが所有する暗黙知だけを更新する。カテゴリ、座標、条件、説明、確度を検証し、票がある場合はconfirm_reverification_reset=trueで票をリセットして再検証を求める。owner_idは入力しない。',
      inputSchema: {
        type: 'object',
        properties: {
          knowledge_id: { type: 'string' },
          category: { type: 'string', enum: ['flood', 'darkness', 'narrow_path', 'barrier', 'safe_spot', 'other'] },
          lat: { type: 'number', minimum: 20, maximum: 46.5 },
          lng: { type: 'number', minimum: 122, maximum: 154 },
          condition: { type: 'string', enum: ['always', 'rain', 'night', 'crowded'] },
          description: { type: 'string', maxLength: 200 },
          confidence: { type: 'string', enum: ['experienced', 'heard', 'guess'] },
          confirm_reverification_reset: { type: 'boolean', description: '既存の票をリセットする場合にtrue。' },
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
