/** Track source identity, not map-wide snapshot identity. Missing sources are
 * never marked delivered; recreating a map must clear this cache first. */
export function applyOverlayUpdates(
  updates: Array<[string, unknown]>,
  delivered: Map<string, unknown>,
  getSource: (id: string) => { setData: (data: never) => unknown } | undefined,
) {
  let sent = 0
  for (const [id, data] of updates) {
    const target = getSource(id)
    if (!target || delivered.get(id) === data) continue
    target.setData(data as never)
    delivered.set(id, data)
    sent++
  }
  return sent
}
