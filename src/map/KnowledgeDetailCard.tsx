import type { Household } from '../sim/types'
import { DEMO_GRAPH_EDGES } from '../sim/graph'
import { KNOWLEDGE_STATUS_LABEL, type KnowledgeVisualView } from './knowledgeVisuals'

const CONSTRAINT_LABEL: Record<Household['constraints'][number], string> = {
  wheelchair: '車椅子',
  infant: '乳児',
  elderly: '高齢者',
  pet: 'ペット',
}

interface KnowledgeDetailCardProps {
  view: KnowledgeVisualView
  selectedHousehold?: Household
  onClose: () => void
}

export function KnowledgeDetailCard({ view, selectedHousehold, onClose }: KnowledgeDetailCardProps) {
  const { item, config } = view
  const routeImpact = view.affectsCurrentRoute
  const affectedEdges = view.affectedEdgeIds.map((edgeId) => DEMO_GRAPH_EDGES.find((edge) => edge.id === edgeId)).filter((edge): edge is (typeof DEMO_GRAPH_EDGES)[number] => Boolean(edge))
  const householdLabel = selectedHousehold?.label ?? (selectedHousehold ? '匿名世帯' : '未選択')
  const householdConstraints = selectedHousehold?.constraints.map((constraint) => CONSTRAINT_LABEL[constraint]).join(' · ') || '制約なし'

  return (
    <aside className="knowledge-detail-card" role="dialog" aria-labelledby="knowledge-detail-title">
      <div className="knowledge-detail-card__head">
        <div className={`knowledge-detail-card__icon knowledge-detail-card__icon--${config.visualType}`} aria-hidden="true">{config.icon}</div>
        <div className="knowledge-detail-card__heading">
          <span className="eyebrow">KNOWLEDGE DETAIL</span>
          <h3 id="knowledge-detail-title">{config.label}</h3>
        </div>
        <button className="knowledge-detail-card__close" type="button" onClick={onClose} aria-label="知識の詳細を閉じる">×</button>
      </div>

      <div className={`knowledge-detail-card__status knowledge-detail-card__status--${view.state}`}>
        <span>{KNOWLEDGE_STATUS_LABEL[view.state]}</span>
        {routeImpact && <strong>この情報により迂回</strong>}
      </div>

      <p className="knowledge-detail-card__description">{item.description}</p>

      <dl className="knowledge-detail-card__facts">
        <div><dt>条件</dt><dd>{item.condition === 'always' ? 'いつも' : item.condition === 'rain' ? '雨の日' : item.condition === 'night' ? '夜' : '混雑時'}</dd></div>
        <div><dt>確度</dt><dd>{item.confidence === 'experienced' ? '実体験' : item.confidence === 'heard' ? '聞いた話' : '推測'}</dd></div>
        <div><dt>追認</dt><dd>{item.agree_count}</dd></div>
        <div><dt>反証</dt><dd>{item.disagree_count}</dd></div>
        <div><dt>net score</dt><dd>{view.netScore}</dd></div>
        <div><dt>状態</dt><dd>{view.verified ? 'verified' : 'pending'}</dd></div>
      </dl>

      <div className="knowledge-detail-card__route">
        <span className="eyebrow">CURRENT ROUTE IMPACT</span>
        {routeImpact ? (
          <>
            <strong>{householdLabel} · {householdConstraints}</strong>
            <p>{view.avoidedReason ?? '選択中の経路でこの知識を反映しました。'}</p>
            <div className="knowledge-detail-card__edges">
              <span>避けたedge</span>
              {affectedEdges.length > 0 ? affectedEdges.map((edge) => <span key={edge.id} className="edge-chip">{edge.label}</span>) : <span className="edge-chip">edge情報なし</span>}
            </div>
          </>
        ) : (
          <>
            <strong>選択中の経路には影響していません</strong>
            <p>{view.verified ? '検証済みですが、現在の条件ではrouteの変更理由になっていません。' : 'まだthreshold未達のため、routeには反映されません。'}</p>
          </>
        )}
      </div>

      <p className="knowledge-detail-card__privacy">community knowledgeの自由文には氏名・住所・電話番号・診断名などを含めないでください。</p>
    </aside>
  )
}
