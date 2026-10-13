import { activeIsCurrent, confirmedMember, eligibleIds, type FamilyState } from '../family/model'
export type GuideIconName = 'people' | 'compare' | 'check' | 'stop' | 'info' | 'save' | 'experiment' | 'arrow'
export function nextGuide(state: FamilyState) {
  const remaining = state.members.filter(member => !confirmedMember(member)).length
  if (state.walkingStopped) return { step: 1, icon: 'stop' as const, title: '歩行の訓練は停止中', detail: remaining ? `まず${remaining}人の配慮を確認し直してください。再開には状況の見直しと明示確認が必要です。` : '全員の配慮を確認しました。状況を見直し、再開を明示してください。', target: remaining ? 'family-members-title' : 'emergency-title', action: remaining ? '家族を確認' : '再開条件を見る' }
  if (state.dataError) return { step: 2, icon: 'info' as const, title: '情報を確認できません', detail: state.dataError, target: 'family-data-error', action: '問題を確認' }
  if (remaining) return { step: 1, icon: 'people' as const, title: '一緒に移動する人の配慮を選ぶ', detail: `あと${remaining}人の確認が必要です。わからない項目は未知のまま残せます。`, target: 'family-members-title', action: '家族を確認' }
  if (!state.latest || state.latest.profileRevision !== state.profileRevision || state.latest.dataRevision !== state.dataRevision) return { step: 2, icon: 'compare' as const, title: '災害と目的を選び、候補を比べる', detail: '全員の条件と投稿の時点を確認してから計算します。変更後は再確認が必要です。', target: 'family-conditions-title', action: '比較へ進む' }
  if (!eligibleIds(state.latest).length) return { step: 2, icon: 'info' as const, title: '全員の条件を満たす候補はありません', detail: '除外理由と未確認事項を見直してください。条件を自動で緩めることはありません。', target: 'family-results-title', action: '理由を確認' }
  if (!activeIsCurrent(state)) return { step: 2, icon: 'compare' as const, title: state.active ? '変更後の候補を再確認する' : '候補の理由と未確認事項を見る', detail: '訓練で採用する道は本人が選びます。実際の通行や受入はすべて未確認です。', target: 'family-results-title', action: '候補を見る' }
  return { step: 3, icon: 'check' as const, title: '実際に確認することを整理する', detail: '訓練の候補を選びました。準備チェックとレポートで、現地や行政への確認事項を整理しましょう。安全確認の完了ではありません。', target: 'family-workbook-area', action: '準備へ進む' }
}
