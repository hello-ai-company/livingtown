export function questionEndpoint(origin = ''): string {
  if (!origin) return '/api/training/questions'
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('質問サービスのURL設定を確認してください。HTTPSのoriginのみ指定できます。')
  return `${origin}/api/training/questions`
}
