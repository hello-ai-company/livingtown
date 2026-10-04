import { useEffect, useRef, useState } from 'react'

/** Decorative Blender clip; operation text is the only source of status. */
export function WaitingIllustration() {
  const root = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const [allowed, setAllowed] = useState(false)
  const [visible, setVisible] = useState(false)
  const [paused, setPaused] = useState(false)
  const [ended, setEnded] = useState(false)
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection
    const update = () => setAllowed(!motion.matches && !connection?.saveData && document.visibilityState === 'visible')
    update()
    motion.addEventListener('change', update)
    connection?.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false))
    if (root.current) observer?.observe(root.current)
    return () => { observer?.disconnect(); motion.removeEventListener('change', update); connection?.removeEventListener('change', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  const play = allowed && visible && !paused && !ended
  useEffect(() => {
    if (play) started.current = true
    else if (started.current) setEnded(true)
  }, [play])
  return <div ref={root} className="waiting-illustration" data-playing={play}>
    <div className="waiting-illustration__art" aria-hidden="true">
      {play ? <video width="144" height="96" autoPlay muted playsInline preload="none" poster="/media/training-guide.webp" onEnded={() => setEnded(true)} onError={() => setEnded(true)}>
        <source src="/media/training-guide.webm" type="video/webm" />
        <source src="/media/training-guide.mp4" type="video/mp4" />
      </video> : <img width="144" height="96" src="/media/training-guide.webp" alt="" />}
    </div>
    <div><small>街のイラスト · 進捗や経路を表すものではありません</small>{play && <button type="button" className="text-button" onClick={() => setPaused(true)}>動きを止める</button>}</div>
  </div>
}
