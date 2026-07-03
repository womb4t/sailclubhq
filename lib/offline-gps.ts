// lib/offline-gps.ts
// Offline-first GPS core for SailClubHQ race tracking.
//
// Sailors routinely lose signal at sea, so position capture must not depend on
// connectivity. This module records every GPS fix into IndexedDB immediately,
// then opportunistically flushes unsynced fixes to Supabase (on a timer, on
// reconnect, and on demand). Nothing here touches React or the DOM — it is the
// pure data/sync layer that the tracker + race nav pages build on top of.
//
// Chunk 1 scope: IndexedDB position queue + sync-to-Supabase + reconnect flush.
// (Race/course caching and the UI hooks land in later chunks.)

import { getBrowserClient } from '@/lib/supabase/browser'

const DB_NAME = 'sailclubhq-gps'
const DB_VERSION = 1
const POSITIONS_STORE = 'positions'
const RACE_CACHE_STORE = 'race-cache'

/** A single recorded GPS fix, queued locally until synced to the server. */
export interface QueuedPosition {
  id?: number // auto-increment key (assigned by IndexedDB)
  raceId: string
  userId: string | null // null for anonymous (no-login) participants
  participantId?: string | null // device id for anonymous participants
  entryId: string | null
  lat: number
  lon: number
  speedKts: number
  headingDeg: number | null
  accuracyM: number | null
  recordedAt: string // ISO timestamp
  synced: boolean
}

// ── IndexedDB bootstrap ───────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error('IndexedDB unavailable (non-browser context)'))
  }
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(POSITIONS_STORE)) {
        const store = db.createObjectStore(POSITIONS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('raceId', 'raceId', { unique: false })
        store.createIndex('synced', 'synced', { unique: false })
      }
      if (!db.objectStoreNames.contains(RACE_CACHE_STORE)) {
        db.createObjectStore(RACE_CACHE_STORE, { keyPath: 'raceId' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'))
  })

  return dbPromise
}

function tx(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store)
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

// ── Position queue ─────────────────────────────────────────────────────────────

/** Persist a GPS fix locally. Returns the assigned record id. */
export async function savePosition(
  pos: Omit<QueuedPosition, 'id' | 'synced'>,
): Promise<number> {
  const db = await openDb()
  const store = tx(db, POSITIONS_STORE, 'readwrite')
  const key = await promisify(store.add({ ...pos, synced: false }))
  return key as number
}

/** All positions still awaiting sync, oldest first (chronological track order). */
export async function getUnsyncedPositions(): Promise<QueuedPosition[]> {
  const db = await openDb()
  const store = tx(db, POSITIONS_STORE, 'readonly')
  const all = (await promisify(store.getAll())) as QueuedPosition[]
  return all
    .filter((p) => !p.synced)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
}

/** Mark a set of local records as synced (leaves them for later audit/cleanup). */
async function markSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await openDb()
  const store = tx(db, POSITIONS_STORE, 'readwrite')
  await Promise.all(
    ids.map(async (id) => {
      const rec = (await promisify(store.get(id))) as QueuedPosition | undefined
      if (rec) {
        rec.synced = true
        await promisify(store.put(rec))
      }
    }),
  )
}

/** Count of positions not yet synced. */
export async function getUnsyncedCount(): Promise<number> {
  const positions = await getUnsyncedPositions()
  return positions.length
}

/** Delete synced records older than `maxAgeMs` to keep the DB small. */
export async function pruneSynced(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  const db = await openDb()
  const store = tx(db, POSITIONS_STORE, 'readwrite')
  const all = (await promisify(store.getAll())) as QueuedPosition[]
  const cutoff = Date.now() - maxAgeMs
  await Promise.all(
    all
      .filter((p) => p.synced && new Date(p.recordedAt).getTime() < cutoff)
      .map((p) => (p.id != null ? promisify(store.delete(p.id)) : Promise.resolve())),
  )
}

// ── Sync to Supabase ─────────────────────────────────────────────────────────

