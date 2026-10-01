import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrainingAuth, passwordGateway, type SessionLease } from './auth'
const lease = (): SessionLease => ({ token: crypto.randomUUID(), expiresAt: Date.now() + 1000, revoke: vi.fn(async () => {}) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('memory-only training login', () => {
  it('fails closed when unavailable, expired or rejected; errors never reveal credentials', async () => {
    for (const session of [undefined, { ...lease(), expiresAt: Date.now() - 1 }]) {
      const auth = new TrainingAuth({ signIn: async () => { if (!session) throw Error('sensitive provider error'); return session } })
      await auth.signIn('example@test.invalid', 'sensitive-input')
      expect(auth.snapshot().phase).toBe('signed_out')
      expect(() => auth.authorization()).toThrow('AUTH_REQUIRED')
      expect(JSON.stringify(auth.snapshot())).not.toContain('sensitive')
    }
    expect(() => new TrainingAuth(undefined, 'unavailable').authorization()).toThrow()
  })
  it('coalesces double submissions, cancels and revokes late sessions', async () => {
    let resolve!: (session: SessionLease) => void
    const signIn = vi.fn(() => new Promise<SessionLease>(done => { resolve = done }))
    const auth = new TrainingAuth({ signIn })
    const pending = auth.signIn('demo', 'demo')
    await auth.signIn('demo', 'demo')
    expect(signIn).toHaveBeenCalledTimes(1)
    auth.cancel()
    const session = lease(); resolve(session); await pending
    expect(session.revoke).toHaveBeenCalledOnce()
    expect(auth.snapshot().phase).toBe('signed_out')
    expect(() => auth.authorization()).toThrow()
  })
  it('expires without refresh and clears authorization immediately on logout even if revoke fails', async () => {
    vi.useFakeTimers()
    const session = lease()
    const auth = new TrainingAuth({ signIn: async () => session })
    await auth.signIn('demo', 'demo')
    expect(auth.authorization()).toBe(`Bearer ${session.token}`)
    expect(JSON.stringify(auth.snapshot())).not.toContain(session.token)
    vi.advanceTimersByTime(1001)
    expect(() => auth.authorization()).toThrow()
    expect(auth.snapshot().message).toContain('有効期限')
    const other = new TrainingAuth({ signIn: async () => ({ ...lease(), revoke: async () => { throw Error('sensitive') } }) })
    await other.signIn('demo', 'demo'); const logout = other.logout()
    expect(() => other.authorization()).toThrow()
    await logout
    expect(other.snapshot().message).toContain('失効確認はできません')
  })
  it('keeps a session across component subscriptions, but a new page/store cannot restore it', async () => {
    const session = lease(); const auth = new TrainingAuth({ signIn: async () => session })
    const unsubscribe = auth.subscribe(() => {})
    await auth.signIn('demo', 'demo'); unsubscribe()
    const revisit = auth.subscribe(() => {})
    expect(auth.authorization()).toBeTruthy()
    expect(() => new TrainingAuth().authorization()).toThrow()
    revisit(); await auth.logout()
  })
  it('a stale login cannot overwrite a newer attempt', async () => {
    let complete!: (s: SessionLease) => void
    let count = 0
    const newer = lease()
    const auth = new TrainingAuth({ signIn: async () => ++count === 1 ? new Promise<SessionLease>(done => { complete = done }) : newer })
    const first = auth.signIn('demo', 'demo'); auth.cancel(); await auth.signIn('demo', 'demo')
    const stale = lease(); complete(stale); await first
    expect(auth.authorization()).toBe(`Bearer ${newer.token}`)
    expect(stale.revoke).toHaveBeenCalledOnce()
    await auth.logout()
  })
  it('validates the fixed Supabase origin before handling credentials', () => {
    for (const origin of ['http://test.supabase.co', 'https://test.supabase.co.evil', 'https://x@y.supabase.co', 'https://test.supabase.co/']) expect(() => passwordGateway(origin, 'public')).toThrow()
  })
  it('uses existing SDK password/login/logout with no browser persistence or token-bearing redirects', async () => {
    const token = crypto.randomUUID()
    const requests: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url).includes('/logout')) return new Response('{}', { status: 200 })
      return new Response(JSON.stringify({ access_token: token, refresh_token: crypto.randomUUID(), expires_in: 60, token_type: 'bearer', user: { id: crypto.randomUUID(), aud: 'authenticated', created_at: new Date().toISOString(), is_anonymous: false } }), { status: 200 })
    }))
    const gateway = passwordGateway('https://example.supabase.co', 'mock-public')
    const session = await gateway.signIn('demo@example.test', 'demo', new AbortController().signal)
    expect(session.token).toBe(token)
    expect(requests[0].url).toBe('https://example.supabase.co/auth/v1/token?grant_type=password')
    expect(requests[0].init?.redirect).toBe('error')
    await session.revoke()
    expect(requests[1].url).toBe('https://example.supabase.co/auth/v1/logout?scope=local')
    expect(requests[1].init?.redirect).toBe('error')
  })
})
