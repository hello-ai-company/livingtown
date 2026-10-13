import { useEffect, useRef, useState } from 'react'

export function BeginnerGuide() {
  const host = useRef<HTMLDivElement>(null)
  const control = useRef<{ dispose: () => void; turn: (delta: number) => void } | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [image, setImage] = useState(true)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController(); setStatus('loading')
    void import('./guideScene.mjs').then(module => module.mountGuide(host.current!, controller.signal, () => setStatus('unavailable'))).then(scene => {
      if (controller.signal.aborted) { scene.dispose(); return }
      control.current = scene; setStatus('ready')
    }).catch(() => { if (!controller.signal.aborted) setStatus('unavailable') })
    return () => { controller.abort(); control.current?.dispose(); control.current = undefined }
  }, [open])
  return <aside className="beginner-guide" aria-label="任意の人物イラスト">
    <div ref={host} className="beginner-guide-canvas" hidden={!open || status !== 'ready'} />
    {(!open || status !== 'ready') && (image ? <img src="/media/beginner-guide.png" width="140" height="170" alt="任意の架空人物イラスト" onError={() => setImage(false)} /> : <div className="beginner-guide-placeholder" aria-hidden="true">ようこそ</div>)}
    <p>架空の案内役です。見た目から配慮を決めません。</p>
    {status === 'loading' && <p role="status">任意の3Dを読み込み中。文字ボタンはそのまま使えます。</p>}
    {status === 'unavailable' && <p role="status">人物の3Dを利用できません。すべての操作を文字ボタンで続けられます。</p>}
    {open ? <><button className="text-button" onClick={() => { setOpen(false); setStatus('idle') }}>3Dを閉じる</button>{status === 'ready' && <button className="text-button" onClick={() => control.current?.turn(.35)}>人物の向きを変える（任意）</button>}</> : <button className="text-button" onClick={() => setOpen(true)}>人物を3Dで見る（任意）</button>}
  </aside>
}
