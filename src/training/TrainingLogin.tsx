import { useEffect, useState, useSyncExternalStore } from 'react'
import { trainingAuth } from './auth'

export function TrainingLogin() {
  const auth = useSyncExternalStore(trainingAuth.subscribe, trainingAuth.snapshot)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  useEffect(() => () => trainingAuth.cancel(), [])
  if (auth.phase === 'local') return null
  const submit = () => {
    const submitted = password; setPassword('')
    void trainingAuth.signIn(email, submitted)
  }
  return <section className="training-login" aria-label="訓練用ログイン">
    <h4>訓練用ログイン</h4>
    {auth.fake && <p>FAKE ログイン練習 / 外部接続なし。demo@example.test / demo を使用。30秒で期限切れになります。実際のパスワードは入力しないでください。</p>}
    <p>共有データの匿名ログインとは別です。このタブのメモリだけに保持し、再読み込み後は再ログインが必要です。</p>
    {auth.phase === 'signed_in' ? <><p role="status">ログイン済み</p><button className="secondary-button" onClick={() => { setEmail(''); setPassword(''); void trainingAuth.logout() }}>ログアウト</button></> : auth.phase !== 'unavailable' && <form onSubmit={event => { event.preventDefault(); submit() }}>
      <label>メールアドレス<input type="email" autoComplete="username" required value={email} disabled={auth.phase === 'signing_in'} onChange={event => setEmail(event.target.value)} /></label>
      <label>パスワード<input type="password" autoComplete="current-password" required value={password} disabled={auth.phase === 'signing_in'} onChange={event => setPassword(event.target.value)} /></label>
      <button className="secondary-button" type="submit" disabled={auth.phase === 'signing_in'}>ログイン</button>
      {auth.phase === 'signing_in' && <button className="secondary-button" type="button" onClick={() => { setPassword(''); trainingAuth.cancel() }}>ログインを中断</button>}
    </form>}
    {auth.message && <p role="status">{auth.message}</p>}
  </section>
}
