export function questionEndpoint(origin = ''): string {
  if (!origin) return '/api/training/questions'
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('質問サービスのURL設定を確認してください。HTTPSのoriginのみ指定できます。')
  return `${origin}/api/training/questions`
}

// Static preview only; never turn failed authentication/API calls into fake success.
export function canUseOfflineQuestions(production: boolean, apiOrigin: string | undefined, authMode: string | undefined, dataMode: string): boolean {
  return production && !apiOrigin && !authMode && dataMode === 'LOCAL_DEMO'
}
