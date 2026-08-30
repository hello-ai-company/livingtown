import type { LivingTownStore } from '../data/supabase'

export type JsonSchema = Record<string, unknown>

export interface ToolDefinition<TInput = unknown, TResult = unknown> {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  readOnlyHint: boolean
  run: (input: any, context?: { signal?: AbortSignal }) => Promise<TResult> | TResult
}

export type ToolsetPhase = 'map' | 'drill' | 'replay'

export type StoreBackedToolDefinition = ToolDefinition & { store: LivingTownStore }
