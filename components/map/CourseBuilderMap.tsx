'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Mark, RoundingSide } from '@/types/database'

// Fix Leaflet icon paths in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

export type BuilderMode = 'setStart' | 'addLegs' | 'setFinish' | 'review'

export interface CourseLeg {
  id: string
  markId: string
  markName: string
  lat: number
  lng: number
  roundingSide: RoundingSide
  isTemp: boolean
}

export interface LinePoint {
  lat: number
  lng: number
}

interface CourseBuilderMapProps {
  mode: BuilderMode
  catalogueMarks: Mark[]
  legs: CourseLeg[]
  startLine: LinePoint[]
  startLineLabels?: string[]
  finishLine: LinePoint[] | null
  finishAtStart: boolean | null
  onMapClick: (lat: number, lng: number) => void
  onCatalogueMarkClick: (mark: Mark) => void
  onLegClick: (legIndex: number) => void
  center?: [number, number]
  zoom?: number
}

function addGraticule(map: L.Map) {
  const group = L.layerGroup()
  function draw() {
    group.clearLayers()
    const bounds = map.getBounds()
    const z = map.getZoom()
    const interval = z >= 16 ? 0.001 : z >= 14 ? 0.005 : z >= 12 ? 0.01 : z >= 10 ? 0.05 : z >= 8 ? 0.1 : 0.5
    const s = Math.floor(bounds.getSouth() / interval) * interval
    const n = Math.ceil(bounds.getNorth() / interval) * interval
    const w = Math.floor(bounds.getWest() / interval) * interval
    const e = Math.ceil(bounds.getEast() / interval) * interval
    for (let lat = s; lat <= n; lat += interval) {
      L.polyline([[lat, w], [lat, e]], { color: '#666', weight: 0.5, opacity: 0.4, dashArray: '4,4' }).addTo(group)
    }
    for (let lon = w; lon <= e; lon += interval) {
      L.polyline([[s, lon], [n, lon]], { color: '#666', weight: 0.5, opacity: 0.4, dashArray: '4,4' }).addTo(group)
    }
  }
  map.on('moveend', draw)
  map.on('zoomend', draw)
  draw()
  group.addTo(map)
}

// Haversine distance in nautical miles
export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065 // Earth radius in nautical miles
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function makeLineLabel(text: string, color: string) {
  return L.divIcon({
    html: `<div style="background:${color};color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px;box-shadow:0 1px 3px rgba(0,0,0,0.3);white-space:nowrap">${text}</div>`,
    className: '',
    iconSize: [60, 20],
    iconAnchor: [30, 10],
  })
}

function midpoint(a: LinePoint, b: LinePoint): [number, number] {
  return [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2]
}

