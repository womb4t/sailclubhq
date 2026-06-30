'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default marker icons in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface SeaMapProps {
  center?: [number, number]
  zoom?: number
  markers?: { lat: number; lon: number; label?: string; id?: string }[]
  onMapClick?: (lat: number, lon: number) => void
  onMarkerDrag?: (lat: number, lon: number) => void
  selectedPosition?: { lat: number; lon: number } | null
  draggableMarker?: boolean
  height?: string
  className?: string
}

export default function SeaMap({
  center = [51.35, 0.73], // Default: Thames Estuary / Medway area
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

  // Initialise map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
    })

    // Base layer: OpenStreetMap
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    })

    // Nautical overlay: OpenSeaMap
    const seaMapLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openseamap.org">OpenSeaMap</a>',
      maxZoom: 19,
      opacity: 0.8,
    })

    osmLayer.addTo(map)
    seaMapLayer.addTo(map)

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

  // Render existing marks as small circles
  useEffect(() => {
    if (!mapRef.current) return

    const layerGroup = L.layerGroup()

    markers.forEach((m) => {
      const circle = L.circleMarker([m.lat, m.lon], {
        radius: 6,
        fillColor: '#1e3a5f',
        fillOpacity: 0.8,
        color: '#fff',
        weight: 2,
      })

      if (m.label) {
        circle.bindTooltip(m.label, {
          permanent: false,
          direction: 'top',
          offset: [0, -8],
        })
      }

      layerGroup.addLayer(circle)
    })

    layerGroup.addTo(mapRef.current)

    return () => {
      layerGroup.remove()
    }
  }, [markers, mapReady])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className={`rounded-xl overflow-hidden border border-gray-200 ${className}`}
    />
  )
}
