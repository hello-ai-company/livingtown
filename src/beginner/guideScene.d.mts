export function validateGuideBinary(bytes: ArrayBuffer): unknown
export function mountGuide(host: HTMLElement, signal: AbortSignal, onFailure: () => void): Promise<{ dispose: () => void; turn: (delta: number) => void }>
