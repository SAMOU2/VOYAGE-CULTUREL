'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo'
import { buildCountryIndex, findCountryAt, isCoordinates } from '@shared/geometry'
import type { CountryFeature } from '@shared/types'
import { loadCountries, loadEarthImage } from '@/lib/geodata'
import { EARTH_COLORS } from '@/lib/globeConfig'
import type { GlobeProps } from './Globe'
import { Icon } from './Icon'

/** Secours 2D : mêmes pays, image naturelle, souris, toucher et clavier. */
export default function FlatGlobe(props: GlobeProps) {
  const canvas = useRef<HTMLCanvasElement>(null),
    latest = useRef(props)
  latest.current = props
  const [features, setFeatures] = useState<CountryFeature[]>([]),
    [earth, setEarth] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [failure, setFailure] = useState(false)
  const index = useMemo(() => buildCountryIndex(features), [features])
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  useEffect(() => {
    let active = true
    void loadCountries('50m')
      .then((data) => {
        if (active) setFeatures(data)
      })
      .catch(() => {
        if (active) setFailure(true)
      })
    void loadEarthImage(window.matchMedia('(max-width:760px)').matches ? 2048 : 4096)
      .then((image) => {
        if (active) setEarth(image)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    let projection = geoEquirectangular()
    const draw = () => {
      const { width, height } = element.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 1.5)
      element.width = Math.round(width * dpr)
      element.height = Math.round(height * dpr)
      const context = element.getContext('2d')!
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      projection = geoEquirectangular()
        .scale(Math.min(width / (2 * Math.PI), height / Math.PI) * zoom * 0.94)
        .translate([width / 2 + pan.x, height / 2 + pan.y])
        .center(props.target?.pin ?? props.spotlight?.pin ?? props.focus ?? [0, 0])
      const path = geoPath(projection, context)
      context.beginPath()
      path({ type: 'Sphere' })
      context.fillStyle = EARTH_COLORS.ocean
      context.fill()
      if (earth) {
        const origin = projection([-180, 90])!
        context.drawImage(
          earth,
          origin[0],
          origin[1],
          2 * Math.PI * projection.scale(),
          Math.PI * projection.scale(),
        )
      }
      context.beginPath()
      path(geoGraticule10())
      context.strokeStyle = '#ffffff28'
      context.lineWidth = 0.5
      context.stroke()
      const allowed = props.allowedCountryIds ? new Set(props.allowedCountryIds) : null
      for (const country of features) {
        const id = String(country.id),
          highlight =
            id === props.target?.countryId ||
            id === props.spotlight?.countryId ||
            id === props.selection?.country.id
        context.beginPath()
        path(country)
        if (!earth) {
          context.fillStyle = EARTH_COLORS.land
          context.fill()
        }
        if (allowed && !allowed.has(id)) {
          context.fillStyle = '#08275e35'
          context.fill()
        }
        if (highlight) {
          context.fillStyle = '#00b4d835'
          context.fill()
        }
        context.strokeStyle = '#08275e90'
        context.lineWidth = highlight ? 2.2 : 0.9
        context.stroke()
        context.strokeStyle = highlight ? EARTH_COLORS.selection : EARTH_COLORS.border
        context.lineWidth = highlight ? 1.2 : 0.5
        context.stroke()
      }
    }
    const choose = (x: number, y: number) => {
      const current = latest.current
      if (current.disabled || !current.onSelect) return
      const pin = projection.invert?.([x, y])
      if (!isCoordinates(pin)) return
      const country = findCountryAt(index, ...pin)
      if (country) current.onSelect({ country: { id: country.id, name: country.name }, pin })
      else current.onOcean?.()
    }
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    draw()
    const click = (event: PointerEvent) => {
      const start = drag.current
      drag.current = null
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
      const rect = element.getBoundingClientRect()
      choose(event.clientX - rect.left, event.clientY - rect.top)
    }
    const key = (event: KeyboardEvent) => {
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', '+', '-'].includes(
          event.key,
        )
      )
        return
      event.preventDefault()
      if (event.key === 'Enter' || event.key === ' ') {
        const rect = element.getBoundingClientRect()
        choose(rect.width / 2, rect.height / 2)
      } else if (event.key === '+' || event.key === '-')
        setZoom((z) => Math.max(1, Math.min(8, z * (event.key === '+' ? 1.3 : 1 / 1.3))))
      else
        setPan((p) => ({
          x: p.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0),
          y: p.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0),
        }))
    }
    element.addEventListener('pointerup', click)
    element.addEventListener('keydown', key)
    return () => {
      observer.disconnect()
      element.removeEventListener('pointerup', click)
      element.removeEventListener('keydown', key)
    }
  }, [
    features,
    index,
    earth,
    zoom,
    pan,
    props.target,
    props.spotlight,
    props.focus,
    props.allowedCountryIds,
    props.selection,
  ])
  return (
    <div className="flat-globe">
      <canvas
        ref={canvas}
        tabIndex={props.spotlight ? -1 : 0}
        data-ready={features.length > 0}
        aria-label="Planisphère interactif de secours"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, ox: pan.x, oy: pan.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6)
            setPan({ x: start.ox + event.clientX - start.x, y: start.oy + event.clientY - start.y })
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      />
      <div className="globe-tools">
        <button
          className="icon-button"
          aria-label="Zoomer sur la carte"
          onClick={() => setZoom((z) => Math.min(8, z * 1.4))}
        >
          <Icon name="plus" />
        </button>
        <button
          className="icon-button"
          aria-label="Dézoomer la carte"
          onClick={() => setZoom((z) => Math.max(1, z / 1.4))}
        >
          <Icon name="minus" />
        </button>
        <button
          className="icon-button"
          aria-label="Recentrer la carte"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          <Icon name="reset" />
        </button>
      </div>
      <p className="fallback-message" role="status">
        {failure
          ? 'Carte indisponible. Vérifiez la connexion au stand.'
          : 'Carte de secours · sélectionnez un pays ou utilisez le choix au clavier.'}
      </p>
    </div>
  )
}
