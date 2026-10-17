// Map style built in code on OpenFreeMap vector tiles (OpenMapTiles schema, no API key), coloured per theme.
// Only map tiles and glyphs are requested from the tile server; nothing about the user is sent.
import type { StyleSpecification } from 'maplibre-gl'
import type { LatLng } from '../types/vehicle'

export const TILE_SOURCE = 'https://tiles.openfreemap.org/planet'
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

export interface MapColors { land: string; water: string; park: string; building: string; road: string; roadMajor: string; roadCasing: string; label: string; labelHalo: string }
export const MAP_COLORS: Record<'light' | 'dark', MapColors> = {
  light: { land: '#EEF0F1', water: '#C9D6E2', park: '#DDE8DC', building: '#E2E5E7', road: '#FFFFFF', roadMajor: '#FFFFFF', roadCasing: '#D3D8DC', label: '#5E6870', labelHalo: '#F4F6F6' },
  dark: { land: '#1B1E22', water: '#14202C', park: '#1C2621', building: '#23272C', road: '#2C3137', roadMajor: '#4A515B', roadCasing: '#15181B', label: '#B4BBC5', labelHalo: '#12151A' },
}

/** VinFast skin palette (PROPOSED, navy-blue tint). Selected only by the /cockpit/vinfast/ entry. */
export const MAP_COLORS_VINFAST: Record<'light' | 'dark', MapColors> = {
  light: { land: '#E6EEF7', water: '#BCD9F2', park: '#D7EBE3', building: '#DBE5F0', road: '#FFFFFF', roadMajor: '#FFFFFF', roadCasing: '#C9D6E4', label: '#526575', labelHalo: '#F3F7FB' },
  dark: { land: '#0C2238', water: '#0A3A63', park: '#0F3047', building: '#123152', road: '#1D4468', roadMajor: '#2F6FA3', roadCasing: '#081A2B', label: '#B3C3D4', labelHalo: '#071522' },
}

export function mapStyle(mode: 'light' | 'dark', palette: 'default' | 'vinfast' = 'default'): StyleSpecification {
  const c = (palette === 'vinfast' ? MAP_COLORS_VINFAST : MAP_COLORS)[mode]
  const roadWidth = (base: number) => ['interpolate', ['exponential', 1.6], ['zoom'], 10, base * 0.4, 14, base * 2, 18, base * 10] as never
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { omt: { type: 'vector', url: TILE_SOURCE } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c.land } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': c.park } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood']]], paint: { 'fill-color': c.park, 'fill-opacity': 0.6 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': c.water } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': c.building } },
      { id: 'road-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.roadCasing, 'line-width': roadWidth(1.5) } },
      { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'street']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.road, 'line-width': roadWidth(0.7) } },
      { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.roadMajor, 'line-width': roadWidth(1.2) } },
      { id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 13, 'symbol-spacing': 420, 'text-padding': 12 }, paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.4 } },
      { id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb']]],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 14, 'text-padding': 16 }, paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.4 } },
    ],
  }
}

export interface Place extends LatLng { id: string; name: string; sub: string; kind: 'home' | 'work' | 'school' | 'charger' | 'poi' }
// Demo places in Hà Nội. Names are generic labels, not businesses.
export const START: LatLng & { heading: number } = { lat: 21.02868, lng: 105.85222, heading: 200 }
export const PLACES: Place[] = [
  { id: 'work', name: 'Văn phòng', sub: '25 Láng Hạ, Đống Đa', lat: 21.01453, lng: 105.81374, kind: 'work' },
  { id: 'school', name: 'Trường tiểu học', sub: 'Trần Thái Tông, Cầu Giấy', lat: 21.03268, lng: 105.79053, kind: 'school' },
  { id: 'home', name: 'Nhà', sub: 'Nguyễn Văn Cừ, Long Biên', lat: 21.04436, lng: 105.87375, kind: 'home' },
  { id: 'westlake', name: 'Hồ Tây', sub: 'Đường Thanh Niên', lat: 21.04952, lng: 105.83696, kind: 'poi' },
  { id: 'airport', name: 'Sân bay Nội Bài', sub: 'Sóc Sơn', lat: 21.21865, lng: 105.80413, kind: 'poi' },
  { id: 'charger-tc', name: 'Trạm sạc nhanh', sub: 'Minh Khai, Hai Bà Trưng', lat: 20.99567, lng: 105.86744, kind: 'charger' },
  { id: 'charger-md', name: 'Trạm sạc nhanh', sub: 'Lê Đức Thọ, Nam Từ Liêm', lat: 21.02868, lng: 105.76523, kind: 'charger' },
]
export const CHARGERS = PLACES.filter((p) => p.kind === 'charger')