export interface FlushResult {
  synced: number
  failed: number
  skipped?: boolean // true when offline / nothing attempted
}

/**
 * Push all unsynced positions to Supabase in chronological order.
 * Safe to call repeatedly; no-ops when offline or when the queue is empty.
 * On network/DB failure the records stay queued for the next attempt.
 */
export async function flushPositions(): Promise<FlushResult> {
  if (!isBrowser() || !navigator.onLine) {
    return { synced: 0, failed: 0, skipped: true }
  }

  const pending = await getUnsyncedPositions()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  const supabase = getBrowserClient()

  // Chunk the upload so a huge offline backlog doesn't blow a single request.
  const BATCH = 200
  let synced = 0
  let failed = 0

  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH)
    const rows = slice.map((p) => ({
      race_id: p.raceId,
      entry_id: p.entryId,
      user_id: p.userId,
      participant_id: p.participantId ?? null,
      lat: p.lat,
      lon: p.lon,
      speed_kts: p.speedKts,
      heading_deg: p.headingDeg,
      accuracy_m: p.accuracyM,
      recorded_at: p.recordedAt,
    }))

    const { error } = await supabase.from('live_positions').insert(rows)

    if (error) {
      failed += slice.length
      // Stop on first failure — likely offline again; retry whole tail later.
      break
    }

    const ids = slice.map((p) => p.id).filter((id): id is number => id != null)
    await markSynced(ids)
    synced += slice.length
  }

  return { synced, failed }
}

// ── Race + course cache (offline marks) ────────────────────────────────────────
//
// So that virtual marks, start/finish lines and the briefing remain visible with
// no signal, we snapshot the full race payload (race, course, marks, start
// classes) into IndexedDB while online. Callers pass whatever shape they already
// load; we store it opaquely and hand it back on read.

export interface CachedRace<T = unknown> {
  raceId: string
  token: string // entry_token used to look the race up
  data: T // full race+course+marks+start_classes snapshot
  cachedAt: string // ISO timestamp
}

/** Snapshot a race payload for offline use (keyed by raceId). */
export async function cacheRaceData<T>(
  raceId: string,
  token: string,
  data: T,
): Promise<void> {
  if (!isBrowser()) return
  const db = await openDb()
  const store = tx(db, RACE_CACHE_STORE, 'readwrite')
  const record: CachedRace<T> = {
    raceId,
    token,
    data,
    cachedAt: new Date().toISOString(),
  }
  await promisify(store.put(record))
}

/** Retrieve a cached race snapshot by raceId, or null if none stored. */
export async function getCachedRaceData<T>(
  raceId: string,
): Promise<CachedRace<T> | null> {
  if (!isBrowser()) return null
  const db = await openDb()
  const store = tx(db, RACE_CACHE_STORE, 'readonly')
  const rec = (await promisify(store.get(raceId))) as CachedRace<T> | undefined
  return rec ?? null
}

/** Retrieve a cached race snapshot by entry_token (scans the small cache). */
export async function getCachedRaceByToken<T>(
  token: string,
): Promise<CachedRace<T> | null> {
  if (!isBrowser()) return null
  const db = await openDb()
  const store = tx(db, RACE_CACHE_STORE, 'readonly')
  const all = (await promisify(store.getAll())) as CachedRace<T>[]
  return all.find((r) => r.token === token) ?? null
}

// ── Reconnect handling ─────────────────────────────────────────────────────────

let onlineHandler: (() => void) | null = null

/**
 * Register a window 'online' listener that flushes the queue on reconnect.
 * Returns an unregister function. Idempotent — a second call replaces the first.
 */
export function registerReconnectFlush(
  onFlush?: (result: FlushResult) => void,
): () => void {
  if (!isBrowser()) return () => {}

  if (onlineHandler) window.removeEventListener('online', onlineHandler)

  onlineHandler = () => {
    void flushPositions().then((r) => onFlush?.(r))
  }
  window.addEventListener('online', onlineHandler)

  return () => {
    if (onlineHandler) window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }
}
