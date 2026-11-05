/** Régénère les repères mondiaux et les faits de veille. Aucune requête externe en jeu. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { feature } from 'topojson-client'
import type {
  CountriesFile,
  CountryFeature,
  CountryTopology,
  Coordinates,
  FactsFile,
  Question,
  QuestionBankFile,
} from '../shared/types.js'
import { buildCountryIndex, findCountryAt } from '../shared/geometry.js'
import { DEFAULT_SETTINGS } from '../shared/game.js'
import { ROOT } from '../backend/src/paths.js'

type Reference = {
  ccn3: string
  cca2: string
  capital: string[]
  region: string
  area: number
  name: { common: string }
}
const referenceBlob = '455b3fd85abcf8fa01e0fca63e84a853c9ff4422'
const cacheFile = join(ROOT, '.cache/country-reference.json')
let raw: string
try {
  raw = await readFile(cacheFile, 'utf8')
} catch {
  const response = await fetch(
    `https://api.github.com/repos/mledoze/countries/git/blobs/${referenceBlob}`,
  )
  if (!response.ok) throw new Error(`Référentiel inaccessible : ${response.status}`)
  const blob = (await response.json()) as { content: string }
  raw = Buffer.from(blob.content, 'base64').toString('utf8')
  await mkdir(join(ROOT, '.cache'), { recursive: true })
  await writeFile(cacheFile, raw)
}
const reference = JSON.parse(raw) as Reference[]
const countries = JSON.parse(
  await readFile(join(ROOT, 'data/countries.json'), 'utf8'),
) as CountriesFile
const bank = JSON.parse(
  await readFile(join(ROOT, 'data/questions.json'), 'utf8'),
) as QuestionBankFile
const topology = JSON.parse(
  await readFile(join(ROOT, 'frontend/public/geo/countries-50m.json'), 'utf8'),
) as CountryTopology
const features = feature(topology, topology.objects.countries).features as CountryFeature[]
const index = buildCountryIndex(features)
const inside = (id: string, pin: Coordinates) => findCountryAt(index, ...pin)?.id === id
function interior(id: string, center: Coordinates): Coordinates {
  const candidates: Coordinates[] = [center]
  const shape = features.find((f) => String(f.id) === id)!
  const polygons =
    shape.geometry.type === 'Polygon'
      ? [shape.geometry.coordinates]
      : shape.geometry.type === 'MultiPolygon'
        ? shape.geometry.coordinates
        : []
  for (const polygon of polygons) {
    const ring = polygon[0]
    const mean: Coordinates = [
      ring.reduce((s, p) => s + p[0], 0) / ring.length,
      ring.reduce((s, p) => s + p[1], 0) / ring.length,
    ]
    candidates.push(mean)
    for (const point of ring) candidates.push([(mean[0] + point[0]) / 2, (mean[1] + point[1]) / 2])
  }
  let found = candidates.find((pin) => inside(id, pin))
  if (!found) {
    const [[x0, y0], [x1, y1]] = index.find((c) => c.id === id)!.bounds
    const width = x1 >= x0 ? x1 - x0 : x1 + 360 - x0
    for (let a = 1; a < 100 && !found; a++)
      for (let b = 1; b < 100 && !found; b++) {
        const pin: Coordinates = [
          ((x0 + (width * a) / 100 + 540) % 360) - 180,
          y0 + ((y1 - y0) * b) / 100,
        ]
        if (inside(id, pin)) found = pin
      }
  }
  if (!found) throw new Error(`Point intérieur introuvable : ${id}`)
  for (const precision of [4, 5, 6, 8]) {
    const rounded = found.map((n) => Number(n.toFixed(precision))) as Coordinates
    if (inside(id, rounded)) return rounded
  }
  return found
}
const regions: Record<string, string> = {
  Africa: 'Afrique',
  Americas: 'Amériques',
  Asia: 'Asie',
  Europe: 'Europe',
  Oceania: 'Océanie',
  Antarctic: 'Antarctique',
}
const specialRegions: Record<string, string> = {
  'ne-kosovo': 'Europe',
  'ne-northern-cyprus': 'Asie',
  'ne-somaliland': 'Afrique',
  'ne-akrotiri-and-dhekelia': 'Asie',
  'ne-sovereign-base-areas': 'Asie',
  'ne-siachen-glacier': 'Asie',
  'ne-indian-ocean-territories': 'Océan Indien',
}
const capitalsFr: Record<string, string> = {
  Algiers: 'Alger',
  Cairo: 'Le Caire',
  London: 'Londres',
  Beijing: 'Pékin',
  Lisbon: 'Lisbonne',
  Rome: 'Rome',
  Athens: 'Athènes',
  Ankara: 'Ankara',
  Warsaw: 'Varsovie',
  Moscow: 'Moscou',
  Baghdad: 'Bagdad',
  Damascus: 'Damas',
  Tehran: 'Téhéran',
  Riyadh: 'Riyad',
  'Mexico City': 'Mexico',
  'Buenos Aires': 'Buenos Aires',
  'Cape Town': 'Le Cap',
  Jerusalem: 'Jérusalem',
  Brussels: 'Bruxelles',
  'New Delhi': 'New Delhi',
  Copenhagen: 'Copenhague',
  Vienna: 'Vienne',
  Bern: 'Berne',
  Prague: 'Prague',
  Havana: 'La Havane',
  Kabul: 'Kaboul',
  'Washington D.C.': 'Washington',
  'Kuwait City': 'Koweït',
  'Abu Dhabi': 'Abou Dabi',
  'Port of Spain': 'Port-d’Espagne',
}
const geoSource = {
  label: 'Natural Earth · World Atlas',
  url: 'https://github.com/topojson/world-atlas',
}
const refSource = {
  label: 'Référentiel mledoze/countries',
  url: 'https://github.com/mledoze/countries',
}
const databaseLicense = {
  label: 'Open Database License 1.0',
  url: 'https://opendatacommons.org/licenses/odbl/1-0/',
}
const facts: FactsFile = {
  version: 1,
  license: databaseLicense,
  attribution: `Géométries Natural Earth (domaine public) ; métadonnées mledoze/countries, ODbL 1.0, blob ${referenceBlob}.`,
  countries: [],
}
const byCountry: Record<string, Question[]> = {}
for (const country of countries.countries) {
  const metadata = reference.find(
    (c) => c.ccn3 === country.id || (!!country.iso2 && c.cca2 === country.iso2),
  )
  const pin = interior(country.id, country.center)
  const region = regions[metadata?.region ?? ''] ?? specialRegions[country.id] ?? 'Région du monde'
  const capitals = (metadata?.capital ?? []).map((cap) => capitalsFr[cap] ?? cap)
  const capital = new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' }).format(capitals)
  const iso = country.iso2 || metadata?.cca2
  const lat = `${Math.abs(pin[1]).toFixed(4)}° ${pin[1] >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(pin[0]).toFixed(4)}° ${pin[0] >= 0 ? 'E' : 'O'}`
  const hemisphere = `Le repère de ce territoire se situe dans l’hémisphère ${pin[1] >= 0 ? 'nord' : 'sud'}.`
  const geographicHint = `Région : ${region}.`
  const templates = [
    {
      prompt: `Sur le globe, trouvez « ${country.name} ».`,
      text: `${country.name} se trouve dans la région ${region}.`,
      source: geoSource,
    },
    capital
      ? {
          prompt:
            capitals.length > 1
              ? `Dans quel pays se trouvent les capitales ${capital} ?`
              : `Quel pays a pour capitale ${capital} ?`,
          text: `${capital} ${capitals.length > 1 ? 'sont les capitales' : 'est la capitale'} de ${country.name} dans ce référentiel.`,
          source: refSource,
        }
      : {
          prompt: `Retrouvez le territoire nommé « ${features.find((f) => String(f.id) === country.id)?.properties.nameEn ?? country.name} » sur les cartes internationales.`,
          text: `Ce territoire est nommé ${country.name} dans notre atlas en français.`,
          source: geoSource,
        },
    {
      prompt: `Quel pays ou territoire contient le repère ${lat}, ${lon} ?`,
      text: `Le repère ${lat}, ${lon} se situe dans ${country.name}, sur la géométrie Natural Earth de ce jeu.`,
      source: geoSource,
    },
    iso
      ? {
          prompt: `Quel pays ou territoire correspond au code international « ${iso} » ?`,
          text: `${iso} est le code ISO 3166-1 alpha-2 de ${country.name}.`,
          source: refSource,
        }
      : {
          prompt: `Repérez ${country.name}, un territoire cartographié séparément dans l’atlas Natural Earth.`,
          text: `L’atlas Natural Earth représente ${country.name} par une géométrie distincte.`,
          source: geoSource,
        },
  ]
  const generated: Question[] = templates.map((t, i) => ({
    id: `atlas-${country.id}-${i + 1}`,
    countryId: country.id,
    theme: 'reperes',
    difficulty: (i + 1) as Question['difficulty'],
    question: t.prompt,
    hints: [
      geographicHint,
      i === 1 ? hemisphere : capital ? `Un repère administratif : ${capital}.` : hemisphere,
    ],
    explanation: t.text,
    location: pin,
    source: t.source,
  }))
  byCountry[country.id] = [
    ...(bank.byCountry[country.id] ?? []).filter((q) => !q.id.startsWith('atlas-')),
    ...generated,
  ]
  const entries: FactsFile['countries'][number]['facts'] = [
    {
      id: `${country.id}-region`,
      title: 'Un repère dans le monde',
      text: `${country.name} appartient à la région ${region}. ${hemisphere}`,
      source: metadata ? refSource : geoSource,
    },
  ]
  if (capital)
    entries.push({
      id: `${country.id}-capital`,
      title: capitals.length > 1 ? 'Plusieurs capitales' : 'La capitale',
      text: `${capital} ${capitals.length > 1 ? 'sont les capitales' : 'est la capitale'} de ${country.name} dans ce référentiel.`,
      source: refSource,
    })
  if (metadata?.area)
    entries.push({
      id: `${country.id}-area`,
      title: 'En quelques chiffres',
      text: `${country.name} couvre environ ${new Intl.NumberFormat('fr').format(metadata.area)} km² selon le référentiel pays.`,
      source: refSource,
    })
  if (iso)
    entries.push({
      id: `${country.id}-code`,
      title: 'Une identité internationale',
      text: `Le code international à deux lettres de ${country.name} est ${iso}.`,
      source: refSource,
    })
  facts.countries.push({
    id: `fact-${country.id}`,
    countryId: country.id,
    countryName: country.name,
    region,
    pin,
    facts: entries,
  })
}
bank.version = '4.0.0'
bank.license = databaseLicense
bank.attribution = `Base dérivée : métadonnées mledoze/countries, ODbL 1.0, blob ${referenceBlob} ; géométries Natural Earth (domaine public). Les fiches éditoriales conservent leurs références.`
bank.checkedAt = '2026-11-04'
bank.themes = [
  ...bank.themes
    .filter((t) => t.id !== 'reperes')
    .map((t, i) => ({ ...t, emoji: '', color: ['#08285f', '#007e9c', '#183b6d'][i % 3] })),
  { id: 'reperes', label: 'Repères géographiques', emoji: '', color: '#007e9c' },
]
bank.byCountry = byCountry
await writeFile(join(ROOT, 'data/questions.json'), JSON.stringify(bank, null, 2) + '\n')
await writeFile(join(ROOT, 'data/facts.json'), JSON.stringify(facts, null, 2) + '\n')
await writeFile(
  join(ROOT, 'data/settings.example.json'),
  JSON.stringify({ version: 1, settings: DEFAULT_SETTINGS }, null, 2) + '\n',
)
console.log(
  `${countries.countries.length} pays/territoires, ${Object.values(byCountry).flat().length} questions, ${facts.countries.reduce((s, c) => s + c.facts.length, 0)} faits de veille.`,
)
