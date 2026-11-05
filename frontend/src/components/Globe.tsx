'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { buildCountryIndex, findCountryAt, sphereCoordinates, spherePoint } from '@shared/geometry'
import type { Coordinates, CountryFeature } from '@shared/types'
import { loadCountries, loadEarthImage, loadRoads } from '@/lib/geodata'
import { EARTH_COLORS, GLOBE_INITIAL } from '@/lib/globeConfig'
import { Icon } from './Icon'
import FlatGlobe from './FlatGlobe'

export interface Selection {
  country: { id: string; name: string }
  pin: Coordinates
}
export interface GlobeProps {
  selection?: Selection | null
  target?: { countryId: string; pin: Coordinates } | null
  onSelect?: (selection: Selection) => void
  onOcean?: () => void
  disabled?: boolean
  compact?: boolean
  autoRotate?: boolean
  spotlight?: { countryId: string; pin: Coordinates } | null
  focus?: Coordinates | null
  allowedCountryIds?: string[] | null
}
interface GlobeApi {
  zoom: (factor: number) => void
  reset: () => void
  pins: () => void
  mode: () => void
}
const initial = GLOBE_INITIAL.coordinates

export default function Globe(props: GlobeProps) {
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props),
    api = useRef<GlobeApi | null>(null)
  propsRef.current = props
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [generation, setGeneration] = useState(0)
  const [detail, setDetail] = useState(false)

  useEffect(() => {
    const element = container.current,
      surface = canvas.current
    if (!element || !surface) return
    let renderer: THREE.WebGLRenderer
    const small = window.matchMedia('(max-width: 760px)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: surface,
        alpha: true,
        antialias: !small,
        powerPreference: 'high-performance',
      })
    } catch {
      setStatus('fallback')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(GLOBE_INITIAL.fov, 1, 0.05, 30)
    camera.position.set(...spherePoint(initial, GLOBE_INITIAL.distance))
    const controls = new OrbitControls(camera, surface)
    controls.enablePan = false
    controls.enableDamping = !reduced
    controls.dampingFactor = 0.1
    controls.minDistance = 1.4
    controls.maxDistance = 6
    controls.minPolarAngle = 0.06
    controls.maxPolarAngle = Math.PI - 0.06
    controls.autoRotateSpeed = 0.3
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.7
    scene.add(new THREE.HemisphereLight('#ffffff', '#a9bdd2', 1.8))
    const light = new THREE.DirectionalLight('#ffffff', 1.8)
    light.position.set(5, 4, 3)
    scene.add(light)
    const rim = new THREE.DirectionalLight('#a8dce8', 0.6)
    rim.position.set(-4, 1, -3)
    scene.add(rim)
    const geometry = new THREE.SphereGeometry(1, small ? 64 : 96, small ? 48 : 64)
    const material = new THREE.MeshStandardMaterial({
      color: EARTH_COLORS.ocean,
      roughness: 0.86,
      metalness: 0.04,
    })
    const planet = new THREE.Mesh(geometry, material)
    scene.add(planet)
    const atmosphere = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        vertexShader:
          'varying vec3 vNormal; varying vec3 vView; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=-p.xyz;gl_Position=projectionMatrix*p;}',
        fragmentShader:
          'varying vec3 vNormal; varying vec3 vView; void main(){float a=pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),3.0);gl_FragColor=vec4(0.0,0.67,0.83,a*0.28);}',
      }),
    )
    atmosphere.scale.setScalar(1.02)
    scene.add(atmosphere)
    const overlayCanvas = document.createElement('canvas')
    overlayCanvas.width = 2048
    overlayCanvas.height = 1024
    const overlayTexture = new THREE.CanvasTexture(overlayCanvas)
    overlayTexture.colorSpace = THREE.SRGBColorSpace
    const overlay = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: overlayTexture, transparent: true, depthWrite: false }),
    )
    overlay.scale.setScalar(1.003)
    scene.add(overlay)
    const marker = (color: string) => {
      const group = new THREE.Group()
      group.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.012, 12, 8),
          new THREE.MeshBasicMaterial({ color }),
        ),
      )
      group.add(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.025, 0.003, 6, 32),
          new THREE.MeshBasicMaterial({ color }),
        ),
      )
      group.visible = false
      scene.add(group)
      return group
    }
    const selectedMarker = marker(EARTH_COLORS.selection),
      answerMarker = marker(EARTH_COLORS.answer)
    let disposed = false,
      contextLost = false,
      visible = true,
      frame = 0,
      features: CountryFeature[] = [],
      index = buildCountryIndex([])
    let atlas: THREE.CanvasTexture | undefined,
      roadLoading = false,
      roadsDrawn = false
    let focus: {
        from: THREE.Vector3
        rotation: THREE.Quaternion
        distance: number
        start: number
      } | null = null,
      lastFocus = '',
      lastRender = 0

    function invalidate() {
      if (disposed || contextLost || !visible || document.hidden || frame) return
      frame = requestAnimationFrame(render)
    }
    function syncMode() {
      const rotating = Boolean(propsRef.current.autoRotate && !reduced)
      controls.autoRotate = rotating
      element!.dataset.rotating = String(rotating)
      element!.dataset.reducedMotion = String(reduced)
      invalidate()
    }
    function render(time: number) {
      frame = 0
      if (disposed || contextLost || !visible || document.hidden) return
      const rotating = Boolean(propsRef.current.autoRotate && !reduced)
      // La veille tourne à 30 images/s au maximum ; en jeu le rendu reste à la demande.
      if (rotating && time - lastRender < 1000 / 30) {
        invalidate()
        return
      }
      const delta = lastRender ? Math.min(0.05, (time - lastRender) / 1000) : 1 / 60
      lastRender = time
      if (focus) {
        const progress = reduced ? 1 : Math.min(1, (time - focus.start) / 800)
        const eased = progress * progress * (3 - 2 * progress)
        const rotation = new THREE.Quaternion().slerp(focus.rotation, eased)
        const distance = THREE.MathUtils.lerp(focus.distance, GLOBE_INITIAL.distance, eased)
        camera.position.copy(focus.from).applyQuaternion(rotation).multiplyScalar(distance)
        if (progress >= 1) focus = null
      }
      controls.autoRotate = rotating && !focus
      const changing = controls.update(delta)
      light.position.copy(camera.position).multiplyScalar(2)
      light.position.y += 2
      renderer.render(scene, camera)
      if (focus || changing || rotating) invalidate()
    }
    function aim(pin: Coordinates) {
      const from = camera.position.clone().normalize(),
        to = new THREE.Vector3(...spherePoint(pin)).normalize()
      focus = {
        from,
        rotation: new THREE.Quaternion().setFromUnitVectors(from, to),
        distance: camera.position.length(),
        start: performance.now(),
      }
      invalidate()
    }
    function place(group: THREE.Group, pin: Coordinates | null) {
      group.visible = Boolean(pin)
      if (!pin) return
      group.position.set(...spherePoint(pin, 1.012))
      group.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        group.position.clone().normalize(),
      )
    }
    function pins() {
      if (disposed || contextLost) return
      const { selection, target, spotlight, allowedCountryIds } = propsRef.current
      const context = overlayCanvas.getContext('2d')!
      context.clearRect(0, 0, 2048, 1024)
      const path = geoPath(
        geoEquirectangular()
          .scale(2048 / (2 * Math.PI))
          .translate([1024, 512]),
        context,
      )
      if (allowedCountryIds?.length) {
        const allowed = new Set(allowedCountryIds)
        for (const country of features)
          if (!allowed.has(String(country.id))) {
            context.beginPath()
            path(country)
            context.fillStyle = '#08275e35'
            context.fill()
          }
      }
      for (const [id, color] of [
        [selection?.country.id, EARTH_COLORS.selection],
        [target?.countryId, EARTH_COLORS.answer],
        [spotlight?.countryId, EARTH_COLORS.selection],
      ] as const) {
        const country = features.find((f) => String(f.id) === id)
        if (!country) continue
        context.beginPath()
        path(country)
        context.fillStyle = `${color}25`
        context.fill()
        context.strokeStyle = '#08275e'
        context.lineWidth = 2.9
        context.stroke()
        context.strokeStyle = color
        context.lineWidth = 1.6
        context.stroke()
      }
      overlayTexture.needsUpdate = true
      place(selectedMarker, selection?.pin ?? null)
      place(answerMarker, target?.pin ?? spotlight?.pin ?? null)
      const pin = target?.pin ?? spotlight?.pin ?? propsRef.current.focus
      const focusKey = pin
        ? `${target?.countryId ?? spotlight?.countryId ?? 'keyboard'}:${pin.join(',')}`
        : ''
      if (focusKey && focusKey !== lastFocus) aim(pin!)
      lastFocus = focusKey
      invalidate()
    }
    async function paint(countries: CountryFeature[], level: '110m' | '50m') {
      if (disposed || contextLost) return
      features = countries
      index = buildCountryIndex(countries)
      const width: 2048 | 4096 | 8192 =
        level === '50m' && !small
          ? element!.clientHeight > 1100 && renderer.capabilities.maxTextureSize >= 8192
            ? 8192
            : 4096
          : 2048
      let earth: HTMLImageElement | null = null
      try {
        earth = await loadEarthImage(width)
      } catch {
        /* secours terrain uniforme si l'image manque */
      }
      if (disposed || contextLost) return
      const map = document.createElement('canvas')
      map.width = width
      map.height = width / 2
      const context = map.getContext('2d')!
      context.fillStyle = EARTH_COLORS.ocean
      context.fillRect(0, 0, map.width, map.height)
      if (earth) context.drawImage(earth, 0, 0, map.width, map.height)
      const projection = geoEquirectangular()
        .scale(width / (2 * Math.PI))
        .translate([width / 2, width / 4])
      const path = geoPath(projection, context)
      context.beginPath()
      path(geoGraticule10())
      context.strokeStyle = '#ffffff18'
      context.lineWidth = (width / 4096) * 0.55
      context.stroke()
      for (const country of countries) {
        context.beginPath()
        path(country)
        if (!earth) {
          context.fillStyle = EARTH_COLORS.land
          context.fill()
        }
        context.strokeStyle = '#08275e70'
        context.lineWidth = (width / 4096) * 1.7
        context.stroke()
        context.strokeStyle = EARTH_COLORS.border
        context.lineWidth = (width / 4096) * 0.8
        context.stroke()
      }
      element!.dataset.texture = earth ? String(width) : 'fallback'
      const next = new THREE.CanvasTexture(map)
      next.colorSpace = THREE.SRGBColorSpace
      next.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
      atlas?.dispose()
      atlas = next
      material.map = next
      material.color.set('#ffffff')
      material.needsUpdate = true
      element!.dataset.lod = level
      setStatus('ready')
      pins()
      if (level === '50m') {
        setDetail(true)
        void maybeRoads()
      }
    }
    async function maybeRoads() {
      if (
        camera.position.length() > 2.8 ||
        !atlas ||
        !detailReady() ||
        roadLoading ||
        roadsDrawn ||
        disposed ||
        contextLost
      )
        return
      roadLoading = true
      try {
        const topology = await loadRoads()
        if (disposed || contextLost || !atlas) return
        const map = atlas.image as HTMLCanvasElement
        const context = map.getContext('2d')!
        const path = geoPath(
          geoEquirectangular()
            .scale(map.width / (2 * Math.PI))
            .translate([map.width / 2, map.height / 2]),
          context,
        )
        for (const [name, color, width] of [
          ['minor', '#dff8ff80', 0.42],
          ['major', '#ffffffbd', 0.7],
        ] as const) {
          if (!topology.objects[name]) continue
          context.beginPath()
          path(feature(topology, topology.objects[name]))
          context.strokeStyle = color
          context.lineWidth = (width * map.width) / 4096
          context.stroke()
        }
        atlas.needsUpdate = true
        roadsDrawn = true
        element!.dataset.roads = 'ready'
        invalidate()
      } catch {
        /* les frontières et la sélection restent utilisables sans les routes */
      } finally {
        roadLoading = false
      }
    }
    function detailReady() {
      return element!.dataset.lod === '50m'
    }
    const changed = () => {
      void maybeRoads()
      invalidate()
    }
    controls.addEventListener('change', changed)
    controls.addEventListener('start', () => {
      focus = null
    })
    controls.update()
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect()
      renderer.setSize(Math.max(1, width), Math.max(1, height), false)
      camera.aspect = width / Math.max(1, height)
      camera.fov =
        camera.aspect < 1
          ? THREE.MathUtils.radToDeg(
              2 *
                Math.atan(
                  Math.tan(THREE.MathUtils.degToRad(GLOBE_INITIAL.fov / 2)) / camera.aspect,
                ),
            )
          : GLOBE_INITIAL.fov
      camera.updateProjectionMatrix()
      invalidate()
    })
    resize.observe(element)
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true
      if (!visible && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      if (visible) invalidate()
    })
    observer.observe(element)
    const visibility = () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      } else invalidate()
    }
    document.addEventListener('visibilitychange', visibility)
    const raycaster = new THREE.Raycaster()
    const pointers = new Set<number>()
    let down = { x: 0, y: 0, time: 0 },
      multitouch = false
    const pointerDown = (event: PointerEvent) => {
      if (!pointers.size) {
        multitouch = false
        down = { x: event.clientX, y: event.clientY, time: performance.now() }
      }
      pointers.add(event.pointerId)
      if (pointers.size > 1) multitouch = true
    }
    const pointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (
        multitouch ||
        propsRef.current.disabled ||
        !propsRef.current.onSelect ||
        performance.now() - down.time > 650 ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6
      )
        return
      const rect = surface!.getBoundingClientRect()
      const position = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      if (Math.abs(position.x) > 1 || Math.abs(position.y) > 1) return
      raycaster.setFromCamera(position, camera)
      const hit = raycaster.intersectObject(planet)[0]
      if (!hit) return
      const pin = sphereCoordinates(hit.point.toArray() as [number, number, number])
      const country = findCountryAt(index, ...pin)
      if (country)
        propsRef.current.onSelect({ country: { id: country.id, name: country.name }, pin })
      else propsRef.current.onOcean?.()
    }
    const pointerCancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      multitouch = true
    }
    const keyboard = (event: KeyboardEvent) => {
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', '+', '-'].includes(
          event.key,
        )
      )
        return
      event.preventDefault()
      const pin = sphereCoordinates(camera.position.toArray() as [number, number, number])
      if (event.key === 'Enter' || event.key === ' ') {
        if (propsRef.current.disabled) return
        const country = findCountryAt(index, ...pin)
        if (country)
          propsRef.current.onSelect?.({ country: { id: country.id, name: country.name }, pin })
        else propsRef.current.onOcean?.()
      } else if (event.key === '+' || event.key === '-')
        api.current?.zoom(event.key === '+' ? 0.8 : 1.25)
      else {
        const step = event.shiftKey ? 1 : 5
        pin[0] =
          ((pin[0] +
            (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) +
            540) %
            360) -
          180
        pin[1] = Math.max(
          -85,
          Math.min(
            85,
            pin[1] + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
          ),
        )
        aim(pin)
      }
    }
    const lost = (event: Event) => {
      event.preventDefault()
      contextLost = true
      setStatus('fallback')
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    }
    surface.addEventListener('keydown', keyboard)
    surface.addEventListener('pointerdown', pointerDown)
    surface.addEventListener('pointerup', pointerUp)
    surface.addEventListener('pointercancel', pointerCancel)
    surface.addEventListener('webglcontextlost', lost)
    api.current = {
      zoom: (factor) => {
        focus = null
        camera.position
          .multiplyScalar(factor)
          .clampLength(controls.minDistance, controls.maxDistance)
        controls.update()
        invalidate()
      },
      reset: () => {
        aim(propsRef.current.target?.pin ?? initial)
      },
      pins,
      mode: syncMode,
    }
    syncMode()
    let detailTimer: ReturnType<typeof setTimeout> | undefined
    void loadCountries('110m')
      .then((countries) => paint(countries, '110m'))
      .then(() => {
        // Le détail est différé après la première image, jamais recalculé à chaque frame.
        if (!disposed && !contextLost)
          detailTimer = setTimeout(() => {
            void loadCountries('50m')
              .then((countries) => paint(countries, '50m'))
              .catch(() => undefined)
          }, 120)
      })
      .catch(() => {
        if (!disposed) setStatus('fallback')
      })
    invalidate()
    return () => {
      disposed = true
      api.current = null
      if (frame) cancelAnimationFrame(frame)
      if (detailTimer) clearTimeout(detailTimer)
      resize.disconnect()
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      surface.removeEventListener('keydown', keyboard)
      surface.removeEventListener('pointerdown', pointerDown)
      surface.removeEventListener('pointerup', pointerUp)
      surface.removeEventListener('pointercancel', pointerCancel)
      surface.removeEventListener('webglcontextlost', lost)
      controls.dispose()
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry)
          for (const m of Array.isArray(object.material) ? object.material : [object.material])
            materials.add(m)
        }
      })
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      atlas?.dispose()
      overlayTexture.dispose()
      renderer.dispose()
      // StrictMode réutilise le même canvas : ne pas perdre son contexte au remontage.
      setTimeout(() => {
        if (!surface.isConnected) renderer.forceContextLoss()
      }, 0)
    }
  }, [generation])

  useEffect(() => {
    api.current?.pins()
  }, [props.selection, props.target, props.spotlight, props.focus, props.allowedCountryIds])
  useEffect(() => {
    api.current?.mode()
  }, [props.autoRotate])

  return (
    <div
      className={`globe-stage ${props.compact ? 'globe-compact' : ''}`}
      ref={container}
      data-testid="globe"
      data-renderer={status === 'fallback' ? '2d' : status === 'ready' ? 'webgl' : 'loading'}
    >
      <div className="globe-hud">
        <span className="live-dot" />
        {status === 'fallback'
          ? 'Carte de secours'
          : detail
            ? 'Globe détaillé'
            : 'Chargement du globe'}
      </div>
      <canvas
        key={generation}
        ref={canvas}
        className="webgl-canvas"
        tabIndex={props.spotlight ? -1 : 0}
        title="Clavier : flèches pour explorer, Entrée pour choisir, +/− pour zoomer"
        style={{ visibility: status === 'fallback' ? 'hidden' : 'visible' }}
        aria-label="Globe terrestre 3D interactif : glisser pour tourner, cliquer pour choisir un pays"
      />
      {status === 'loading' && (
        <div className="globe-loading">
          <span className="loading-orbit" />
          La Terre se prépare…
        </div>
      )}
      {status === 'fallback' ? (
        <FlatGlobe {...props} />
      ) : (
        <>
          <div className="globe-tools">
            <button
              className="icon-button"
              aria-label="Zoomer sur le globe"
              onClick={() => api.current?.zoom(0.8)}
            >
              <Icon name="plus" />
            </button>
            <button
              className="icon-button"
              aria-label="Dézoomer le globe"
              onClick={() => api.current?.zoom(1.25)}
            >
              <Icon name="minus" />
            </button>
            <span />
            <button
              className="icon-button"
              aria-label="Recentrer le globe"
              onClick={() => api.current?.reset()}
            >
              <Icon name="reset" width="18" height="18" />
            </button>
          </div>
          <div className="globe-instructions">
            <span className="drag-icon">↔</span>Glissez pour explorer
            <span className="instruction-divider" />
            Cliquez sur un pays
          </div>
        </>
      )}
      {status === 'fallback' && (
        <button
          className="retry-3d"
          onClick={() => {
            setStatus('loading')
            setGeneration((n) => n + 1)
          }}
        >
          Réessayer la 3D
        </button>
      )}
    </div>
  )
}
