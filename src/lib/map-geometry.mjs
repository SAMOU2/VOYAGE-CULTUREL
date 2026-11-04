import { geoBounds, geoContains } from 'd3-geo'

/** @typedef {import('geojson').Feature<import('geojson').Geometry, {name: string; nameEn?: string; isoN?: string}>} CountryFeature */

/** Index commun au navigateur et au serveur, sans dépendance à Node ni au canvas.
 * @param {CountryFeature[]} features
 */
export function buildCountryIndex(features) {
  return features.map((feature) => ({
    id: String(feature.id),
    name: feature.properties?.name ?? '',
    feature,
    bounds: geoBounds(feature),
  }))
}

/** Les bornes d'un pays traversant l'antiméridien ont x0 > x1 (États-Unis,
 * Russie, Nouvelle-Zélande…). Il faut tester les deux côtés, et non un intervalle vide.
 * @param {ReturnType<typeof buildCountryIndex>} index
 * @param {number} lon
 * @param {number} lat
 */
export function findCountryAt(index, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null
  for (const country of index) {
    const [[x0, y0], [x1, y1]] = country.bounds
    const inLon = x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1
    if (!inLon || lat < y0 || lat > y1) continue
    if (geoContains(country.feature, [lon, lat])) return country
  }
  return null
}

/** N'inverse que les pixels réellement situés sur la carte. D3 peut renvoyer un
 * point d'horizon pour un clic hors du globe, ou un autre tour de longitude hors
 * du planisphère : le trajet aller-retour doit revenir au pixel d'origine.
 * @param {import('d3-geo').GeoProjection} projection
 * @param {[number, number]} pixel
 * @returns {[number, number] | null}
 */
export function invertMapPoint(projection, pixel) {
  const coords = projection.invert?.(pixel)
  if (!coords || !coords.every(Number.isFinite) || Math.abs(coords[1]) > 90) return null
  const lon = ((coords[0] + 540) % 360) - 180
  const lat = coords[1]
  const roundTrip = projection([lon, lat])
  if (!roundTrip || Math.hypot(roundTrip[0] - pixel[0], roundTrip[1] - pixel[1]) > 0.5) return null
  return [lon, lat]
}
