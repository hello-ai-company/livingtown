import { useEffect, useState } from 'react'
import type { TownSnapshot } from '../sim/types'

interface Replay3DProps {
  snapshot: TownSnapshot
}

/**
 * Optional 3D boundary. The base product remains fully usable in 2D when the
 * PLATEAU tileset or Cesium package is not configured.
 */
export function Replay3D({ snapshot }: Replay3DProps) {
  const enabled = import.meta.env.VITE_ENABLE_3D === '1' && Boolean(import.meta.env.VITE_PLATEAU_TILESET)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle')

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setStatus('loading')
    const packageName = 'cesium'
    void import(/* @vite-ignore */ packageName)
      .then(() => {
        if (alive) setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('fallback')
      })
    return () => {
      alive = false
    }
  }, [enabled])

  if (!enabled || status === 'fallback') {
    return (
      <section className="replay3d-fallback">
        <div className="replay3d-fallback__mark">2D</div>
        <div>
          <span className="eyebrow">REPLAY LAYER</span>
          <h3>2Dリプレイで全編を確認できます</h3>
          <p>VITE_ENABLE_3D=1 と PLATEAU tileset URL を設定すると、ここがCesium 3Dレイヤーに切り替わります。現在の経路・カメラ操作は2Dで同じように検証できます。</p>
        </div>
        <span className="replay3d-fallback__count">{Object.keys(snapshot.routes).length} routes ready</span>
      </section>
    )
  }

  if (status === 'loading') {
    return <section className="replay3d-fallback"><div className="spinner" /><div><span className="eyebrow">3D LAYER</span><h3>PLATEAUを読み込んでいます</h3><p>都市モデルの初期化中です。読み込みが終わるまで2Dリプレイも利用できます。</p></div></section>
  }

  return (
    <section className="replay3d-placeholder">
      <span className="eyebrow">PLATEAU 3D TILES</span>
      <h3>デジタルツイン・リプレイ</h3>
      <p>Cesiumレイヤーが利用可能です。次の統合作業で世帯ごとのマーカーとカメラ操作を接続します。</p>
      <div className="replay3d-placeholder__bar"><span style={{ width: `${Math.max(14, Math.round((snapshot.replay.progress || 0) * 100))}%` }} /></div>
    </section>
  )
}
