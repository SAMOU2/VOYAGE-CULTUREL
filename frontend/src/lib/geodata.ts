import { feature } from 'topojson-client'
import type { CountryFeature, CountryTopology } from '@shared/types'
import type { MultiLineString, Topology } from 'topojson-specification'

const cache = new Map<string, Promise<CountryFeature[]>>()
export function loadCountries(level: '110m' | '50m'): Promise<CountryFeature[]> {
  const existing = cache.get(level)
  if (existing) return existing
  const request = fetch(`/geo/countries-${level}.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error('Carte indisponible')
      const topology: CountryTopology = await response.json()
      return feature(topology, topology.objects.countries).features as CountryFeature[]
    })
    .catch((error) => {
      cache.delete(level)
      throw error
    })
  cache.set(level, request)
  return request
}
let roads: Promise<Topology<Record<string, MultiLineString>>> | undefined
export function loadRoads() {
  roads ??= fetch('/geo/roads-10m.json')
    .then(async (response) => {
      if (!response.ok) throw new Error('Routes indisponibles')
      return response.json() as Promise<Topology<Record<string, MultiLineString>>>
    })
    .catch((error) => {
      roads = undefined
      throw error
    })
  return roads
}
const images = new Map<number, Promise<HTMLImageElement>>()
export function loadEarthImage(size: 2048 | 4096 | 8192): Promise<HTMLImageElement> {
  const cached = images.get(size)
  if (cached) return cached
  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => {
      images.delete(size)
      reject(new Error('Texture terrestre indisponible'))
    }
    image.src = `/textures/earth-day-${size}.jpg`
  })
  images.set(size, request)
  return request
}
