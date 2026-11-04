import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { feature } from 'topojson-client'
import { buildCountryIndex, findCountryAt } from '../src/lib/map-geometry.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '..', 'public', 'geo', 'countries-50m.json')

const topology = JSON.parse(fs.readFileSync(file, 'utf8'))
const collection = feature(topology, topology.objects.countries)

/**
 * Index des pays pour le test « dans quel pays a-t-on cliqué ? ».
 * La boîte englobante évite d'appeler geoContains sur 240 polygones à chaque clic.
 */
const indexed = buildCountryIndex(collection.features)

const byId = new Map(indexed.map((c) => [c.id, c]))

/** @returns {{id: string, name: string} | null} */
export function countryAt(lon, lat) {
  const country = findCountryAt(indexed, lon, lat)
  return country ? { id: country.id, name: country.name } : null
}

export function countryName(id) {
  return byId.get(String(id))?.name ?? null
}

export const COUNTRY_COUNT = indexed.length
