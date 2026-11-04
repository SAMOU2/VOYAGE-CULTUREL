import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { feature } from 'topojson-client'
import { geoBounds, geoContains } from 'd3-geo'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '..', 'public', 'geo', 'countries-50m.json')

const topology = JSON.parse(fs.readFileSync(file, 'utf8'))
const collection = feature(topology, topology.objects.countries)

/**
 * Index des pays pour le test « dans quel pays a-t-on cliqué ? ».
 * La boîte englobante évite d'appeler geoContains sur 240 polygones à chaque clic.
 */
const indexed = collection.features.map((f) => {
  const [[x0, y0], [x1, y1]] = geoBounds(f)
  return {
    id: String(f.id),
    name: f.properties?.name ?? '',
    feature: f,
    bbox: [x0, y0, x1, y1],
    wide: x1 - x0 > 180, // pays à cheval sur l'antiméridien : pas de filtre rapide
  }
})

const byId = new Map(indexed.map((c) => [c.id, c]))

/** @returns {{id: string, name: string} | null} */
export function countryAt(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  for (const country of indexed) {
    if (!country.wide) {
      const [x0, y0, x1, y1] = country.bbox
      const inLon = (lon >= x0 && lon <= x1) || (lon >= x0 - 360 && lon <= x1 - 360)
      if (!inLon || lat < y0 || lat > y1) continue
    }
    if (geoContains(country.feature, [lon, lat])) return { id: country.id, name: country.name }
  }
  return null
}

export function countryName(id) {
  return byId.get(String(id))?.name ?? null
}

export const COUNTRY_COUNT = indexed.length
