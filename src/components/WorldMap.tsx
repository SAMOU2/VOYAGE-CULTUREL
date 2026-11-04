'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
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

type LonLat = [number, number]

interface WorldMapProps {
  mode?: 'globe' | 'flat'
  pin?: LonLat | null
  target?: LonLat | null
  targetIso?: string | null
  onPick?: (coords: LonLat) => void
  interactive?: boolean
  autoRotate?: boolean
  labels?: boolean
  className?: string
  initialRotation?: LonLat
  compact?: boolean
}

type CountryFeature = Feature<Geometry, { name: string }>
type Countries = FeatureCollection<Geometry, { name: string }>

const COLORS = {
  land: '#12263f',
  border: 'rgba(126, 174, 214, 0.34)',
  graticule: 'rgba(94, 234, 212, 0.09)',
  teal: '#5eead4',
  gold: '#f7c65b',
  rose: '#fb7185',
  sphereGlow: 'rgba(45, 212, 191, 0.3)',
}

const EARTH = { type: 'Feature', properties: {}, geometry: { type: 'Sphere' } } as unknown as CountryFeature

let geoCache: Promise<Countries> | null = null

function loadCountries(): Promise<Countries> {
  if (!geoCache) {
    geoCache = fetch('/geo/countries-110m.json')
      .then((r) => {
        if (!r.ok) throw new Error('géo indisponible')
        return r.json()
      })
      .then((topo) => feature(topo, topo.objects.countries) as unknown as Countries)
      .catch((err) => {
        geoCache = null
        throw err
      })
  }
  return geoCache
}

/** Distance angulaire maximale pour considérer un point comme visible sur le globe. */
const HORIZON = Math.PI / 2

