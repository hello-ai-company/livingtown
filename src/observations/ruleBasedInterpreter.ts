import type { KnowledgeCategory, KnowledgeCondition, KnowledgeConfidence, ReportType } from '../sim/types'
import type { ObservationInterpretation } from './interpreter'
import { assertObservationTimestamp } from './observationPolicy'

export interface RuleBasedInterpreterOptions {
  now?: Date
  observed_at?: string
}

const CATEGORY_RULES: Array<{ category: KnowledgeCategory; pattern: RegExp }> = [
  { category: 'conflict', pattern: /(?:\b(?:conflict|war|fighting|shelling|battle|military|soldier|troop|unit|weapon)\b|紛争|戦闘|衝突|武力|砲撃|軍人|兵士|部隊|武器)/iu },
  { category: 'explosion', pattern: /(?:explosion|blast|爆発|爆発音|大きな衝撃)/iu },
  { category: 'harassment', pattern: /(?:harassment|sexual harassment|stalking|grop(?:e|ed|ing)|unwanted\s+(?:touch|touching|contact)|molest(?:ed|ation)?|sexual contact|痴漢|嫌がらせ|つきまとい|触られ|触った|性的接触)/iu },
  { category: 'theft', pattern: /(?:stole|stolen|theft|robbed|盗まれ|盗難|窃盗)/iu },
  { category: 'violence', pattern: /(?:violence|assault|attacked|attack|hit|punched|暴力|殴ら|襲わ|トラブル)/iu },
  { category: 'fire', pattern: /(?:fire|burning|火事|火災|燃えて|煙が出)/iu },
  { category: 'road_block', pattern: /(?:road is blocked|blocked road|cannot pass|can't pass|通れない|通行止め|道がふさ|道路がふさ)/iu },
  { category: 'flood', pattern: /(?:flood|flooding|water collects|water pools|浸水|水がたま|水たまり|冠水)/iu },
  { category: 'darkness', pattern: /(?:dark|poorly lit|low light|暗い|暗がり|街灯が少)/iu },
  { category: 'narrow_path', pattern: /(?:narrow|tight path|hard to pass|狭い|すれ違い|細い路地)/iu },
  { category: 'barrier', pattern: /(?:barrier|step|obstacle|段差|障害|バリア)/iu },
  { category: 'accessibility', pattern: /(?:accessible|accessibility|wheelchair access|バリアフリー|車椅子対応)/iu },
  { category: 'crowding', pattern: /(?:crowd|crowded|busy|混雑|人が集|人混み)/iu },
  { category: 'safe_spot', pattern: /(?:safe spot|safe place|安心でき|安全な場所|一時退避)/iu },
  { category: 'infrastructure', pattern: /(?:infrastructure|facility|設備|インフラ|街灯|水道)/iu },
]

const INCIDENT_CATEGORIES = new Set<KnowledgeCategory>(['road_block', 'crowding', 'fire', 'explosion', 'theft', 'harassment', 'violence', 'conflict'])

function categoryFor(text: string): KnowledgeCategory {
  return CATEGORY_RULES.find((rule) => rule.pattern.test(text))?.category ?? 'other'
}

function conditionFor(text: string, category: KnowledgeCategory): KnowledgeCondition {
  if (/(?:rain|raining|when it rains|雨|大雨)/iu.test(text)) return 'rain'
  if (/(?:night|at night|dark|夜|夜間|暗い)/iu.test(text)) return 'night'
  if (/(?:crowd|crowded|busy|混雑|人混み)/iu.test(text)) return 'crowded'
  return category === 'flood' && /(?:雨|rain)/iu.test(text) ? 'rain' : 'always'
}

function confidenceFor(text: string, reportType: ReportType): KnowledgeConfidence {
  if (/(?:maybe|might|possibly|guess|かも|かもしれ|推測)/iu.test(text)) return 'guess'
  if (/(?:reported|reportedly|heard|rumou?r|someone said|らしい|みたい|聞いた|という報告)/iu.test(text)) return 'heard'
  if (reportType === 'incident' && !/(?:\b(?:i|me|my|we|our)\b|私|自分|見た|目撃|体験|遭った)/iu.test(text)) return 'heard'
  return 'experienced'
}

function relativeObservedAt(text: string, now: Date): string | undefined {
  if (/(?:last night|昨夜|昨晩)/iu.test(text)) {
    const previousNight = new Date(now)
    previousNight.setDate(previousNight.getDate() - 1)
    previousNight.setHours(21, 0, 0, 0)
    return previousNight.toISOString()
  }
  const offsetHours = /(?:yesterday|昨日|きのう)/iu.test(text)
    ? 24
    : /(?:last week|先週)/iu.test(text)
      ? 24 * 7
      : /(?:earlier today|this morning|today|今日|本日)/iu.test(text)
        ? 2
        : undefined
  return offsetHours === undefined ? undefined : new Date(now.getTime() - offsetHours * 60 * 60 * 1_000).toISOString()
}

function observedAtFor(text: string, options: RuleBasedInterpreterOptions, reportType: ReportType): string | undefined {
  const now = options.now ?? new Date()
  if (options.observed_at) return assertObservationTimestamp(options.observed_at, now)
  if (reportType !== 'incident') return undefined
  return relativeObservedAt(text, now) ?? now.toISOString()
}

export function interpretWithRules(text: string, options: RuleBasedInterpreterOptions = {}): ObservationInterpretation {
  const description = text.trim()
  const category = categoryFor(description)
  const report_type: ReportType = INCIDENT_CATEGORIES.has(category) ? 'incident' : 'persistent_condition'
  const observed_at = observedAtFor(description, options, report_type)
  return {
    category,
    report_type,
    condition: conditionFor(description, category),
    confidence: confidenceFor(description, report_type),
    ...(observed_at ? { observed_at } : {}),
    description,
  }
}

export class RuleBasedInterpreter {
  interpret(text: string, options: RuleBasedInterpreterOptions = {}) {
    return interpretWithRules(text, options)
  }
}

export const ruleBasedInterpreter = new RuleBasedInterpreter()
