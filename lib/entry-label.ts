// Shared helpers for boat entry display labels + the "Boaty McNameless" auto-name.

export const MCNAMELESS_PREFIX = 'Boaty McNameless'
export const MCNAMELESS_LIKE = 'Boaty McNameless %'

/**
 * Display label precedence:
 *   1. boat_name (if present)
 *   2. sail_number (if present)
 *   3. 'Boaty McNameless' fallback
 */
export function entryDisplayLabel(entry: {
  boat_name?: string | null
  sail_number?: string | null
}): string {
  const name = entry.boat_name?.trim()
  if (name) return name
  const sail = entry.sail_number?.trim()
  if (sail) return sail
  return MCNAMELESS_PREFIX
}

/** True when the entry has no real boat name (empty or an auto McNameless label). */
export function isMcNameless(boatName?: string | null): boolean {
  const name = boatName?.trim()
  if (!name) return true
  return /^Boaty McNameless\b/.test(name)
}