export default function CourseBuilderMap({
  mode,
  catalogueMarks,
  legs,
  startLine,
  startLineLabels = [],
  finishLine,
  finishAtStart,
  onMapClick,
  onCatalogueMarkClick,
  onLegClick,
  center = [51.35, 0.73],
  zoom = 13,
}: CourseBuilderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const initDoneRef = useRef(false)

  // Mutable refs for callbacks — stable references for the map's click handler
  const onMapClickRef = useRef(onMapClick)
  const onCatMarkClickRef = useRef(onCatalogueMarkClick)
  const onLegClickRef = useRef(onLegClick)
  onMapClickRef.current = onMapClick
  onCatMarkClickRef.current = onCatalogueMarkClick
  onLegClickRef.current = onLegClick

  // Layer group refs
  const catLayerRef = useRef<L.LayerGroup | null>(null)
  const startLayerRef = useRef<L.LayerGroup | null>(null)
  const courseLayerRef = useRef<L.LayerGroup | null>(null)
  const finishLayerRef = useRef<L.LayerGroup | null>(null)

  // ─── Init map once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || initDoneRef.current) return
    initDoneRef.current = true

    const map = L.map(containerRef.current, { center, zoom, zoomControl: false })
    L.control.zoom({ position: 'topleft' }).addTo(map)
    L.control.scale({ position: 'bottomright', metric: true, imperial: true }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map)

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 0.8,
    }).addTo(map)

    addGraticule(map)

    catLayerRef.current = L.layerGroup().addTo(map)
    startLayerRef.current = L.layerGroup().addTo(map)
    courseLayerRef.current = L.layerGroup().addTo(map)
    finishLayerRef.current = L.layerGroup().addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      initDoneRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Map cursor ───────────────────────────────────────────────────────────
  useEffect(() => {
    const c = mapRef.current?.getContainer()
    if (!c) return
    c.style.cursor = (mode === 'setStart' || mode === 'setFinish' || mode === 'addLegs') ? 'crosshair' : ''
  }, [mode])

  // ─── Catalogue marks ──────────────────────────────────────────────────────
  useEffect(() => {
    const layer = catLayerRef.current
    if (!layer) return
    layer.clearLayers()

    catalogueMarks.forEach((m) => {
      // check if already in legs
      const inLegs = legs.some(l => l.markId === m.id)
      const circle = L.circleMarker([m.lat, m.lon], {
        radius: 9,
        fillColor: inLegs ? '#6366f1' : '#1e3a5f',
        fillOpacity: 0.9,
        color: '#fff',
        weight: 2,
        interactive: true,
      })
      circle.bindTooltip(`<strong>${m.name}</strong><br/><span style="font-size:10px;color:#888">${m.short_id}</span>`, {
        direction: 'top', offset: [0, -12],
      })
      circle.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e)
        onCatMarkClickRef.current(m)
      })
      layer.addLayer(circle)
    })

    if (catalogueMarks.length > 0 && mapRef.current && legs.length === 0 && startLine.length === 0) {
      const bounds = L.latLngBounds(catalogueMarks.map(mk => [mk.lat, mk.lon] as [number, number]))
      mapRef.current.flyToBounds(bounds.pad(0.4), { duration: 1, maxZoom: 15 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogueMarks, legs])

  // ─── Start line ───────────────────────────────────────────────────────────
  useEffect(() => {
    const layer = startLayerRef.current
    if (!layer) return
    layer.clearLayers()

    startLine.forEach((pt, idx) => {
      const label = startLineLabels[idx]
      const isCommittee = label === 'Committee Boat'
      const marker = L.circleMarker([pt.lat, pt.lng], {
        radius: isCommittee ? 8 : 6,
        fillColor: isCommittee ? '#92400e' : '#f59e0b',
        fillOpacity: 0.95,
        color: '#fff',
        weight: 2,
        interactive: false,
      })
      if (label) {
        marker.bindTooltip(`<strong>${label}</strong>`, {
          direction: 'top', offset: [0, -10], permanent: false,
        })
      }
      marker.addTo(layer)
    })

    if (startLine.length === 2) {
      L.polyline([[startLine[0].lat, startLine[0].lng], [startLine[1].lat, startLine[1].lng]], {
        color: '#f59e0b',
        weight: 4,
        opacity: 0.9,
        dashArray: '8,4',
        interactive: false,
      }).addTo(layer)

      // Label: "START / FINISH" if shared, otherwise just "START"
      const isShared = finishAtStart === true
      const mp = midpoint(startLine[0], startLine[1])
      L.marker(mp, { icon: makeLineLabel(isShared ? 'START / FINISH' : 'START', isShared ? '#7c3aed' : '#d97706'), interactive: false }).addTo(layer)
    }
  }, [startLine, startLineLabels, finishAtStart])

  // ─── Course legs ──────────────────────────────────────────────────────────
  useEffect(() => {
    const layer = courseLayerRef.current
    if (!layer) return
    layer.clearLayers()

    // Draw polylines between legs
    if (legs.length > 1) {
      for (let i = 0; i < legs.length - 1; i++) {
        const from = legs[i]
        const to = legs[i + 1]
        const line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
          color: '#1d4ed8',
          weight: 3,
          opacity: 0.85,
          interactive: false,
        })
        layer.addLayer(line)

        // Small arrowhead at midpoint
        const mx = (from.lat + to.lat) / 2
        const my = (from.lng + to.lng) / 2
        const dx = to.lng - from.lng
        const dy = to.lat - from.lat
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 0.0001) {
          const nx = dx / len
          const ny = dy / len
          const sz = 0.0004
          const tip: [number, number] = [mx + ny * sz * 1.5, my + nx * sz * 1.5]
          const left: [number, number] = [mx - ny * sz * 0.5 - nx * sz * 0.8, my - nx * sz * 0.5 + ny * sz * 0.8]
          const right: [number, number] = [mx - ny * sz * 0.5 + nx * sz * 0.8, my - nx * sz * 0.5 - ny * sz * 0.8]
          layer.addLayer(L.polyline([left, tip, right], {
            color: '#1d4ed8', weight: 2, opacity: 0.8, interactive: false,
          }))
        }
      }

    }

    // Line from start line midpoint to first leg
    if (startLine.length === 2 && legs.length > 0) {
      const sm = midpoint(startLine[0], startLine[1])
      layer.addLayer(L.polyline([sm, [legs[0].lat, legs[0].lng]], {
        color: '#1d4ed8', weight: 3, opacity: 0.85, interactive: false,
      }))
    }

    // Line from last leg to finish line midpoint
    if (legs.length > 0 && mode === 'review') {
      const lastLeg = legs[legs.length - 1]
      const effectiveFinish = finishAtStart === true
        ? (startLine.length === 2 ? startLine : null)
        : (finishLine && finishLine.length === 2 ? finishLine : null)

      if (effectiveFinish) {
        const fm = midpoint(effectiveFinish[0], effectiveFinish[1])
        layer.addLayer(L.polyline([[lastLeg.lat, lastLeg.lng], fm], {
          color: '#1d4ed8', weight: 3, opacity: 0.85, interactive: false,
        }))
      }
    }

    // Markers for each leg
    legs.forEach((leg, i) => {
      const color = leg.roundingSide === 'port' ? '#dc2626' : '#16a34a'

      if (leg.isTemp) {
        // Temp mark: orange dashed circle + label
        const circle = L.circleMarker([leg.lat, leg.lng], {
          radius: 10,
          fillColor: '#ea580c',
          fillOpacity: 0.7,
          color: '#ea580c',
          weight: 2,
          dashArray: '4,3',
          interactive: true,
        })
        circle.bindTooltip(`<strong>${leg.markName}</strong><br/><span style="font-size:10px;color:#888">Temp mark</span>`, {
          direction: 'top', offset: [0, -12],
        })
        circle.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e)
          onLegClickRef.current(i)
        })
        layer.addLayer(circle)
      } else {
        // Catalogue mark used in course: coloured with order number
        const circle = L.circleMarker([leg.lat, leg.lng], {
          radius: 12,
          fillColor: color,
          fillOpacity: 0.85,
          color: '#fff',
          weight: 2,
          interactive: true,
        })
        circle.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e)
          onLegClickRef.current(i)
        })
        circle.bindTooltip(`<strong>${leg.markName}</strong><br/>${leg.roundingSide === 'port' ? '🔴 Port' : '🟢 Starboard'}`, {
          direction: 'top', offset: [0, -14],
        })
        layer.addLayer(circle)
      }

      // Order number label
      const numIcon = L.divIcon({
        html: `<div style="background:${leg.isTemp ? '#ea580c' : color};color:#fff;width:20px;height:20px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,0.4);margin-top:-20px;margin-left:-20px">${i + 1}</div>`,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [-2, 22],
      })
      layer.addLayer(L.marker([leg.lat, leg.lng], { icon: numIcon, interactive: false }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs, startLine, mode, finishAtStart, finishLine])

  // ─── Finish line ──────────────────────────────────────────────────────────
  useEffect(() => {
    const layer = finishLayerRef.current
    if (!layer) return
    layer.clearLayers()

    // If finish is at start, the start line layer already shows "START / FINISH" label
    // Only draw a separate finish line if finishAtStart is false
    if (finishAtStart === true) return
    if (!finishLine || finishLine.length < 2) return

    const [a, b] = finishLine
    L.circleMarker([a.lat, a.lng], {
      radius: 6, fillColor: '#2563eb', fillOpacity: 0.95, color: '#fff', weight: 2, interactive: false,
    }).addTo(layer)
    L.circleMarker([b.lat, b.lng], {
      radius: 6, fillColor: '#2563eb', fillOpacity: 0.95, color: '#fff', weight: 2, interactive: false,
    }).addTo(layer)

    L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
      color: '#2563eb', weight: 4, opacity: 0.85, interactive: false,
    }).addTo(layer)

    const mp = midpoint(a, b)
    L.marker(mp, { icon: makeLineLabel('FINISH', '#1d4ed8'), interactive: false }).addTo(layer)
  }, [finishLine, finishAtStart, startLine])

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0 }}
    />
  )
}
