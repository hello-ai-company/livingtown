export type ThreeDProvider = 'navara' | 'cesium'

export interface ThreeDProviderAvailability {
  navara: boolean
  cesium: boolean
}

/**
 * Keep provider choice at the rendering boundary. Domain snapshots and route
 * results are deliberately not part of this policy.
 *
 * Navara is the stable default. A requested Cesium provider is honored only
 * when it is actually configured and available; otherwise the existing
 * Navara renderer remains the safe fallback before the app returns to 2D.
 */
export function selectThreeDProvider(
  requested: ThreeDProvider | undefined,
  availability: ThreeDProviderAvailability,
): ThreeDProvider | undefined {
  if (requested === 'cesium' && availability.cesium) return 'cesium'
  if (availability.navara) return 'navara'
  if (availability.cesium) return 'cesium'
  return undefined
}
