'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  geoBounds,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
} from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeoProjection } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

export type LonLat = [number, number]
export interface PickedCountry {
  id: string
  name: string
}

interface WorldMapProps {
  mode?: 'globe' | 'flat'
  pin?: LonLat | null
  selectedIso?: string | null
  target?: LonLat | null
  targetIso?: string | null
  onPick?: (coords: LonLat, country: PickedCountry | null) => void
  interactive?: boolean
  autoRotate?: boolean
  labels?: boolean
  className?: string
  initialRotation?: LonLat
  compact?: boolean
}

type CountryProps = { name: string; nameEn?: string; isoN?: string }
type CountryFeature = Feature<Geometry, CountryProps>
type CountryCollection = FeatureCollection<Geometry, CountryProps>
type GeoFeature = Feature<Geometry, Record<string, unknown>>

const EARTH = { type: 'Feature', properties: {}, geometry: { type: 'Sphere' } } as unknown as CountryFeature

/** Palette de pays : tons d'atlas, assez contrastés pour se distinguer sur l'océan. */
const PALETTE = [
  '#5f9169',
  '#83a86a',
  '#a3b47b',
  '#c6b97c',
  '#d3a771',
  '#c1906a',
  '#a87e63',
  '#8f7d66',
  '#6f8a72',
  '#548a86',
  '#4a8491',
  '#547f9c',
  '#6a7aa0',
  '#82799f',
  '#9c7392',
  '#b47f85',
]

/** Couleurs fixes pour les terres polaires. */
const SPECIAL_COLORS: Record<string, string> = {
  '010': '#cfe0ef', // Antarctique
  '304': '#c6daea', // Groenland
}

const OCEAN_DEEP = '#08172a'
const OCEAN_LIGHT = '#102a45'
const HORIZON = Math.PI / 2

function colorFor(id: unknown): string {
  const text = String(id ?? '')
  if (SPECIAL_COLORS[text]) return SPECIAL_COLORS[text]
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return PALETTE[(hash >>> 0) % PALETTE.length]
}

