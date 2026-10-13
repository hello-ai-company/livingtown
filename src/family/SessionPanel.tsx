import { useEffect, useLayoutEffect, useRef, useState, type Dispatch } from 'react'
import { ANSWER_LABELS, purposeLabel, scenarioLabel } from '../beginner/model'
import { ALL_PREFERENCES, type FamilyAction, type FamilyState } from './model'
import { exportSession, MAX_SESSION_BYTES, SessionError, SessionImportReader, type SessionPreview } from './session'

interface Preview extends SessionPreview { expectedRevision: number; expectedDataRevision: number }
export function SessionPanel({ state, dispatch, onImported }: { state: FamilyState; dispatch: Dispatch<FamilyAction>; onImported?: () => void }) {
  const reader = useRef(new SessionImportReader())
  const current = useRef(state)
  const previousRevision = useRef(state.sessionRevision)
  const operationActive = useRef(false)
  const awaitingImport = useRef<{ sessionRevision: number; profileRevision: number; dataRevision: number } | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const downloadUrls = useRef(new Set<string>())
  const [reading, setReading] = useState(false)
  const [preview, setPreview] = useState<Preview>()
  const [confirmed, setConfirmed] = useState(false)
  const [exportConfirmed, setExportConfirmed] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    current.current = state
    if (previousRevision.current !== state.sessionRevision) {
      reader.current.cancel()
      setReading(false); setPreview(undefined); setConfirmed(false); setExportConfirmed(false)
      const expected = awaitingImport.current
      if (expected) {
        const applied = state.sessionRevision === expected.sessionRevision && state.profileRevision === expected.profileRevision && state.dataRevision === expected.dataRevision && state.walkingStopped
        if (applied) { setNotice('架空の条件を読み込みました。停止中です。全員の配慮を確認し、訓練を再開してから再計算・再採用してください。'); onImported?.() }
        else setError('確認後に訓練の状態が変わりました。読み込みを適用せず、現在の状態を保ちました。ファイルを選び直してください。')
      } else if (operationActive.current) setNotice('訓練の状態が変わったため、読み込みの確認を取り消しました。ファイルを選び直してください。')
      awaitingImport.current = undefined
      operationActive.current = false
      previousRevision.current = state.sessionRevision
    }
  }, [state, onImported])
  useEffect(() => {
    if (preview) previewHeading.current?.focus()
  }, [preview])
  useEffect(() => () => {
    reader.current.cancel()
    for (const url of downloadUrls.current) URL.revokeObjectURL(url)
    downloadUrls.current.clear()
  }, [])

  const cancel = () => {
    reader.current.cancel(); operationActive.current = false
    setReading(false); setPreview(undefined); setConfirmed(false); setError(''); setNotice('読み込みを取り消しました。現在の訓練は変更していません。')
    if (fileInput.current) fileInput.current.value = ''
    fileInput.current?.focus()
  }
  const chooseFile = async (file?: File) => {
    reader.current.cancel()
    setPreview(undefined); setConfirmed(false); setError(''); setNotice('')
    if (!file) { operationActive.current = false; setReading(false); return }
    const basis = current.current
    operationActive.current = true; setReading(true)
    try {
      const prepared = await reader.current.read(file, () => current.current.sessionRevision)
      if (!prepared) return
      setReading(false)
      setPreview({ ...prepared, expectedRevision: basis.profileRevision, expectedDataRevision: basis.dataRevision })
    } catch (failure) {
      operationActive.current = false; setReading(false)
      setError(failure instanceof SessionError ? failure.message : 'ファイルを読み込めませんでした。現在の訓練は変更していません。')
    }
  }
  const applyImport = () => {
    if (!preview || !confirmed) return
    const latest = current.current
    if (preview.expectedSessionRevision !== latest.sessionRevision || preview.expectedRevision !== latest.profileRevision || preview.expectedDataRevision !== latest.dataRevision) { cancel(); setError('訓練の状態が変わりました。ファイルを選び直してください。'); return }
    awaitingImport.current = { sessionRevision: latest.sessionRevision + 1, profileRevision: Math.max(latest.profileRevision, ...latest.members.map(member => member.revision), ...latest.removed.map(member => member.revision)) + 1, dataRevision: latest.dataRevision + 1 }
    dispatch({ type: 'importSession', text: preview.text, expectedRevision: preview.expectedRevision, expectedDataRevision: preview.expectedDataRevision, expectedSessionRevision: preview.expectedSessionRevision, confirmed: true })
  }
  const download = () => {
    if (!exportConfirmed) return
    setError(''); setNotice('')
    let url: string | undefined
    const link = document.createElement('a')
    try {
      const content = exportSession(current.current)
      url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }))
      downloadUrls.current.add(url)
      link.href = url; link.download = 'livingtown-fictional-session-v1.json'
      document.body.append(link); link.click()
      setExportConfirmed(false)
      setNotice('架空の条件ファイルのダウンロードを開始しました。保存先はブラウザーで確認してください。自動保存はしません。')
    } catch { setError('ファイルを作成できませんでした。現在の訓練は変更していません。') }
    finally {
      link.remove()
      if (url) {
        const savedUrl = url
        // Give the browser time to consume the local URL before revoking it.
        setTimeout(() => { URL.revokeObjectURL(savedUrl); downloadUrls.current.delete(savedUrl) }, 1000)
      }
    }
  }

  return <section className="family-session" aria-labelledby="family-session-title">
    <h2 id="family-session-title">架空の訓練条件をファイルで持ち運ぶ</h2>
    <p>自動保存・共有送信はしません。明示的に操作したときだけ、この端末でJSONを読み込み・ダウンロードします。本名・病名・自由文は扱いません。</p>
    <p>ファイルには架空の人数・災害・目的・配慮の選択だけが入ります。配慮は個人の事情を連想させる情報です。実在する人の情報を入れず、保存先・共有先には注意してください。確認済み状態・採用した案内・候補・住民投稿は含みません。</p>
    <div className="family-session-export">
      <label className="family-check"><input type="checkbox" checked={exportConfirmed} onChange={event => setExportConfirmed(event.target.checked)} />架空の選択だけを端末へ書き出し、ファイルの取り扱いに注意します</label>
      <button className="secondary-button" disabled={!exportConfirmed} onClick={download}>架空の訓練条件をJSONで書き出す</button>
    </div>
    <div className="family-session-import">
      <label htmlFor="family-session-file">架空の訓練ファイルを選ぶ（UTF-8 JSON・{MAX_SESSION_BYTES / 1024} KiB以下）</label>
      <input id="family-session-file" ref={fileInput} type="file" accept=".json,application/json" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void chooseFile(file) }} />
      {reading && <p role="status">ファイルを検査中です。現在の訓練はまだ変更しません。</p>}
      {(reading || preview) && <button className="secondary-button" onClick={cancel}>読み込みを取り消す</button>}
      {preview && <section aria-labelledby="session-preview-title">
        <h3 id="session-preview-title" tabIndex={-1} ref={previewHeading}>読み込む前の確認</h3>
        <p>{preview.session.members.length}人（全員架空）・{scenarioLabel(preview.session.scenario)}・{purposeLabel(preview.session.purpose)}</p>
        <ul>{preview.session.members.map((member, index) => <li key={index}><strong>{index === 0 ? '本人（架空）' : `家族${index}（架空）`}</strong><p>{ALL_PREFERENCES.map(need => `${need.label}：${ANSWER_LABELS[member.answers[need.id]]}`).join('／')}</p></li>)}</ul>
        <p>読み込むと現在の家族条件を置き換え、配慮の確認・比較結果・採用した案内・投稿・外した人・更新履歴を消去します。訓練は停止し、全員の再確認が必要です。</p>
        <label className="family-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />架空の条件と置き換えの範囲を確認しました</label>
        <button className="primary-button" disabled={!confirmed} onClick={applyImport}>確認して架空の条件を読み込む</button>
      </section>}
    </div>
    {error && <p className="family-warning" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
