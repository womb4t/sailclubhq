'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface RaceMapMark {
  lat: number
  lon: number
  name: string
  roundingSide: 'port' | 'starboard'
  index: number
}

export interface RaceMapProps {
  center: [number, number]
  courseMarks: RaceMapMark[]
  startLine: { lat1: number; lng1: number; lat2: number; lng2: number } | null
  finishLine: { lat1: number; lng1: number; lat2: number; lng2: number } | null
  finishAtStart?: boolean
  currentPosition: { lat: number; lon: number; heading: number } | null
  nextMarkIndex: number
  courseUp: boolean
  laps: number
  currentLap: number
}

function midpoint(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): [number, number] {
  return [(lat1 + lat2) / 2, (lng1 + lng2) / 2]
}

export default function RaceMap({
  center,
  courseMarks,
  startLine,
  finishLine,
  finishAtStart,
  currentPosition,
  nextMarkIndex,
  courseUp,
  laps,
  currentLap,
}: RaceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const posMarkerRef = useRef<L.Marker | null>(null)
  const courseLayersRef = useRef<L.Layer[]>([])
  const rotationRef = useRef<number>(0)

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    })

    L.control.zoom({ position: 'topright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 0.8,
    }).addTo(map)

    map.setView(center, 14)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw course layers when course data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove old course layers
    courseLayersRef.current.forEach(l => map.removeLayer(l))
    courseLayersRef.current = []

    const add = (layer: L.Layer) => {
      layer.addTo(map)
      courseLayersRef.current.push(layer)
    }

    // Draw start line
    if (startLine) {
      const isShared = finishAtStart === true
      const color = isShared ? '#7c3aed' : '#16a34a'

      const sl = L.polyline([
        [startLine.lat1, startLine.lng1],
        [startLine.lat2, startLine.lng2],
      ], { color, weight: 3, dashArray: '6,4', opacity: 0.9 })
      add(sl)

      const mp = midpoint(startLine.lat1, startLine.lng1, startLine.lat2, startLine.lng2)
      const label = L.marker(mp, {
        icon: L.divIcon({
          html: `<div style="background:${color};color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;white-space:nowrap">${isShared ? 'START / FINISH' : 'START'}</div>`,
          className: '',
          iconSize: [80, 16],
          iconAnchor: [40, 8],
        }),
        interactive: false,
      })
      add(label)
    }

    // Draw separate finish line
    if (finishLine && !finishAtStart) {
      const fl = L.polyline([
        [finishLine.lat1, finishLine.lng1],
        [finishLine.lat2, finishLine.lng2],
      ], { color: '#dc2626', weight: 3, dashArray: '6,4', opacity: 0.9 })
      add(fl)

      const mp = midpoint(finishLine.lat1, finishLine.lng1, finishLine.lat2, finishLine.lng2)
      const label = L.marker(mp, {
        icon: L.divIcon({
          html: `<div style="background:#dc2626;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;white-space:nowrap">FINISH</div>`,
          className: '',
          iconSize: [50, 16],
          iconAnchor: [25, 8],
        }),
        interactive: false,
      })
      add(label)
    }

    // Build route line: currentPos → nextMark → all remaining marks → finish
    const routePoints: [number, number][] = []

    if (currentPosition) {
      routePoints.push([currentPosition.lat, currentPosition.lon])
    }

    // Remaining marks from nextMarkIndex onward
    for (let i = nextMarkIndex; i < courseMarks.length; i++) {
      routePoints.push([courseMarks[i].lat, courseMarks[i].lon])
    }

    // Add finish midpoint
    const effectiveFinish = finishAtStart ? startLine : finishLine
    if (effectiveFinish) {
      routePoints.push(midpoint(
        effectiveFinish.lat1, effectiveFinish.lng1,
        effectiveFinish.lat2, effectiveFinish.lng2,
      ))
    }

    if (routePoints.length >= 2) {
      const route = L.polyline(routePoints, {
        color: '#2563eb',
        weight: 3,
        opacity: 0.85,
      })
      add(route)
    }

    // Draw course marks
    courseMarks.forEach((m, i) => {
      const color = m.roundingSide === 'port' ? '#dc2626' : '#16a34a'
      const isNext = i === nextMarkIndex

      const circle = L.circleMarker([m.lat, m.lon], {
        radius: isNext ? 13 : 10,
        fillColor: color,
        fillOpacity: isNext ? 1 : 0.75,
        color: isNext ? '#fff' : '#fff',
        weight: isNext ? 3 : 2,
      })
      circle.bindTooltip(
        `<strong>${i + 1}. ${m.name}</strong><br/><span style="font-size:10px">${m.roundingSide === 'port' ? '🔴 Port' : '🟢 Starboard'}</span>`,
        { direction: 'top', offset: [0, -14] }
      )
      add(circle)

      // Number icon
      const numIcon = L.divIcon({
        html: `<div style="background:${color};color:#fff;width:18px;height:18px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${i + 1}</div>`,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [-3, 20],
      })
      add(L.marker([m.lat, m.lon], { icon: numIcon, interactive: false }))
    })

    // Fit bounds if no current position yet
    if (!currentPosition && courseMarks.length > 0) {
      const allPts: [number, number][] = courseMarks.map(m => [m.lat, m.lon])
      if (startLine) {
        allPts.push([startLine.lat1, startLine.lng1], [startLine.lat2, startLine.lng2])
      }
      const bounds = L.latLngBounds(allPts)
      map.fitBounds(bounds.pad(0.3), { maxZoom: 16 })
    }
  }, [courseMarks, startLine, finishLine, finishAtStart, nextMarkIndex, currentPosition])

  // Update current position marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!currentPosition) {
      if (posMarkerRef.current) {
        map.removeLayer(posMarkerRef.current)
        posMarkerRef.current = null
      }
      return
    }

    const heading = currentPosition.heading ?? 0
    const posIcon = L.divIcon({
      html: `
        <div style="position:relative;width:32px;height:32px">
          <div style="
            position:absolute;inset:0;
            background:#2563eb;
            border-radius:50%;
            border:3px solid #fff;
            box-shadow:0 2px 8px rgba(37,99,235,0.6);
            animation:pulse 2s infinite;
          "></div>
          <div style="
            position:absolute;
            left:50%;top:50%;
            width:0;height:0;
            border-left:5px solid transparent;
            border-right:5px solid transparent;
            border-bottom:14px solid #2563eb;
            transform:translate(-50%,-100%) rotate(${heading}deg);
            transform-origin:50% 100%;
          "></div>
        </div>
        <style>
          @keyframes pulse {
            0%,100%{box-shadow:0 2px 8px rgba(37,99,235,0.6)}
            50%{box-shadow:0 2px 16px rgba(37,99,235,0.9)}
          }
        </style>
      `,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })

    if (posMarkerRef.current) {
      posMarkerRef.current.setLatLng([currentPosition.lat, currentPosition.lon])
      posMarkerRef.current.setIcon(posIcon)
    } else {
      posMarkerRef.current = L.marker([currentPosition.lat, currentPosition.lon], {
        icon: posIcon,
        zIndexOffset: 1000,
      }).addTo(map)
    }

    // Pan map to follow position
    map.panTo([currentPosition.lat, currentPosition.lon], { animate: true, duration: 0.5 })
  }, [currentPosition])

  // Course-up rotation: rotate the map container
  useEffect(() => {
    const map = mapRef.current
    if (!map || !courseUp || !currentPosition) return
    if (nextMarkIndex >= courseMarks.length) return

    const nextMark = courseMarks[nextMarkIndex]
    const bearing = bearingDeg(
      currentPosition.lat, currentPosition.lon,
      nextMark.lat, nextMark.lon,
    )

    rotationRef.current = bearing
    const container = containerRef.current
    if (container) {
      // Scale up while rotating so the rotated square always fills the viewport
      // (no blank triangular corners), and animate for a smooth feel.
      container.style.transformOrigin = '50% 50%'
      container.style.transition = 'transform 0.4s ease-out'
      container.style.transform = `scale(1.5) rotate(${-bearing}deg)`
    }
  }, [currentPosition, courseUp, nextMarkIndex, courseMarks])

  // Reset rotation when switching to north-up
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (!courseUp) {
      container.style.transform = ''
    }
  }, [courseUp])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}
