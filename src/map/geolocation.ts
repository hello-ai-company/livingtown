import { isWithinWorldMapBounds } from './basemaps'

export interface ReportLocation {
  lat: number
  lng: number
}

export interface GeolocationLike {
  getCurrentPosition: Geolocation['getCurrentPosition']
}

export function getCurrentLocation(geolocation: GeolocationLike): Promise<ReportLocation> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        if (!isWithinWorldMapBounds(latitude, longitude)) {
          reject(new Error('The current location is outside the supported map bounds.'))
          return
        }
        resolve({ lat: latitude, lng: longitude })
      },
      (error) => reject(error),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    )
  })
}
