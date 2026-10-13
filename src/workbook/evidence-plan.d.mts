export interface Evidence { id: string; kind: 'training' | 'self_report' | 'sourced' | 'unknown'; source: string | null; observedAt: string | null; confirmedAt: string | null; expiresAt: string | null }
export interface Action { id: string; label: string; reason: string; stop: boolean; evidence: Evidence[] }
export interface Plan { schema: number; revision: string; proposedAt: string; actions: Action[]; adoptedAt?: string }
export interface Context { revision: string; now: string; actions: Action[] }
export const WARNING: string
export function propose(input: { revision: string; proposedAt: string; actions: Action[] }): Plan
export function review(plan: Plan, context: Context): { canAdopt: boolean; issues: string[]; unknowns: string[]; warning: string; displayActions: Action[] }
export function adopt(plan: Plan, context: Context, approved: boolean): Plan
