'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface PreviewMark {
  lat: number
  lng: number
  name: string
  rounding: 'port' | 'starboard'
  isTemp?: boolean
}

interface LinePoint {
  lat: number
  lng: number
}

interface CoursePreviewMapProps {
  marks: PreviewMark[]
  startLine?: LinePoint[] | null
  finishLine?: LinePoint[] | null
  finishAtStart?: boolean
}

function midpoint(a: LinePoint, b: LinePoint): [number, number] {
  return [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2]
}

export default function CoursePreviewMap({ marks, startLine, finishLine, finishAtStart }: CoursePreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false })
    L.control.zoom({ position: 'topright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 0.8,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear existing layers (except tile layers)
    map.eachLayer(layer => {
      if (!(layer instanceof L.TileLayer)) map.removeLayer(layer)
    })

    if (marks.length === 0) return

    // Collect all points for bounds
    const allPoints: [number, number][] = marks.map(m => [m.lat, m.lng])

    // Draw start line
    if (startLine && startLine.length === 2) {
      allPoints.push([startLine[0].lat, startLine[0].lng], [startLine[1].lat, startLine[1].lng])

      L.circleMarker([startLine[0].lat, startLine[0].lng], {
        radius: 5, fillColor: '#f59e0b', fillOpacity: 0.9, color: '#fff', weight: 2,
      }).addTo(map)
      L.circleMarker([startLine[1].lat, startLine[1].lng], {
        radius: 5, fillColor: '#f59e0b', fillOpacity: 0.9, color: '#fff', weight: 2,
      }).addTo(map)

      L.polyline([[startLine[0].lat, startLine[0].lng], [startLine[1].lat, startLine[1].lng]], {
        color: '#f59e0b', weight: 3, opacity: 0.9, dashArray: '6,4',
      }).addTo(map)

      // Label
      const isShared = finishAtStart === true
      const mp = midpoint(startLine[0], startLine[1])
      L.marker(mp, {
        icon: L.divIcon({
          html: `<div style="background:${isShared ? '#7c3aed' : '#d97706'};color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;white-space:nowrap">${isShared ? 'START / FINISH' : 'START'}</div>`,
          className: '',
          iconSize: [70, 16],
          iconAnchor: [35, 8],
        }),
        interactive: false,
      }).addTo(map)

      // Line from start midpoint to first mark
      if (marks.length > 0) {
        L.polyline([mp, [marks[0].lat, marks[0].lng]], {
          color: '#1d4ed8', weight: 3, opacity: 0.85,
        }).addTo(map)
      }
    }

    // Draw course lines between marks
    for (let i = 0; i < marks.length - 1; i++) {
      L.polyline([[marks[i].lat, marks[i].lng], [marks[i + 1].lat, marks[i + 1].lng]], {
        color: '#1d4ed8', weight: 3, opacity: 0.85,
      }).addTo(map)
    }

    // Draw finish line (separate or use start)
    const effectiveFinish = finishAtStart
      ? startLine
      : finishLine

    if (effectiveFinish && effectiveFinish.length === 2 && !finishAtStart) {
      allPoints.push([effectiveFinish[0].lat, effectiveFinish[0].lng], [effectiveFinish[1].lat, effectiveFinish[1].lng])

      L.circleMarker([effectiveFinish[0].lat, effectiveFinish[0].lng], {
        radius: 5, fillColor: '#2563eb', fillOpacity: 0.9, color: '#fff', weight: 2,
      }).addTo(map)
      L.circleMarker([effectiveFinish[1].lat, effectiveFinish[1].lng], {
        radius: 5, fillColor: '#2563eb', fillOpacity: 0.9, color: '#fff', weight: 2,
      }).addTo(map)

      L.polyline([[effectiveFinish[0].lat, effectiveFinish[0].lng], [effectiveFinish[1].lat, effectiveFinish[1].lng]], {
        color: '#2563eb', weight: 3, opacity: 0.85,
      }).addTo(map)

      const mp = midpoint(effectiveFinish[0], effectiveFinish[1])
      L.marker(mp, {
        icon: L.divIcon({
          html: `<div style="background:#1d4ed8;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;white-space:nowrap">FINISH</div>`,
          className: '',
          iconSize: [50, 16],
          iconAnchor: [25, 8],
        }),
        interactive: false,
      }).addTo(map)
    }

    // Line from last mark to finish midpoint
    if (marks.length > 0 && effectiveFinish && effectiveFinish.length === 2) {
      const fm = midpoint(effectiveFinish[0], effectiveFinish[1])
      L.polyline([[marks[marks.length - 1].lat, marks[marks.length - 1].lng], fm], {
        color: '#1d4ed8', weight: 3, opacity: 0.85,
      }).addTo(map)
    }

    // Draw mark circles
    marks.forEach((m, i) => {
      const color = m.rounding === 'port' ? '#dc2626' : '#16a34a'
      const circle = L.circleMarker([m.lat, m.lng], {
        radius: 10,
        fillColor: m.isTemp ? '#ea580c' : color,
        fillOpacity: 0.85,
        color: '#fff',
        weight: 2,
        dashArray: m.isTemp ? '4,3' : undefined,
      })
      circle.bindTooltip(`<strong>${i + 1}. ${m.name}</strong><br/><span style="font-size:10px">${m.rounding === 'port' ? '🔴 Port' : '🟢 Starboard'}</span>`, {
        direction: 'top', offset: [0, -12],
      })
      circle.addTo(map)

      // Number label
      const numIcon = L.divIcon({
        html: `<div style="background:${m.isTemp ? '#ea580c' : color};color:#fff;width:18px;height:18px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${i + 1}</div>`,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [-3, 20],
      })
      L.marker([m.lat, m.lng], { icon: numIcon, interactive: false }).addTo(map)
    })

    // Fit bounds
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints)
      map.fitBounds(bounds.pad(0.3), { maxZoom: 16 })
    }
  }, [marks, startLine, finishLine, finishAtStart])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
