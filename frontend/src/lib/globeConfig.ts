import type { Coordinates } from '../../../shared/types.js'

export const GLOBE_INITIAL: { coordinates: Coordinates; distance: number; fov: number } = {
  coordinates: [14, 22],
  distance: 3.25,
  fov: 40,
}
export const EARTH_COLORS = {
  ocean: '#203e79',
  land: '#82916c',
  selection: '#00b4d8',
  answer: '#ffffff',
  border: '#ffffffa6',
}
