'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default marker icons in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface MapMarker {
  lat: number
  lon: number
  label?: string
  id?: string
  name?: string
  type?: string
  rounding?: string
}

interface SeaMapProps {
  center?: [number, number]
  zoom?: number
  markers?: MapMarker[]
  onMapClick?: (lat: number, lon: number) => void
  onMarkerDrag?: (lat: number, lon: number) => void
  selectedPosition?: { lat: number; lon: number } | null
  draggableMarker?: boolean
  height?: string
  className?: string
}

/**
 * Draw a simple graticule grid on the map
 */
function addGraticule(map: L.Map) {
  const graticuleGroup = L.layerGroup()

  function drawGrid() {
    graticuleGroup.clearLayers()

    const bounds = map.getBounds()
    const zoom = map.getZoom()

    // Determine grid spacing based on zoom level
    let interval: number
    if (zoom >= 16) interval = 0.001      // ~100m
    else if (zoom >= 14) interval = 0.005  // ~500m
    else if (zoom >= 12) interval = 0.01   // ~1km
    else if (zoom >= 10) interval = 0.05   // ~5km
    else if (zoom >= 8) interval = 0.1     // ~10km
    else if (zoom >= 6) interval = 0.5     // ~50km
    else if (zoom >= 4) interval = 1       // ~100km
    else interval = 5

    const south = Math.floor(bounds.getSouth() / interval) * interval
    const north = Math.ceil(bounds.getNorth() / interval) * interval
    const west = Math.floor(bounds.getWest() / interval) * interval
    const east = Math.ceil(bounds.getEast() / interval) * interval

    // Horizontal lines (latitude)
    for (let lat = south; lat <= north; lat += interval) {
      L.polyline([[lat, west], [lat, east]], {
        color: '#666',
        weight: 0.5,
        opacity: 0.4,
        dashArray: '4,4',
      }).addTo(graticuleGroup)
    }

    // Vertical lines (longitude)
    for (let lon = west; lon <= east; lon += interval) {
      L.polyline([[south, lon], [north, lon]], {
        color: '#666',
        weight: 0.5,
        opacity: 0.4,
        dashArray: '4,4',
      }).addTo(graticuleGroup)
    }
  }

  map.on('moveend', drawGrid)
  map.on('zoomend', drawGrid)
  drawGrid()

  graticuleGroup.addTo(map)
  return graticuleGroup
}

