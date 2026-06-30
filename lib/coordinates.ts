/**
 * Convert decimal degrees to nautical format: N52°18.202' E001°40.343'
 * Uses degrees and decimal minutes (DDM) — standard nautical format
 */
export function decimalToDDM(lat: number, lon: number): { lat: string; lon: string; full: string } {
  const latDir = lat >= 0 ? 'N' : 'S'
  const lonDir = lon >= 0 ? 'E' : 'W'

  const absLat = Math.abs(lat)
  const absLon = Math.abs(lon)

  const latDeg = Math.floor(absLat)
  const latMin = (absLat - latDeg) * 60

  const lonDeg = Math.floor(absLon)
  const lonMin = (absLon - lonDeg) * 60

  const latStr = `${latDir}${String(latDeg).padStart(2, '0')}°${latMin.toFixed(3).padStart(6, '0')}'`
  const lonStr = `${lonDir}${String(lonDeg).padStart(3, '0')}°${lonMin.toFixed(3).padStart(6, '0')}'`

  return {
    lat: latStr,
    lon: lonStr,
    full: `${latStr} ${lonStr}`,
  }
}

/**
 * Parse nautical DDM format back to decimal degrees
 * Accepts: N52°18.202' or 52°18.202'N or just 52.3034
 */
export function ddmToDecimal(input: string): number | null {
  // Already a plain number?
  const plain = parseFloat(input)
  if (!isNaN(plain) && !input.includes('°')) return plain

  // Parse DDM: N52°18.202' or S52°18.202'
  const match = input.match(/^([NSEW]?)(\d{1,3})°(\d{1,2}(?:\.\d+)?)'?\s*([NSEW]?)$/i)
  if (!match) return null

  const dir = (match[1] || match[4]).toUpperCase()
  const deg = parseInt(match[2])
  const min = parseFloat(match[3])

  let decimal = deg + min / 60
  if (dir === 'S' || dir === 'W') decimal = -decimal

  return decimal
}
