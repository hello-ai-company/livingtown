/**
 * The demo action can target either a record selected from a shared repository
 * or a locally contributed knowledge record. An explicit selection wins; the
 * local contribution is only the fallback used by the demo flow.
 */
export function resolveVerificationTargetId(selectedKnowledgeId?: string, lastKnowledgeId?: string) {
  return selectedKnowledgeId ?? lastKnowledgeId
}
