export {}

declare global {
  interface WebMcpToolContext {
    signal?: AbortSignal
  }

  interface WebMcpModelContext {
    registerTool: (
      tool: {
        name: string
        title?: string
        description: string
        inputSchema: Record<string, unknown>
        annotations?: Record<string, unknown>
        execute: (input: unknown, context?: WebMcpToolContext) => Promise<unknown> | unknown
      },
      options?: { signal?: AbortSignal; exposedTo?: string[] },
    ) => Promise<unknown> | unknown
    getTools?: (options?: { fromOrigins?: string[] }) => Promise<unknown[]>
    executeTool?: (tool: unknown, input: string, options?: { signal?: AbortSignal }) => Promise<unknown>
    addEventListener?: (type: string, listener: EventListener) => void
    removeEventListener?: (type: string, listener: EventListener) => void
  }

  interface Document {
    modelContext?: WebMcpModelContext
  }
}
