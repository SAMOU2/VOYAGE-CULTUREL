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
      return (await response.json()) as Topology<Record<string, MultiLineString>>
    })
    .catch((error) => {
      roads = undefined
      throw error
    })
  return roads
}
export const countryColor = (id: string): string => {
  const palette = [
    '#91b993',
    '#d4b87e',
    '#8ab9b3',
    '#c6aa85',
    '#8eaf7e',
    '#d9c295',
    '#a3c6c8',
    '#beb497',
    '#b2c5a0',
    '#d5a491',
  ]
  const hash = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 0)
  return id === '010' ? '#cce3e9' : palette[Math.abs(hash) % palette.length]
}
