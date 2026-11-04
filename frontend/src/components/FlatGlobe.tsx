'use client'

import { useEffect, useRef, useState } from 'react'
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo'
import { buildCountryIndex, findCountryAt, isCoordinates } from '@shared/geometry'
import type { CountryFeature } from '@shared/types'
import { countryColor, loadCountries } from '@/lib/geodata'
import type { GlobeProps } from './Globe'
import { Icon } from './Icon'

/** Secours réellement utilisable si WebGL est absent ou si le contexte GPU est perdu. */
export default function FlatGlobe(props: GlobeProps) {
  const canvas = useRef<HTMLCanvasElement>(null),
    latest = useRef(props)
  latest.current = props
  const [features, setFeatures] = useState<CountryFeature[]>([])
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [failure, setFailure] = useState(false)
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
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const index = buildCountryIndex(features)
    let projection = geoEquirectangular()
    const draw = () => {
      const { width, height } = element.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      element.width = Math.round(width * dpr)
      element.height = Math.round(height * dpr)
      const context = element.getContext('2d')!
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      projection = geoEquirectangular()
        .scale(Math.min(width / (2 * Math.PI), height / Math.PI) * zoom * 0.94)
        .translate([width / 2 + pan.x, height / 2 + pan.y])
        .center(latest.current.target?.pin ?? [0, 0])
      const path = geoPath(projection, context)
      context.beginPath()
      path({ type: 'Sphere' })
      context.fillStyle = '#17466b'
      context.fill()
      context.beginPath()
      path(geoGraticule10())
      context.strokeStyle = '#c1d8ec20'
      context.lineWidth = 0.5
      context.stroke()
      for (const country of features) {
        const id = String(country.id)
        context.beginPath()
        path(country)
        context.fillStyle =
          id === props.target?.countryId
            ? '#85e7bc'
            : id === props.selection?.country.id
              ? '#f9cb83'
              : countryColor(id)
        context.fill()
        context.strokeStyle = '#f5f3df80'
        context.lineWidth = 0.55
        context.stroke()
      }
    }
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    draw()
    const click = (event: PointerEvent) => {
      const start = drag.current
      drag.current = null
      if (
        !start ||
        props.disabled ||
        !props.onSelect ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
      )
        return
      const rect = element.getBoundingClientRect()
      const pin = projection.invert?.([event.clientX - rect.left, event.clientY - rect.top])
      if (!isCoordinates(pin)) return
      const country = findCountryAt(index, ...pin)
      if (country) props.onSelect({ country: { id: country.id, name: country.name }, pin })
      else props.onOcean?.()
    }
    element.addEventListener('pointerup', click)
    return () => {
      observer.disconnect()
      element.removeEventListener('pointerup', click)
    }
  }, [
    features,
    zoom,
    pan,
    props.disabled,
    props.selection,
    props.target,
    props.onSelect,
    props.onOcean,
  ])
  return (
    <div className="flat-globe">
      <canvas
        ref={canvas}
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
          ? 'La carte ne peut pas être chargée. Vérifiez la connexion au stand.'
          : 'WebGL indisponible · sélectionnez un pays sur la carte.'}
      </p>
    </div>
  )
}