export default function WorldMap({
  mode = 'globe',
  pin = null,
  target = null,
  targetIso = null,
  onPick,
  interactive = true,
  autoRotate = false,
  labels = false,
  className = '',
  initialRotation = [-20, -12],
  compact = false,
}: WorldMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const countriesRef = useRef<Countries | null>(null)
  const frameRef = useRef<number | null>(null)
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
  })

  const propsRef = useRef({ pin, target, targetIso, mode, labels, compact })
  propsRef.current = { pin, target, targetIso, mode, labels, compact }

  const drawRef = useRef<() => void>(() => {})

  const schedule = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      drawRef.current()
    })
  }, [])

  const buildProjection = useCallback((): GeoProjection => {
    const { w, h } = view.current.size
    const m = propsRef.current.mode
    const pad = propsRef.current.compact ? 4 : 10
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

  drawRef.current = () => {
    const canvas = canvasRef.current
    const countries = countriesRef.current
    if (!canvas || !countries) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = view.current.size
    if (!w || !h) return

    const { pin: playerPin, target: targetPoint, targetIso: iso, mode: m, labels: showLabels, compact: small } = propsRef.current
    const projection = buildProjection()
    const path = geoPath(projection, ctx)

    ctx.clearRect(0, 0, w, h)

    // Océan
    const grad = ctx.createRadialGradient(w * 0.42, h * 0.34, 8, w * 0.5, h * 0.52, Math.max(w, h) * 0.8)
    grad.addColorStop(0, '#0e2239')
    grad.addColorStop(1, m === 'globe' ? '#050d19' : '#03070f')
    ctx.beginPath()
    path(EARTH)
    ctx.fillStyle = grad
    ctx.fill()
    if (m === 'globe') {
      ctx.strokeStyle = COLORS.sphereGlow
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Graticule
    ctx.beginPath()
    path(geoGraticule10())
    ctx.strokeStyle = COLORS.graticule
    ctx.lineWidth = 0.7
    ctx.stroke()

    // Terres
    ctx.beginPath()
    for (const f of countries.features) path(f)
    ctx.fillStyle = COLORS.land
    ctx.fill()
    ctx.strokeStyle = COLORS.border
    ctx.lineWidth = view.current.zoom > 2 ? 0.9 : 0.55
    ctx.stroke()

    const hovered = view.current.hovered
    if (hovered && showLabels) {
      ctx.beginPath()
      path(hovered)
      ctx.fillStyle = 'rgba(148, 197, 235, 0.18)'
      ctx.fill()
    }

    if (iso) {
      const highlighted = countries.features.find((f) => String(f.id) === String(iso))
      if (highlighted) {
        ctx.beginPath()
        path(highlighted)
        ctx.fillStyle = 'rgba(94, 234, 212, 0.34)'
        ctx.fill()
        ctx.strokeStyle = COLORS.teal
        ctx.lineWidth = 1.6
        ctx.stroke()
      }
    }

    const project = (coords: LonLat): [number, number] | null => {
      if (m === 'globe') {
        const center: LonLat = [-view.current.rotation[0], -view.current.rotation[1]]
        if (geoDistance(coords, center) > HORIZON) return null
      }
      const pt = projection(coords)
      return pt ? [pt[0], pt[1]] : null
    }

    // Route géodésique entre le repère du joueur et le lieu attendu
    if (playerPin && targetPoint) {
      const a = project(playerPin)
      const b = project(targetPoint)
      if (a && b) {
        ctx.beginPath()
        path({ type: 'LineString', coordinates: [playerPin, targetPoint] } as never)
        ctx.setLineDash([6, 7])
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.8)'
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
        ctx.fillStyle = `rgba(${rgb}, 0.16)`
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

    if (playerPin) marker(playerPin, COLORS.rose, '251, 113, 133', small ? 4.5 : 6, false)
    if (targetPoint) marker(targetPoint, COLORS.gold, '247, 198, 91', small ? 4.5 : 6, true)
  }

  // Définit la taille du canvas (devicePixelRatio inclus)
  const resize = useCallback(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const rect = wrap.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    view.current.size = { w: rect.width, h: rect.height }
    schedule()
  }, [schedule])

  useEffect(() => {
    let cancelled = false
    loadCountries()
      .then((fc) => {
        if (cancelled) return
        countriesRef.current = fc
        setReady(true)
        resize()
      })
      .catch(() => setReady(false))
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
  }, [pin, target, targetIso, mode, labels, schedule])

  useEffect(() => {
    view.current.zoom = 1
    view.current.pan = [0, 0]
    view.current.rotation = [...initialRotation] as LonLat
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Rotation automatique (accueil)
  useEffect(() => {
    if (!autoRotate) return
    let raf = 0
    let last = performance.now()
    const spin = (now: number) => {
      if (!view.current.dragging && now - last > 40) {
        view.current.rotation[0] -= 0.16
        drawRef.current()
        last = now
      }
      raf = requestAnimationFrame(spin)
    }
    raf = requestAnimationFrame(spin)
    return () => cancelAnimationFrame(raf)
  }, [autoRotate])

  const toLonLat = (clientX: number, clientY: number): LonLat | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (!view.current.size.w) return null
    const projection = buildProjection()
    const inv = projection.invert?.([x, y])
    if (!inv || Number.isNaN(inv[0]) || Number.isNaN(inv[1])) return null
    if (propsRef.current.mode === 'globe') {
      const center: LonLat = [-view.current.rotation[0], -view.current.rotation[1]]
      if (geoDistance([inv[0], inv[1]], center) > HORIZON) return null
    }
    return [inv[0], inv[1]]
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
        const max = propsRef.current.mode === 'globe' ? 6 : 12
        view.current.zoom = Math.max(0.8, Math.min(max, view.current.zoom * (dist / view.current.pinchDist)))
        clampPan()
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
      schedule()
      return
    }

    if (!propsRef.current.labels || !countriesRef.current) return
    const ll = toLonLat(e.clientX, e.clientY)
    const hovered = ll ? countriesRef.current.features.find((f) => geoContains(f, ll)) ?? null : null
    const tooltip = tooltipRef.current
    if (tooltip) {
      if (hovered) {
        const rect = wrapRef.current?.getBoundingClientRect()
        tooltip.textContent = hovered.properties?.name ?? ''
        tooltip.style.opacity = '1'
        tooltip.style.transform = `translate(${e.clientX - (rect?.left ?? 0) + 14}px, ${
          e.clientY - (rect?.top ?? 0) + 12
        }px)`
      } else {
        tooltip.style.opacity = '0'
      }
    }
    if (hovered !== view.current.hovered) {
      view.current.hovered = hovered
      schedule()
    }
  }

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    view.current.pointers.delete(e.pointerId)
    if (view.current.pointers.size < 2) view.current.pinchDist = 0
    const wasDrag = view.current.moved > 6
    view.current.dragging = false
    if (!wasDrag && onPick) {
      const ll = toLonLat(e.clientX, e.clientY)
      if (ll) onPick(ll)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !interactive) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const max = propsRef.current.mode === 'globe' ? 6 : 12
      view.current.zoom = Math.max(0.8, Math.min(max, view.current.zoom * Math.exp(-e.deltaY * 0.0015)))
      clampPan()
      schedule()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [interactive, schedule])

  const zoomBy = (factor: number) => {
    const max = propsRef.current.mode === 'globe' ? 6 : 12
    view.current.zoom = Math.max(0.8, Math.min(max, view.current.zoom * factor))
    clampPan()
    schedule()
  }

  const resetView = () => {
    view.current.zoom = 1
    view.current.pan = [0, 0]
    view.current.rotation = [...initialRotation] as LonLat
    schedule()
  }

  return (
    <div ref={wrapRef} className={`map-frame ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Globe terrestre interactif. Faites glisser pour tourner, cliquez pour placer un repère, utilisez la molette pour zoomer."
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
          Chargement du globe…
        </div>
      )}
    </div>
  )
}