const cache = new Map<string, Promise<unknown>>()
function loadJson<T>(url: string): Promise<T> {
  let pending = cache.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url} indisponible`)
        return r.json()
      })
      .catch((err) => {
        cache.delete(url)
        throw err
      })
    cache.set(url, pending)
  }
  return pending as Promise<T>
}

function toFeatures(topology: any, name: string): GeoFeature[] {
  const result = feature(topology, topology.objects[name]) as unknown as
    | GeoFeature
    | FeatureCollection<Geometry, Record<string, unknown>>
  return result.type === 'FeatureCollection'
    ? (result.features as GeoFeature[])
    : [result as GeoFeature]
}

interface CountryIndexEntry {
  feature: CountryFeature
  id: string
  name: string
  bbox: [number, number, number, number]
  wide: boolean
}

export default function WorldMap({
  mode = 'globe',
  pin = null,
  selectedIso = null,
  target = null,
  targetIso = null,
  onPick,
  interactive = true,
  autoRotate = false,
  labels = true,
  className = '',
  initialRotation = [-20, -12],
  compact = false,
}: WorldMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const baseDirtyRef = useRef(true)

  const countriesHiRef = useRef<CountryCollection | null>(null)
  const countriesLoRef = useRef<CountryCollection | null>(null)
  const lakesRef = useRef<GeoFeature[] | null>(null)
  const riversRef = useRef<{ major: GeoFeature[]; minor: GeoFeature[] } | null>(null)
  const roadsRef = useRef<{ major: GeoFeature[]; minor: GeoFeature[] } | null>(null)
  const indexRef = useRef<CountryIndexEntry[]>([])
  const colorsRef = useRef(new Map<string, string>())

  const [ready, setReady] = useState(false)

  const view = useRef({
    rotation: [...initialRotation] as LonLat,
    zoom: 1,
    pan: [0, 0] as LonLat,
    dragging: false,
    moved: 0,
    last: [0, 0] as LonLat,
    pointers: new Map<number, [number, number]>(),
    pinchDist: 0,
    hovered: null as CountryFeature | null,
    size: { w: 0, h: 0 },
    lowQuality: false,
  })

  const propsRef = useRef({
    pin,
    selectedIso,
    target,
    targetIso,
    mode,
    labels,
    compact,
    autoRotate,
  })
  propsRef.current = { pin, selectedIso, target, targetIso, mode, labels, compact, autoRotate }

  const drawRef = useRef<() => void>(() => {})
  const scheduleRef = useRef<() => void>(() => {})

  const markDirty = useCallback(() => {
    baseDirtyRef.current = true
  }, [])

  /* ----------------------------- projection ------------------------------- */

  const buildProjection = useCallback((w: number, h: number): GeoProjection => {
    const { mode: m, compact: small } = propsRef.current
    const pad = small ? 4 : 10
    if (m === 'globe') {
      const radius = Math.min(w, h) / 2 - pad
      return geoOrthographic()
        .translate([w / 2 + view.current.pan[0], h / 2 + view.current.pan[1]])
        .scale(radius * view.current.zoom)
        .rotate(view.current.rotation)
        .clipAngle(90)
    }
    const base = geoNaturalEarth1().fitSize([w - pad * 2, h - pad * 2], EARTH)
    return geoNaturalEarth1()
      .scale(base.scale() * view.current.zoom)
      .translate([w / 2 + view.current.pan[0], h / 2 + view.current.pan[1]])
  }, [])

  /* ------------------------------- couches -------------------------------- */

  const renderBase = () => {
    const canvas = baseRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { w, h } = view.current.size
    if (!w || !h) return

    const { mode: m, compact: small, autoRotate: spin } = propsRef.current
    const lowQuality = view.current.lowQuality || spin
    const countries = (lowQuality ? countriesLoRef.current : countriesHiRef.current) ?? countriesHiRef.current
    if (!countries) return

    const projection = buildProjection(w, h)
    const path = geoPath(projection, ctx)
    const zoom = view.current.zoom

    ctx.save()
    ctx.setTransform(Math.min(window.devicePixelRatio || 1, 2), 0, 0, Math.min(window.devicePixelRatio || 1, 2), 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.lineJoin = 'round'

    /* Océan */
    const grad = ctx.createRadialGradient(w * 0.4, h * 0.32, 8, w * 0.5, h * 0.55, Math.max(w, h) * 0.85)
    grad.addColorStop(0, OCEAN_LIGHT)
    grad.addColorStop(1, OCEAN_DEEP)
    ctx.beginPath()
    path(EARTH)
    ctx.fillStyle = grad
    ctx.fill()

    if (m === 'globe') {
      const cx = w / 2 + view.current.pan[0]
      const cy = h / 2 + view.current.pan[1]
      const r = (Math.min(w, h) / 2 - (small ? 4 : 10)) * zoom + 2
      const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.14)
      halo.addColorStop(0, 'rgba(94, 234, 212, 0)')
      halo.addColorStop(0.45, 'rgba(94, 234, 212, 0.20)')
      halo.addColorStop(1, 'rgba(94, 234, 212, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2)
      ctx.fillStyle = halo
      ctx.fill()
    }

    /* Graticule */
    ctx.beginPath()
    path(geoGraticule10())
    ctx.strokeStyle = 'rgba(120, 190, 255, 0.10)'
    ctx.lineWidth = 0.7
    ctx.stroke()

    /* Terres colorées */
    const colors = colorsRef.current
    for (const country of countries.features) {
      ctx.beginPath()
      path(country)
      ctx.fillStyle = colors.get(String(country.id)) ?? '#6f806b'
      ctx.fill()
    }

    /* Frontières */
    ctx.beginPath()
    for (const country of countries.features) path(country)
    ctx.strokeStyle = zoom > 2 ? 'rgba(6, 12, 22, 0.85)' : 'rgba(6, 12, 22, 0.55)'
    ctx.lineWidth = zoom > 2 ? 1 : 0.6
    ctx.stroke()

    /* Lacs */
    const lakes = lakesRef.current
    if (lakes && !lowQuality) {
      ctx.beginPath()
      for (const lake of lakes) path(lake as never)
      ctx.fillStyle = '#1b4a6e'
      ctx.fill()
      ctx.strokeStyle = 'rgba(120, 190, 235, 0.45)'
      ctx.lineWidth = 0.6
      ctx.stroke()
    }

    /* Rivières */
    const rivers = riversRef.current
    if (rivers && !lowQuality && zoom >= (m === 'globe' ? 1.5 : 1.35)) {
      ctx.beginPath()
      for (const river of rivers.minor) path(river as never)
      ctx.strokeStyle = 'rgba(96, 176, 226, 0.42)'
      ctx.lineWidth = Math.min(1.1, 0.45 + zoom * 0.08)
      ctx.stroke()

      ctx.beginPath()
      for (const river of rivers.major) path(river as never)
      ctx.strokeStyle = 'rgba(120, 196, 240, 0.68)'
      ctx.lineWidth = Math.min(1.9, 0.7 + zoom * 0.16)
      ctx.stroke()
    }

    /* Routes */
    const roads = roadsRef.current
    if (roads && !lowQuality && zoom >= (m === 'globe' ? 2.6 : 2.2)) {
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (const road of roads.minor) path(road as never)
      ctx.strokeStyle = 'rgba(247, 198, 91, 0.30)'
      ctx.lineWidth = 0.6
      ctx.stroke()

      ctx.beginPath()
      for (const road of roads.major) path(road as never)
      ctx.strokeStyle = 'rgba(255, 208, 112, 0.68)'
      ctx.lineWidth = Math.min(1.6, 0.7 + zoom * 0.14)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }

    ctx.restore()
  }

  /* -------------------------------- rendu --------------------------------- */

  drawRef.current = () => {
    const canvas = canvasRef.current
    const countries = countriesHiRef.current
    if (!canvas || !countries) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = view.current.size
    if (!w || !h) return

    const base = baseRef.current
    if (base) {
      if (baseDirtyRef.current || base.width !== canvas.width || base.height !== canvas.height) {
        baseDirtyRef.current = false
        renderBase()
      }
      ctx.clearRect(0, 0, w, h)
      if (base.width > 0 && base.height > 0) ctx.drawImage(base, 0, 0, w, h)
    }

    const {
      pin: playerPin,
      selectedIso: isoSelected,
      target: targetPoint,
      targetIso: isoTarget,
      mode: m,
      labels: showLabels,
      compact: small,
    } = propsRef.current

    const lowQuality = view.current.lowQuality || propsRef.current.autoRotate
    const active = (lowQuality ? countriesLoRef.current : countries) ?? countries
    const projection = buildProjection(w, h)
    const path = geoPath(projection, ctx)

    const project = (coords: LonLat): [number, number] | null => {
      if (m === 'globe') {
        const center: LonLat = [-view.current.rotation[0], -view.current.rotation[1]]
        if (geoDistance(coords, center) > HORIZON) return null
      }
      const pt = projection(coords)
      return pt ? [pt[0], pt[1]] : null
    }

    const paintCountry = (iso: string, fill: string, stroke: string) => {
      const found = active.features.find((f) => String(f.id) === iso)
      if (!found) return
      ctx.beginPath()
      path(found)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.8
      ctx.stroke()
    }

    const hovered = view.current.hovered
    if (hovered && showLabels) {
      const id = String(hovered.id)
      if (id !== String(isoSelected) && id !== String(isoTarget)) {
        ctx.beginPath()
        path(hovered)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.lineWidth = 1.1
        ctx.stroke()
      }
    }

    if (isoSelected) paintCountry(String(isoSelected), 'rgba(94, 234, 212, 0.42)', '#5eead4')
    if (isoTarget) paintCountry(String(isoTarget), 'rgba(247, 198, 91, 0.45)', '#f7c65b')

    if (playerPin && targetPoint) {
      const a = project(playerPin)
      const b = project(targetPoint)
      if (a && b) {
        ctx.beginPath()
        path({ type: 'LineString', coordinates: [playerPin, targetPoint] } as never)
        ctx.setLineDash([6, 7])
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.85)'
        ctx.lineWidth = 1.8
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    const marker = (coords: LonLat, color: string, rgb: string, radius: number, halo: boolean) => {
      const pt = project(coords)
      if (!pt) return
      if (halo) {
        ctx.beginPath()
        ctx.arc(pt[0], pt[1], radius * 3.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb}, 0.18)`
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(pt[0], pt[1], radius + 2.4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(4, 10, 20, 0.85)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(pt[0], pt[1], radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.2
      ctx.stroke()
    }

    if (playerPin) marker(playerPin, '#fb7185', '251, 113, 133', small ? 4.5 : 6, false)
    if (targetPoint) marker(targetPoint, '#f7c65b', '247, 198, 91', small ? 4.5 : 6, true)
  }

  const schedule = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      drawRef.current()
    })
  }, [])
  scheduleRef.current = schedule

  /* ------------------------------ dimensionnement -------------------------- */

  const resize = useCallback(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const rect = wrap.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (!baseRef.current) baseRef.current = document.createElement('canvas')
    const base = baseRef.current
    base.width = canvas.width
    base.height = canvas.height
    base.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)

    view.current.size = { w: rect.width, h: rect.height }
    baseDirtyRef.current = true
    schedule()
  }, [schedule])

  /* ------------------------------- chargement ------------------------------ */

  useEffect(() => {
    let cancelled = false

    Promise.all([
      loadJson<any>('/geo/countries-50m.json'),
      loadJson<any>('/geo/countries-110m.json').catch(() => null),
    ])
      .then(([hi, lo]) => {
        if (cancelled) return
        const high = feature(hi, hi.objects.countries) as unknown as CountryCollection
        countriesHiRef.current = high
        countriesLoRef.current = lo ? (feature(lo, lo.objects.countries) as unknown as CountryCollection) : high

        const colors = new Map<string, string>()
        const index: CountryIndexEntry[] = []
        for (const f of high.features) {
          const id = String(f.id)
          colors.set(id, colorFor(id))
          const [[x0, y0], [x1, y1]] = geoBounds(f)
          index.push({ feature: f, id, name: f.properties?.name ?? '', bbox: [x0, y0, x1, y1], wide: x1 - x0 > 180 })
        }
        colorsRef.current = colors
        indexRef.current = index
        setReady(true)
        baseDirtyRef.current = true
        resize()
      })
      .catch(() => setReady(false))

    loadJson<any>('/geo/lakes-50m.json')
      .then((t) => {
        lakesRef.current = toFeatures(t, 'water')
        baseDirtyRef.current = true
        scheduleRef.current()
      })
      .catch(() => undefined)

    loadJson<any>('/geo/rivers-50m.json')
      .then((t) => {
        riversRef.current = { major: toFeatures(t, 'major'), minor: toFeatures(t, 'minor') }
        baseDirtyRef.current = true
        scheduleRef.current()
      })
      .catch(() => undefined)

    loadJson<any>('/geo/roads-10m.json')
      .then((t) => {
        roadsRef.current = { major: toFeatures(t, 'major'), minor: toFeatures(t, 'minor') }
        baseDirtyRef.current = true
        scheduleRef.current()
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [resize])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [resize])

  useEffect(() => {
    schedule()
  }, [pin, selectedIso, target, targetIso, mode, labels, schedule])

  useEffect(() => {
    view.current.zoom = 1
    view.current.pan = [0, 0]
    view.current.rotation = [...initialRotation] as LonLat
    baseDirtyRef.current = true
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (!autoRotate) return
    let raf = 0
    let last = performance.now()
    const spin = (now: number) => {
      if (!view.current.dragging && now - last > 40) {
        view.current.rotation[0] -= 0.16
        baseDirtyRef.current = true
        scheduleRef.current()
        last = now
      }
      raf = requestAnimationFrame(spin)
    }
    raf = requestAnimationFrame(spin)
    return () => cancelAnimationFrame(raf)
  }, [autoRotate])

  /* ------------------------------ interaction ------------------------------ */

  const findCountry = (lon: number, lat: number): PickedCountry | null => {
    for (const entry of indexRef.current) {
      if (!entry.wide) {
        const [x0, y0, x1, y1] = entry.bbox
        const inLon = (lon >= x0 && lon <= x1) || (lon >= x0 - 360 && lon <= x1 - 360)
        if (!inLon || lat < y0 || lat > y1) continue
      }
      if (geoContains(entry.feature, [lon, lat])) return { id: entry.id, name: entry.name }
    }
    return null
  }

  const atPixel = (clientX: number, clientY: number): { lonlat: LonLat; country: PickedCountry | null } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const { w, h } = view.current.size
    if (!w) return null
    const projection = buildProjection(w, h)
    const inv = projection.invert?.([x, y])
    if (!inv || Number.isNaN(inv[0]) || Number.isNaN(inv[1])) return null
    const lon = ((inv[0] + 540) % 360) - 180
    const lat = Math.max(-90, Math.min(90, inv[1]))
    if (propsRef.current.mode === 'globe') {
      const center: LonLat = [-view.current.rotation[0], -view.current.rotation[1]]
      if (geoDistance([lon, lat], center) > HORIZON) return null
    }
    return { lonlat: [lon, lat], country: findCountry(lon, lat) }
  }

  const clampPan = () => {
    const { w, h } = view.current.size
    const z = view.current.zoom
    const maxX = ((z - 1) * w) / 2 + 30
    const maxY = ((z - 1) * h) / 2 + 30
    view.current.pan = [
      Math.max(-maxX, Math.min(maxX, view.current.pan[0])),
      Math.max(-maxY, Math.min(maxY, view.current.pan[1])),
    ]
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    view.current.pointers.set(e.pointerId, [e.clientX, e.clientY])
    view.current.dragging = true
    view.current.moved = 0
    view.current.last = [e.clientX, e.clientY]
    view.current.lowQuality = true
    baseDirtyRef.current = true
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0'
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    const pointers = view.current.pointers
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY])

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
      if (view.current.pinchDist > 0) {
        const max = propsRef.current.mode === 'globe' ? 6 : 14
        view.current.zoom = Math.max(0.8, Math.min(max, view.current.zoom * (dist / view.current.pinchDist)))
        clampPan()
        baseDirtyRef.current = true
        schedule()
      }
      view.current.pinchDist = dist
      return
    }

    if (view.current.dragging) {
      const dx = e.clientX - view.current.last[0]
      const dy = e.clientY - view.current.last[1]
      view.current.moved += Math.abs(dx) + Math.abs(dy)
      view.current.last = [e.clientX, e.clientY]
      if (propsRef.current.mode === 'globe') {
        const speed = 0.34 / Math.sqrt(view.current.zoom)
        view.current.rotation[0] += dx * speed
        view.current.rotation[1] = Math.max(-88, Math.min(88, view.current.rotation[1] - dy * speed))
      } else {
        view.current.pan[0] += dx
        view.current.pan[1] += dy
        clampPan()
      }
      baseDirtyRef.current = true
      schedule()
      return
    }

    if (!propsRef.current.labels || indexRef.current.length === 0) return
    const hit = atPixel(e.clientX, e.clientY)
    const hovered = hit?.country ?? null
    const tooltip = tooltipRef.current
    if (tooltip) {
      if (hovered) {
        const rect = wrapRef.current?.getBoundingClientRect()
        tooltip.textContent = hovered.name
        tooltip.style.opacity = '1'
        tooltip.style.transform = `translate(${e.clientX - (rect?.left ?? 0) + 14}px, ${
          e.clientY - (rect?.top ?? 0) + 12
        }px)`
      } else {
        tooltip.style.opacity = '0'
      }
    }
    const found = hovered ? indexRef.current.find((c) => c.id === hovered.id)?.feature ?? null : null
    if (found !== view.current.hovered) {
      view.current.hovered = found
      schedule()
    }
  }

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    view.current.pointers.delete(e.pointerId)
    if (view.current.pointers.size < 2) view.current.pinchDist = 0
    const wasDrag = view.current.moved > 6
    view.current.dragging = false
    if (view.current.lowQuality) {
      view.current.lowQuality = false
      baseDirtyRef.current = true
      schedule()
    }
    if (!wasDrag && onPick) {
      const hit = atPixel(e.clientX, e.clientY)
      if (hit) onPick(hit.lonlat, hit.country)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !interactive) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const max = propsRef.current.mode === 'globe' ? 6 : 14
      view.current.zoom = Math.max(0.8, Math.min(max, view.current.zoom * Math.exp(-e.deltaY * 0.0015)))
      clampPan()
      baseDirtyRef.current = true
      schedule()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [interactive, schedule])

  const zoomBy = (factor: number) => {
    const max = propsRef.current.mode === 'globe' ? 6 : 14
    view.current.zoom = Math.max(0.8, Math.min(max, view.current.zoom * factor))
    clampPan()
    baseDirtyRef.current = true
    schedule()
  }

  const resetView = () => {
    view.current.zoom = 1
    view.current.pan = [0, 0]
    view.current.rotation = [...initialRotation] as LonLat
    baseDirtyRef.current = true
    schedule()
  }

  return (
    <div ref={wrapRef} className={`map-frame ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Carte du monde interactive. Faites glisser pour tourner, cliquez sur un pays pour le choisir, utilisez la molette pour zoomer."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => {
          if (tooltipRef.current) tooltipRef.current.style.opacity = '0'
        }}
        style={{ cursor: interactive ? undefined : 'default' }}
      />
      <div
        ref={tooltipRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          padding: '4px 10px',
          borderRadius: 8,
          background: 'rgba(4,10,20,0.9)',
          border: '1px solid rgba(140,175,220,0.28)',
          fontSize: 12,
          color: '#dfe9fa',
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 120ms ease',
          whiteSpace: 'nowrap',
          zIndex: 5,
        }}
      />
      {interactive && (
        <div className="map-hud-right">
          <button type="button" className="pill" onClick={() => zoomBy(1.45)} aria-label="Zoom avant" title="Zoom avant">
            ＋
          </button>
          <button type="button" className="pill" onClick={() => zoomBy(1 / 1.45)} aria-label="Zoom arrière" title="Zoom arrière">
            −
          </button>
          <button type="button" className="pill" onClick={resetView} aria-label="Revenir à la vue globale" title="Vue globale">
            ⟲
          </button>
        </div>
      )}
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Chargement de la carte…
        </div>
      )}
    </div>
  )
}
