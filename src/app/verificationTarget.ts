/**
 * The demo action can target either a locally contributed knowledge record or
 * a record selected from a shared repository. Keep the selection fallback
 * explicit so remote knowledge can be verified from another browser.
 */
export function resolveVerificationTargetId(lastKnowledgeId?: string, selectedKnowledgeId?: string) {
  return lastKnowledgeId ?? selectedKnowledgeId
}
