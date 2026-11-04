/**
 * Génère public/geo/countries-50m.json et countries-110m.json à partir de world-atlas
 * (Natural Earth, domaine public), en remplaçant les noms anglais par leurs équivalents français.
 *
 *   node scripts/build-geo.mjs
 *
 * Les couches lakes-50m.json, rivers-50m.json et roads-10m.json proviennent également de
 * Natural Earth : voir docs/DONNEES.md pour la chaîne de conversion (topojson-server +
 * topojson-simplify).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const countries = require('i18n-iso-countries')
countries.registerLocale(require('i18n-iso-countries/langs/fr.json'))

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

for (const scale of ['50m', '110m']) {
  const source = path.join(root, 'node_modules', 'world-atlas', `countries-${scale}.json`)
  const topology = JSON.parse(fs.readFileSync(source, 'utf8'))

  let translated = 0
  for (const geometry of topology.objects.countries.geometries) {
    const english = geometry.properties?.name ?? ''
    const code = String(geometry.id)
    const french = /^\d+$/.test(code) ? countries.getName(code, 'fr') : null
    geometry.properties = { name: french || english, nameEn: english, isoN: code }
    if (french) translated += 1
  }

  const target = path.join(root, 'public', 'geo', `countries-${scale}.json`)
  fs.writeFileSync(target, JSON.stringify(topology))
  console.log(
    `${scale} : ${topology.objects.countries.geometries.length} pays, ${translated} traduits → ${path.relative(
      root,
      target
    )} (${(fs.statSync(target).size / 1024).toFixed(0)} Ko)`
  )
}
