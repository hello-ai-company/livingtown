import { useEffect, useId, useRef, useState } from 'react'
import type { FamilyState } from '../family/model'
import { purposeLabel, scenarioLabel } from '../beginner/model'
import { buildTrainingReport, createWorkbookProgress, reconcileWorkbookProgress, setWorkbookMark, workbookBasis, workbookOverview, WORKBOOK_MARK_LABELS, WORKBOOK_SOURCES } from './workbook'
import './workbook.css'
import { HelpfulPreparation } from './HelpfulPreparation'
import { choosePreparation, createPreparationPlan, preparationSummary, reconcilePreparationPlan } from './helpful'

export function WorkbookPanel({ state }: { state: FamilyState }) {
  const id = useId()
  const [progress, setProgress] = useState(() => createWorkbookProgress(state))
  const [plan, setPlan] = useState(() => createPreparationPlan(state))
  const [exportMessage, setExportMessage] = useState('')
  const printFrame = useRef<HTMLIFrameElement | null>(null)
  const printTimer = useRef<number | undefined>(undefined)
  const basis = workbookBasis(state)
  const overview = workbookOverview(state, progress)
  const report = (stamp?: string) => buildTrainingReport(state, progress, stamp) + '\n' + preparationSummary(state, progress, plan)
  const preview = report()

  useEffect(() => {
    setProgress(previous => reconcileWorkbookProgress(previous, state))
    setPlan(previous => reconcilePreparationPlan(previous, state))
    setExportMessage('')
  }, [basis])
  useEffect(() => () => {
    printFrame.current?.remove()
    if (printTimer.current !== undefined) window.clearTimeout(printTimer.current)
  }, [])

  function downloadReport() {
    let url: string | undefined
    let anchor: HTMLAnchorElement | undefined
    try {
      const stamp = new Date().toISOString()
      url = URL.createObjectURL(new Blob([report(stamp)], { type: 'text/plain;charset=utf-8' }))
      anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `livingtown-fictional-training-${stamp.slice(0, 10)}.txt`
      anchor.hidden = true
      document.body.appendChild(anchor)
      anchor.click()
      setExportMessage('テキストの保存をブラウザーに依頼しました。保存先を確認してください。保存した写しに後の変更は反映されません。')
    } catch {
      setExportMessage('テキストを保存できませんでした。下の「レポートの内容」を開いて内容を確認できます。')
    } finally {
      anchor?.remove()
      if (url) { const released = url; window.setTimeout(() => URL.revokeObjectURL(released), 1000) }
    }
  }

  function printReport() {
    try {
      printFrame.current?.remove()
      if (printTimer.current !== undefined) window.clearTimeout(printTimer.current)
      const frame = document.createElement('iframe')
      frame.className = 'family-workbook-print-frame'
      frame.title = '架空の訓練レポートの印刷用フレーム'
      frame.setAttribute('aria-hidden', 'true')
      frame.tabIndex = -1
      document.body.appendChild(frame)
      printFrame.current = frame
      const printWindow = frame.contentWindow
      const printDocument = frame.contentDocument
      if (!printWindow || !printDocument) throw new Error('Print frame unavailable')
      printDocument.title = 'LivingTown 架空の訓練レポート'
      const style = printDocument.createElement('style')
      style.textContent = 'body{margin:18mm;color:#111;background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11pt/1.65 sans-serif}@page{margin:15mm}'
      printDocument.head.appendChild(style)
      const content = printDocument.createElement('pre')
      content.textContent = report(new Date().toISOString())
      printDocument.body.appendChild(content)
      const cleanup = () => { frame.remove(); if (printFrame.current === frame) printFrame.current = null }
      printWindow.addEventListener('afterprint', cleanup, { once: true })
      printWindow.focus()
      printWindow.print()
      printTimer.current = window.setTimeout(cleanup, 60000)
      setExportMessage('架空の訓練レポートの印刷をブラウザーに依頼しました。印刷画面が出ない場合はテキスト保存をご利用ください。')
    } catch {
      printFrame.current?.remove()
      printFrame.current = null
      setExportMessage('印刷画面を開けませんでした。テキスト保存、または下の「レポートの内容」をご利用ください。')
    }
  }

  return <section className="family-workbook" aria-labelledby={`${id}-title`}>
    <header className="family-workbook-header">
      <div><span className="family-workbook-eyebrow">架空の訓練 · 確認の準備</span><h2 id={`${id}-title`}>家族の準備ワークブック</h2><p>「何を、どこに確かめるか」を、家族全員の条件で話し合います。</p></div>
      <span className="family-workbook-mode">このタブだけ</span>
    </header>

    <div className="family-workbook-caution" id={`${id}-disclaimer`}>
      <strong>指定されていることと、いま開設・受入していることは別です。</strong>
      <p>チェックは訓練で話し合った記録です。安全・現地の通行・開設・受入を確認した意味ではありません。この画面は実際の避難案内には使えません。</p>
    </div>

    <div className="family-workbook-context" aria-label="現在の訓練条件">
      <span>{scenarioLabel(state.scenario)}</span><span>{purposeLabel(state.purpose)}</span><span>本人を含む{state.members.length}人</span><span>条件版{state.profileRevision}／投稿版{state.dataRevision}</span>
    </div>
    <ol className="family-workbook-steps" aria-label="この訓練の進み具合">
      {overview.steps.map((step, index) => <li key={step.id} data-done={step.done}>
        <span className="family-workbook-step-number" aria-hidden="true">{index + 1}</span>
        <div><strong>{step.label}</strong><span>{step.done ? 'この訓練で実施' : '未完了・要見直し'}</span><small>{step.detail}</small></div>
      </li>)}
    </ol>
    {overview.blockers.length > 0 && <div className="family-workbook-blockers"><h3>先に見直すこと</h3><ul>{overview.blockers.map(item => <li key={item}>{item}</li>)}</ul><p>候補がないときも、以下の確認項目を話し合う練習はできます。</p></div>}

    <div className="family-workbook-progress" role="status" aria-live="polite" aria-atomic="true">
      <strong>話し合った項目 {overview.discussedCount}／{overview.questions.length}</strong>
      {overview.staleCount > 0 && <p>条件・投稿・採用先などが変わったため、以前のチェック{overview.staleCount}件を外しました。現在の条件で再整理してください。</p>}
      {overview.discussedCount === overview.questions.length && <p>確認することをすべて訓練で整理しました。実際の施設情報は、引き続きすべて未確認です。</p>}
    </div>

    <HelpfulPreparation state={state} progress={progress} plan={plan}
      onChoose={(questionId, choice, expectedBasis) => setPlan(previous => choosePreparation(previous, state, questionId, choice, expectedBasis))}
      onOpen={questionId => { const target = document.getElementById(`${id}-${questionId}-title`); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start', behavior: 'auto' }) }} />

    <fieldset className="family-workbook-questions" aria-describedby={`${id}-disclaimer ${id}-memory`}>
      <legend>公式情報・窓口で確認すること</legend>
      {overview.questions.map((question, index) => <div className="family-workbook-question" data-status={question.status} key={question.id}>
        <div className="family-workbook-question-heading"><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h3 tabIndex={-1} id={`${id}-${question.id}-title`}>{question.title}</h3></div>
        <p id={`${id}-${question.id}-question`}>{question.question}</p>
        <p className="family-workbook-hint" id={`${id}-${question.id}-hint`}>{question.hint}</p>
        <label className="family-workbook-check">
          <input type="checkbox" checked={question.status === 'reviewed'} aria-describedby={`${id}-${question.id}-question ${id}-${question.id}-hint`}
            onChange={event => { const checked = event.currentTarget.checked; setProgress(previous => setWorkbookMark(previous, state, question.id, checked)) }} />
          <span>{question.title}：この確認項目を訓練で話し合った</span>
        </label>
        <span className="family-workbook-mark">{WORKBOOK_MARK_LABELS[question.status]}</span>
      </div>)}
    </fieldset>

    <div className="family-workbook-footer">
      <p id={`${id}-memory`}>個人情報の入力欄はありません。チェックはメモリ内だけで、再読み込みで消えます。家族の条件・投稿・採用先などが変わるとチェックを外し、再整理が必要になります。</p>
      <button type="button" className="family-workbook-button family-workbook-reset" disabled={overview.discussedCount === 0 && overview.staleCount === 0} onClick={() => { setProgress(createWorkbookProgress(state)); setExportMessage('ワークブックのチェックを最初からにしました。') }}>このチェックだけ最初から</button>
    </div>

    <section className="family-workbook-export" aria-labelledby={`${id}-report-title`}>
      <h3 id={`${id}-report-title`}>架空の訓練レポートを手元に</h3>
      <p>人数、訓練の進み具合、未確認事項、話し合いの記録をテキストにします。下のボタンを押したときだけ出力します。保存したファイルや印刷物は手元に残り、後の変更は反映されません。</p>
      <div className="family-workbook-actions"><button type="button" className="family-workbook-button" onClick={downloadReport}>訓練レポートをテキスト保存</button><button type="button" className="family-workbook-button" onClick={printReport}>訓練レポートを印刷</button></div>
      <p className="family-workbook-export-status" role="status" aria-live="polite">{exportMessage}</p>
      <details className="family-workbook-preview"><summary>レポートの内容（現在の状態）</summary><pre tabIndex={0} aria-label="架空の訓練レポートのプレビュー">{preview}</pre></details>
    </section>

    <aside className="family-workbook-sources" aria-labelledby={`${id}-sources-title`}><h3 id={`${id}-sources-title`}>制度を学ぶ公式資料</h3><p>個別施設の開設・受入情報ではありません。リンクを開くと、外部の内閣府サイトへ移動します。</p><ul>{WORKBOOK_SOURCES.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}（新しいタブ）</a></li>)}</ul></aside>
  </section>
}
