import { geoBounds, geoContains } from 'd3-geo'
import type { CountryFeature, Coordinates } from './types.js'

export function isCoordinates(value: unknown): value is Coordinates {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  )
}
export function buildCountryIndex(features: CountryFeature[]) {
  return features.map((feature) => ({
    id: String(feature.id),
    name: feature.properties.name,
    feature,
    bounds: geoBounds(feature),
  }))
}
export type CountryIndex = ReturnType<typeof buildCountryIndex>
export function findCountryAt(index: CountryIndex, lon: number, lat: number) {
  if (!isCoordinates([lon, lat])) return null
  for (const country of index) {
    const [[x0, y0], [x1, y1]] = country.bounds
    const inLon = x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1
    if (inLon && lat >= y0 && lat <= y1 && geoContains(country.feature, [lon, lat])) return country
  }
  return null
}
/** Convention commune au raycast WebGL et à sa texture équirectangulaire. */
export function spherePoint([lon, lat]: Coordinates, radius = 1): [number, number, number] {
  const phi = (lat * Math.PI) / 180,
    theta = (lon * Math.PI) / 180
  return [
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(theta),
  ]
}
export function sphereCoordinates([x, y, z]: [number, number, number]): Coordinates {
  const radius = Math.hypot(x, y, z)
  return [
    (Math.atan2(-z, x) * 180) / Math.PI,
    (Math.asin(Math.max(-1, Math.min(1, y / radius))) * 180) / Math.PI,
  ]
}
