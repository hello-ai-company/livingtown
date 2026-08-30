import type { LivingTownStore } from '../data/supabase'

export type JsonSchema = Record<string, unknown>

export interface ToolExecutionContext {
  /**
   * Includes the active phase signal when the tool is invoked through the
   * WebMCP registry. Tool implementations should observe it before committing
   * any asynchronous mutation.
   */
  signal: AbortSignal
}

export interface ToolDefinition<TInput = unknown, TResult = unknown> {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  readOnlyHint: boolean
  run: (input: any, context: ToolExecutionContext) => Promise<TResult> | TResult
}

export type ToolsetPhase = 'map' | 'drill' | 'replay'

export type StoreBackedToolDefinition = ToolDefinition & { store: LivingTownStore }
