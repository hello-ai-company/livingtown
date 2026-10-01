import { createClient } from '@supabase/supabase-js'

export type SessionLease = { token: string; expiresAt: number; revoke: () => Promise<void> }
export type PasswordGateway = { signIn: (email: string, password: string, signal: AbortSignal) => Promise<SessionLease> }
type AuthSnapshot = { phase: 'local' | 'unavailable' | 'signed_out' | 'signing_in' | 'signed_in'; revision: number; message: string; fake: boolean }

// One memory-only session per tab. React/public snapshots never contain credentials.
export class TrainingAuth {
  private state: AuthSnapshot
  private listeners = new Set<() => void>()
  private session?: SessionLease
  private pending?: AbortController
  private timer?: ReturnType<typeof setTimeout>
  constructor(private gateway?: PasswordGateway, mode: 'local' | 'unavailable' | 'enabled' = 'enabled', fake = false) {
    this.state = { phase: mode === 'enabled' ? 'signed_out' : mode, revision: 0, message: mode === 'unavailable' ? 'ログイン設定が不足しています。管理者に接続設定を確認してください。' : '', fake }
  }
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(phase: AuthSnapshot['phase'], message = '') {
    this.state = { ...this.state, phase, message, revision: this.state.revision + 1 }
    for (const listener of this.listeners) listener()
  }
  cancel = () => {
    if (!this.pending) return
    this.pending.abort(); this.pending = undefined
    this.update('signed_out', 'ログインを中断しました。')
  }
  signIn = async (email: string, password: string) => {
    if (!this.gateway || this.pending || this.state.phase !== 'signed_out') return
    const controller = new AbortController(); this.pending = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
    this.update('signing_in')
    try {
      const session = await this.gateway.signIn(email, password, signal)
      if (signal.aborted || this.pending !== controller) {
        void session.revoke().catch(() => {})
        if (this.pending === controller && !controller.signal.aborted) this.update('signed_out', 'ログインがタイムアウトしました。')
        return
      }
      if (!session.token || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw Error('expired')
      this.session = session
      this.timer = setTimeout(this.expire, Math.min(session.expiresAt - Date.now(), 2147483647))
      this.update('signed_in')
    } catch {
      if (this.pending === controller && !controller.signal.aborted) this.update('signed_out', 'ログインできませんでした。入力・接続・アカウント設定を確認してください。')
    } finally { if (this.pending === controller) this.pending = undefined }
  }
  private expire = () => {
    if (this.session && this.session.expiresAt <= Date.now()) {
      this.session = undefined; clearTimeout(this.timer)
      this.update('signed_out', 'ログインの有効期限が切れました。再ログインしてください。')
    }
  }
  authorization = (): string | undefined => {
    if (this.state.phase === 'local') return undefined
    this.expire()
    if (!this.session || this.state.phase !== 'signed_in') throw Error('AUTH_REQUIRED')
    return `Bearer ${this.session.token}`
  }
  rejectSession = () => {
    this.session = undefined; clearTimeout(this.timer)
    this.update('signed_out', 'ログインの有効性または利用許可を確認できません。再ログインし、管理者に許可設定を確認してください。')
  }
  logout = async () => {
    this.pending?.abort(); this.pending = undefined
    const session = this.session; this.session = undefined; clearTimeout(this.timer)
    this.update('signed_out', 'この画面からログアウトしました。')
    const revision = this.state.revision
    try { await session?.revoke() } catch {
      if (this.state.revision === revision) this.update('signed_out', 'この画面からログアウトしました。サーバー側の失効確認はできませんでした。')
    }
  }
}

export function passwordGateway(origin: string, publicKey: string): PasswordGateway {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin) || !publicKey) throw Error('CONFIG_REQUIRED')
  return { signIn: async (email, password, signal) => {
    const client = createClient(origin, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'livingtown-training-memory' },
      global: { fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal }) },
    })
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session || data.user?.is_anonymous !== false || !data.session.expires_at) throw Error('AUTH_REQUIRED')
    const token = data.session.access_token
    return {
      token, expiresAt: data.session.expires_at * 1000,
      revoke: async () => {
        // SDK signOut may refresh a near-expiry session first. Revoke this session
        // directly without keeping a refresh token or making any refresh request.
        const response = await fetch(`${origin}/auth/v1/logout?scope=local`, {
          method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
          redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) throw Error('LOGOUT_UNAVAILABLE')
      },
    }
  } }
}

function configuredAuth() {
  const mode = import.meta.env.VITE_TRAINING_AUTH_MODE
  if (!mode && !import.meta.env.VITE_TRAINING_API_ORIGIN) return new TrainingAuth(undefined, 'local')
  if (mode === 'fake' && import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname) && !import.meta.env.VITE_TRAINING_API_ORIGIN) {
    return new TrainingAuth({ signIn: async (email, password, signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 500)
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(Error('cancelled')) }, { once: true })
      })
      if (email !== 'demo@example.test' || password !== 'demo') throw Error('mock failure')
      return { token: crypto.randomUUID(), expiresAt: Date.now() + 30000, revoke: async () => {} }
    } }, 'enabled', true)
  }
  if (mode === 'supabase') {
    try { return new TrainingAuth(passwordGateway(import.meta.env.VITE_TRAINING_AUTH_ORIGIN || '', import.meta.env.VITE_TRAINING_AUTH_PUBLIC_KEY || '')) } catch { /* fail closed */ }
  }
  return new TrainingAuth(undefined, 'unavailable')
}
export const trainingAuth = configuredAuth()
