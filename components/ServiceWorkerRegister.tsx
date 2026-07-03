'use client'

import { useEffect } from 'react'

/**
 * Registers the offline service worker once, client-side. Kept as a tiny
 * component so the root layout can stay a server component.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    // Register after load so it never competes with first paint.
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW registration is best-effort; app still works without it */
      })
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
