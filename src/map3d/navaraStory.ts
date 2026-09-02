import type { Translator } from '../i18n'
import type { Household, HouseholdConstraint, Knowledge } from '../sim/types'

export type NavaraStoryStep = 'overview' | 'household' | 'hazard' | 'avoided' | 'safe_route' | 'destination'

export interface NavaraStoryCopy {
  number?: string
  title: string
  body: string
  detail?: string
}

const singleHouseholdTitleKeys: Record<HouseholdConstraint, string> = {
  wheelchair: 'map.storyHouseholdWheelchair',
  infant: 'map.storyHouseholdInfant',
  elderly: 'map.storyHouseholdElderly',
  pet: 'map.storyHouseholdPet',
}

export function householdStoryTitle(household: Household | undefined, t: Translator) {
  const constraints = [...new Set(household?.constraints ?? [])]
  if (constraints.length === 0) return t('map.storyHouseholdGeneric')
  if (constraints.length === 1) return t(singleHouseholdTitleKeys[constraints[0]])
  const needs = constraints.map((constraint) => t(`constraint.${constraint}`)).join('・')
  return t('map.storyHouseholdMultiple', { needs })
}

export function knowledgeStoryBody(knowledge: Knowledge | undefined, t: Translator) {
  if (!knowledge) return t('map.storyHazardFallback')
  return t('map.storyHazardContext', {
    condition: t(`condition.${knowledge.condition}`),
    category: t(`category.${knowledge.category}`),
  })
}

export function buildSimple3DStoryCopy(input: {
  step: NavaraStoryStep
  household?: Household
  knowledge?: Knowledge
  reason?: string
  t: Translator
}): NavaraStoryCopy {
  const { household, knowledge, reason, t } = input
  switch (input.step) {
    case 'household':
      return { number: '01', title: householdStoryTitle(household, t), body: t('map.storyHouseholdBody') }
    case 'hazard':
      return { number: '02', title: t('map.storyHazard'), body: knowledgeStoryBody(knowledge, t), detail: knowledge?.description }
    case 'avoided':
      return { number: '03', title: t('map.storyAvoided'), body: t('map.storyAvoidedBody'), detail: reason ?? knowledge?.description }
    case 'safe_route':
      return { number: '04', title: t('map.storySafeRoute'), body: t('map.storySafeRouteBody') }
    case 'destination':
      return { number: '05', title: t('map.storyDestination'), body: t('map.storyDestinationBody') }
    case 'overview':
    default:
      return { title: t('map.storyOverview'), body: t('map.storyOverviewBody') }
  }
}
