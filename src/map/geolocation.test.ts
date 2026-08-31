import { describe, expect, it, vi } from 'vitest'
import { getCurrentLocation } from './geolocation'

describe('current-location reporting', () => {
  it('requests location only when called and accepts overseas coordinates', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 37.7749, longitude: -122.4194 } } as GeolocationPosition))
    await expect(getCurrentLocation({ getCurrentPosition })).resolves.toEqual({ lat: 37.7749, lng: -122.4194 })
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('rejects coordinates outside Web Mercator latitude bounds', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 90, longitude: 0 } } as GeolocationPosition))
    await expect(getCurrentLocation({ getCurrentPosition })).rejects.toThrow('outside the supported map bounds')
  })

  it('surfaces browser geolocation errors without saving anything', async () => {
    const error = { code: 1, message: 'denied' } as GeolocationPositionError
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure(error))
    await expect(getCurrentLocation({ getCurrentPosition })).rejects.toBe(error)
  })
})