export default function SeaMap({
  center = [51.35, 0.73],
  zoom = 13,
  markers = [],
  onMapClick,
  onMarkerDrag,
  selectedPosition,
  draggableMarker = false,
  height = '400px',
  className = '',
}: SeaMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [locating, setLocating] = useState(false)

  // Initialise map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false,
    })

    // Zoom control top-right
    L.control.zoom({ position: 'topright' }).addTo(map)

    // Scale bar
    L.control.scale({ position: 'bottomleft', metric: true, imperial: true }).addTo(map)

    // Base layer: OpenStreetMap
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    })

    // Nautical overlay: OpenSeaMap
    const seaMapLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      attribution: ' | <a href="http://www.openseamap.org">OpenSeaMap</a>',
      maxZoom: 19,
      opacity: 0.8,
    })

    osmLayer.addTo(map)
    seaMapLayer.addTo(map)

    // Add graticule grid
    addGraticule(map)

    mapRef.current = map
    setMapReady(true)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle map clicks
  useEffect(() => {
    if (!mapRef.current || !onMapClick) return

    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng)
    }

    mapRef.current.on('click', handler)
    return () => {
      mapRef.current?.off('click', handler)
    }
  }, [mapReady, onMapClick])

  // Handle selected position marker
  useEffect(() => {
    if (!mapRef.current) return

    if (selectedPosition) {
      if (markerRef.current) {
        markerRef.current.setLatLng([selectedPosition.lat, selectedPosition.lon])
      } else {
        const marker = L.marker([selectedPosition.lat, selectedPosition.lon], {
          draggable: draggableMarker,
        })

        if (draggableMarker && onMarkerDrag) {
          marker.on('dragend', () => {
            const pos = marker.getLatLng()
            onMarkerDrag(pos.lat, pos.lng)
          })
        }

        marker.addTo(mapRef.current)
        markerRef.current = marker
      }
    } else if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
  }, [selectedPosition, draggableMarker, onMarkerDrag, mapReady])

  // Render existing marks and fly to them
  useEffect(() => {
    if (!mapRef.current) return

    // Fly to markers bounds if we have them
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lon] as [number, number]))
      mapRef.current.flyToBounds(bounds.pad(0.3), { duration: 1, maxZoom: 15 })
    }

    const layerGroup = L.layerGroup()

    markers.forEach((m) => {
      const isPort = m.rounding === 'port'
      const circle = L.circleMarker([m.lat, m.lon], {
        radius: 7,
        fillColor: isPort ? '#dc2626' : m.rounding === 'starboard' ? '#16a34a' : '#1e3a5f',
        fillOpacity: 0.85,
        color: '#fff',
        weight: 2,
      })

      // Short ID tooltip on hover
      if (m.label) {
        circle.bindTooltip(`<strong>${m.label}</strong>`, {
          permanent: false,
          direction: 'top',
          offset: [0, -10],
          className: 'mark-tooltip',
        })
      }

      // Rich popup on click
      const latDir = m.lat >= 0 ? 'N' : 'S'
      const lonDir = m.lon >= 0 ? 'E' : 'W'
      const absLat = Math.abs(m.lat)
      const absLon = Math.abs(m.lon)
      const latDeg = Math.floor(absLat)
      const latMin = ((absLat - latDeg) * 60).toFixed(3)
      const lonDeg = Math.floor(absLon)
      const lonMin = ((absLon - lonDeg) * 60).toFixed(3)
      const coordStr = `${latDir}${String(latDeg).padStart(2,'0')}°${String(latMin).padStart(6,'0')}' ${lonDir}${String(lonDeg).padStart(3,'0')}°${String(lonMin).padStart(6,'0')}'`

      const roundingHtml = m.rounding
        ? `<div style="margin-top:4px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isPort ? '#dc2626' : '#16a34a'};margin-right:4px"></span><span style="font-size:11px;color:#666">${m.rounding === 'port' ? 'Port' : 'Starboard'}</span></div>`
        : ''

      const typeHtml = m.type
        ? `<div style="font-size:11px;color:#888;margin-top:2px">${m.type === 'physical' ? '🔶 Physical' : '📍 Virtual'}</div>`
        : ''

      circle.bindPopup(
        `<div style="min-width:140px">
          <div style="font-weight:600;font-size:13px;color:#111">${m.name || m.label || 'Mark'}</div>
          <div style="font-size:11px;color:#555;margin-top:2px">${m.label || ''}</div>
          <div style="font-family:monospace;font-size:11px;color:#666;margin-top:4px">${coordStr}</div>
          ${roundingHtml}
          ${typeHtml}
        </div>`,
        { closeButton: false, offset: [0, -5] }
      )

      layerGroup.addLayer(circle)
    })

    layerGroup.addTo(mapRef.current)

    return () => {
      layerGroup.remove()
    }
  }, [markers, mapReady])

  // Go to current location
  const goToMyLocation = useCallback(() => {
    if (!mapRef.current || !navigator.geolocation) return

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, {
          duration: 1.5,
        })
        setLocating(false)
      },
      () => {
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={{ height }}
        className={`rounded-xl overflow-hidden border border-gray-200 ${className}`}
      />
      {/* My Location button */}
      <button
        type="button"
        onClick={goToMyLocation}
        disabled={locating}
        className="absolute top-3 left-3 z-[1000] bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50 transition-colors flex items-center gap-1.5"
        title="Go to my location"
      >
        {locating ? (
          <span className="animate-pulse">📍 Locating...</span>
        ) : (
          <span>📍 My location</span>
        )}
      </button>
    </div>
  )
}
