/**
 * Rend la carte dans un PNG, sans navigateur — utile pour vérifier le rendu
 * (couleurs, frontières, lacs, rivières, routes) avant de lancer l'application.
 *
 *   node scripts/preview-map.mjs
 *
 * Nécessite la dépendance de développement @napi-rs/canvas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { geoGraticule10, geoNaturalEarth1, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', f), 'utf8'))
const toFeatures = (topology, name) => {
  const result = feature(topology, topology.objects[name])
  return result.type === 'FeatureCollection' ? result.features : [result]
}

const countries = feature(read('countries-50m.json'), read('countries-50m.json').objects.countries)
const lakes = toFeatures(read('lakes-50m.json'), 'water')
const rivers = { major: toFeatures(read('rivers-50m.json'), 'major'), minor: toFeatures(read('rivers-50m.json'), 'minor') }
const roads = { major: toFeatures(read('roads-10m.json'), 'major'), minor: toFeatures(read('roads-10m.json'), 'minor') }

const PALETTE = [
  '#5f9169', '#83a86a', '#a3b47b', '#c6b97c', '#d3a771', '#c1906a', '#a87e63', '#8f7d66',
  '#6f8a72', '#548a86', '#4a8491', '#547f9c', '#6a7aa0', '#82799f', '#9c7392', '#b47f85',
]
const SPECIAL_COLORS = { '010': '#cfe0ef', '304': '#c6daea' }
const colorFor = (id) => {
  const text = String(id ?? '')
  if (SPECIAL_COLORS[text]) return SPECIAL_COLORS[text]
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return PALETTE[(hash >>> 0) % PALETTE.length]
}
const colors = new Map(countries.features.map((f) => [String(f.id), colorFor(f.id)]))

const EARTH = { type: 'Feature', properties: {}, geometry: { type: 'Sphere' } }

function draw({ width, height, mode, rotation, zoom, selectedIso, targetIso, target, pin, file, center }) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#050a15'
  ctx.fillRect(0, 0, width, height)

  const pad = 10
  const projection =
    mode === 'globe'
      ? geoOrthographic()
          .translate([width / 2, height / 2])
          .scale((Math.min(width, height) / 2 - pad) * zoom)
          .rotate(rotation)
          .clipAngle(90)
      : geoNaturalEarth1()
          .scale(geoNaturalEarth1().fitSize([width - pad * 2, height - pad * 2], EARTH).scale() * zoom)
          .translate([width / 2, height / 2])

  if (center && mode === 'flat') {
    const [cx, cy] = projection(center)
    const [tx, ty] = projection.translate()
    projection.translate([tx + (width / 2 - cx), ty + (height / 2 - cy)])
  }

  const p = geoPath(projection, ctx)
  ctx.lineJoin = 'round'

  const grad = ctx.createRadialGradient(width * 0.4, height * 0.32, 8, width * 0.5, height * 0.55, Math.max(width, height) * 0.85)
  grad.addColorStop(0, '#102a45')
  grad.addColorStop(1, '#08172a')
  ctx.beginPath()
  p(EARTH)
  ctx.fillStyle = grad
  ctx.fill()

  if (mode === 'globe') {
    const r = (Math.min(width, height) / 2 - pad) * zoom + 2
    const halo = ctx.createRadialGradient(width / 2, height / 2, r * 0.9, width / 2, height / 2, r * 1.14)
    halo.addColorStop(0, 'rgba(94, 234, 212, 0)')
    halo.addColorStop(0.45, 'rgba(94, 234, 212, 0.20)')
    halo.addColorStop(1, 'rgba(94, 234, 212, 0)')
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, r * 1.14, 0, Math.PI * 2)
    ctx.fillStyle = halo
    ctx.fill()
  }

  ctx.beginPath()
  p(geoGraticule10())
  ctx.strokeStyle = 'rgba(120, 190, 255, 0.10)'
  ctx.lineWidth = 0.7
  ctx.stroke()

  for (const country of countries.features) {
    ctx.beginPath()
    p(country)
    ctx.fillStyle = colors.get(String(country.id)) ?? '#6f806b'
    ctx.fill()
  }

  ctx.beginPath()
  for (const country of countries.features) p(country)
  ctx.strokeStyle = zoom > 2 ? 'rgba(6, 12, 22, 0.85)' : 'rgba(6, 12, 22, 0.55)'
  ctx.lineWidth = zoom > 2 ? 1 : 0.6
  ctx.stroke()

  ctx.beginPath()
  for (const lake of lakes) p(lake)
  ctx.fillStyle = '#1b4a6e'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120, 190, 235, 0.45)'
  ctx.lineWidth = 0.6
  ctx.stroke()

  if (zoom >= 1.35) {
    ctx.beginPath()
    for (const river of rivers.minor) p(river)
    ctx.strokeStyle = 'rgba(96, 176, 226, 0.42)'
    ctx.lineWidth = Math.min(1.1, 0.45 + zoom * 0.08)
    ctx.stroke()
    ctx.beginPath()
    for (const river of rivers.major) p(river)
    ctx.strokeStyle = 'rgba(120, 196, 240, 0.68)'
    ctx.lineWidth = Math.min(1.9, 0.7 + zoom * 0.16)
    ctx.stroke()
  }

  if (zoom >= 2.2) {
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const road of roads.minor) p(road)
    ctx.strokeStyle = 'rgba(247, 198, 91, 0.30)'
    ctx.lineWidth = 0.6
    ctx.stroke()
    ctx.beginPath()
    for (const road of roads.major) p(road)
    ctx.strokeStyle = 'rgba(255, 208, 112, 0.68)'
    ctx.lineWidth = Math.min(1.6, 0.7 + zoom * 0.14)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  const paint = (iso, fill, stroke) => {
    const found = countries.features.find((f) => String(f.id) === iso)
    if (!found) return
    ctx.beginPath()
    p(found)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.8
    ctx.stroke()
  }
  if (selectedIso) paint(selectedIso, 'rgba(94, 234, 212, 0.42)', '#5eead4')
  if (targetIso) paint(targetIso, 'rgba(247, 198, 91, 0.45)', '#f7c65b')

  const project = (coords) => projection(coords)
  const marker = (coords, color, rgb, halo) => {
    const pt = project(coords)
    if (!pt) return
    if (halo) {
      ctx.beginPath()
      ctx.arc(pt[0], pt[1], 19, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${rgb}, 0.18)`
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(pt[0], pt[1], 8.4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(4, 10, 20, 0.85)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(pt[0], pt[1], 6, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.2
    ctx.stroke()
  }
  if (pin) marker(pin, '#fb7185', '251, 113, 133', false)
  if (target) marker(target, '#f7c65b', '247, 198, 91', true)

  fs.writeFileSync(file, canvas.toBuffer('image/png'))
  console.log('→', file)
}

const out = path.join(root, 'docs', 'apercus')
fs.mkdirSync(out, { recursive: true })

draw({ width: 900, height: 900, mode: 'globe', rotation: [-20, -12], zoom: 1, targetIso: '250', target: [2.35, 48.85], file: path.join(out, 'globe.png') })
draw({ width: 1200, height: 640, mode: 'flat', rotation: [0, 0], zoom: 1, file: path.join(out, 'carte-monde.png') })
draw({
  width: 1000,
  height: 800,
  mode: 'flat',
  rotation: [0, 0],
  zoom: 4,
  selectedIso: '818',
  targetIso: '250',
  target: [2.35, 48.85],
  pin: [5.4, 43.3],
  file: path.join(out, 'carte-zoom.png'),
})

// Europe à fort zoom : routes et rivières
draw({
  width: 1000,
  height: 800,
  mode: 'flat',
  rotation: [0, 0],
  zoom: 9,
  center: [10, 48],
  file: path.join(out, 'carte-europe.png'),
})
