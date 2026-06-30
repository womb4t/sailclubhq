'use client'

import dynamic from 'next/dynamic'

const SeaMap = dynamic(() => import('./SeaMap'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-gray-200 bg-gray-100 flex items-center justify-center" style={{ height: '400px' }}>
      <p className="text-gray-400 text-sm">Loading map...</p>
    </div>
  ),
})

export default SeaMap
