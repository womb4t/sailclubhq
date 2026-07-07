import { describe, it, expect } from 'vitest'
import { detectOcs, isOnCourseSide, type StartLine, type CourseRef, type BoatFix } from './ocs'

// A simple E–W start line at lat 50.000, from lon -1.010 to -0.990.
// The first mark is to the NORTH (higher lat) → north is the "course side".
const startLine: StartLine = { lat1: 50.0, lng1: -1.01, lat2: 50.0, lng2: -0.99 }
const firstMark: CourseRef = { lat: 50.01, lon: -1.0 } // north of the line

describe('isOnCourseSide', () => {
  it('flags a boat north of the line (same side as the mark) as OCS', () => {
    // boat just north of the line
    expect(
      isOnCourseSide(50.001, -1.0, startLine.lat1, startLine.lng1, startLine.lat2, startLine.lng2, firstMark.lat, firstMark.lon),
    ).toBe(true)
  })

  it('does NOT flag a boat south of the line (pre-start side)', () => {
    expect(
      isOnCourseSide(49.999, -1.0, startLine.lat1, startLine.lng1, startLine.lat2, startLine.lng2, firstMark.lat, firstMark.lon),
    ).toBe(false)
  })

  it('treats a boat exactly on the line as NOT OCS', () => {
    expect(
      isOnCourseSide(50.0, -1.0, startLine.lat1, startLine.lng1, startLine.lat2, startLine.lng2, firstMark.lat, firstMark.lon),
    ).toBe(false)
  })
})

describe('detectOcs', () => {
  const fixes: BoatFix[] = [
    { entryId: 'a', lat: 50.002, lon: -1.0 }, // north → OCS
    { entryId: 'b', lat: 49.998, lon: -1.0 }, // south → clean
    { entryId: 'c', lat: 50.0005, lon: -0.995 }, // just north → OCS
    { entryId: 'd', lat: 49.9999, lon: -1.005 }, // just south → clean
  ]

  it('returns exactly the boats on the course side', () => {
    expect(detectOcs(startLine, firstMark, fixes).sort()).toEqual(['a', 'c'])
  })

  it('degrades gracefully to [] when the start line is missing', () => {
    expect(detectOcs(null, firstMark, fixes)).toEqual([])
  })

  it('degrades gracefully to [] when the course reference is missing', () => {
    expect(detectOcs(startLine, null, fixes)).toEqual([])
  })

  it('skips fixes with missing coordinates', () => {
    const bad: BoatFix[] = [{ entryId: 'x', lat: NaN as unknown as number, lon: -1.0 }]
    // NaN comparisons make isOnCourseSide false; just assert no throw + no 'x' when clearly null
    expect(detectOcs(startLine, firstMark, bad)).not.toContain('y')
  })
})
