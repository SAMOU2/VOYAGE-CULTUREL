/** Prépare les frontières locales 110m/50m et le catalogue canonique des pays. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import iso from 'i18n-iso-countries'
import { feature } from 'topojson-client'
import { geoCentroid } from 'd3-geo'
import type { CountriesFile, CountryFeature, CountryTopology } from '../shared/types.js'

const require = createRequire(import.meta.url)
iso.registerLocale(require('i18n-iso-countries/langs/fr.json'))
const root = fileURLToPath(new URL('../', import.meta.url))
const target = join(root, 'frontend', 'public', 'geo')
const special: Record<string, [string, string]> = {
  Somaliland: ['ne-somaliland', 'Somaliland'],
  Kosovo: ['ne-kosovo', 'Kosovo'],
  'N. Cyprus': ['ne-northern-cyprus', 'Chypre du Nord'],
  'Indian Ocean Ter.': ['ne-indian-ocean-territories', 'Territoires de l’océan Indien'],
  'Siachen Glacier': ['ne-siachen-glacier', 'Glacier de Siachen'],
}
await mkdir(target, { recursive: true })
for (const scale of ['110m', '50m']) {
  const topology: CountryTopology = JSON.parse(
    await readFile(join(root, 'node_modules', 'world-atlas', `countries-${scale}.json`), 'utf8'),
  )
  for (const geometry of topology.objects.countries.geometries) {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')
      throw new Error('Frontière non surfacique')
    const name = geometry.properties?.name ?? ''
    const code =
      geometry.id === undefined ? special[name]?.[0] : String(geometry.id).padStart(3, '0')
    if (!code) throw new Error(`Région Natural Earth sans identifiant stable : ${name}`)
    geometry.id = code
    geometry.properties = {
      name: iso.getName(code, 'fr') || special[name]?.[1] || name,
      nameEn: name,
      isoN: code,
    }
  }
  // Natural Earth sépare Ashmore/Cartier et l'Australie mais leur donne le même ISO.
  // Réunir les arcs évite deux pays homonymes et un surlignage limité aux îlots.
  const unique = new Map<string, (typeof topology.objects.countries.geometries)[number]>()
  for (const geometry of topology.objects.countries.geometries) {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')
      throw new Error('Frontière non surfacique')
    const id = String(geometry.id),
      previous = unique.get(id)
    if (previous) {
      if (previous.type !== 'Polygon' && previous.type !== 'MultiPolygon')
        throw new Error(`Géométrie non surfacique : ${id}`)
      const first = previous.type === 'Polygon' ? [previous.arcs] : previous.arcs
      const second = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs
      unique.set(id, {
        type: 'MultiPolygon',
        id,
        properties: previous.properties,
        arcs: [...first, ...second],
      })
    } else unique.set(id, geometry)
  }
  topology.objects.countries.geometries = [...unique.values()]
  await writeFile(join(target, `countries-${scale}.json`), JSON.stringify(topology) + '\n')
  if (scale === '50m') {
    const features = feature(topology, topology.objects.countries).features as CountryFeature[]
    const data: CountriesFile = {
      version: 1,
      attribution:
        'Natural Earth / world-atlas — domaine public. Pays et territoires ; IDs ISO numériques ou ne-* pour les régions sans code ISO.',
      countries: features.map((f) => ({
        id: String(f.id),
        name: f.properties.name,
        iso2: iso.numericToAlpha2(String(f.id)) ?? null,
        center: geoCentroid(f).map((value) => Math.round(value * 10000) / 10000) as [
          number,
          number,
        ],
      })),
    }
    await writeFile(join(root, 'data', 'countries.json'), JSON.stringify(data, null, 2) + '\n')
  }
  console.log(
    `${scale} : ${topology.objects.countries.geometries.length} pays et territoires → frontend/public/geo`,
  )
}
console.log('Routes 10m déjà fournies localement ; aucune couche de fleuves ou de lacs.')
