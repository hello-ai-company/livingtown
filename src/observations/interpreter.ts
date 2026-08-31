import type { KnowledgeCategory, KnowledgeCondition, KnowledgeConfidence, ReportType } from '../sim/types'
import { ruleBasedInterpreter, type RuleBasedInterpreterOptions } from './ruleBasedInterpreter'

export interface ObservationInterpretation {
  category: KnowledgeCategory
  report_type: ReportType
  condition: KnowledgeCondition
  confidence: KnowledgeConfidence
  observed_at?: string
  description: string
}

export interface ObservationInterpreter {
  interpret(text: string, options?: RuleBasedInterpreterOptions): ObservationInterpretation
}

export function interpretObservation(text: string, options?: RuleBasedInterpreterOptions): ObservationInterpretation {
  return ruleBasedInterpreter.interpret(text, options)
}
