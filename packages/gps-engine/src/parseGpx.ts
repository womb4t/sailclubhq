/**
 * Minimal GPX track parser. Turns a recorded <trkpt> sequence into TrackPoints.
 * Dependency-free regex parse — fine for the well-formed GPX that logger apps
 * and our own exporter produce. Swap for a streaming XML parser if needed.
 */

import type { TrackPoint } from "./types";

export function parseGpxTrack(gpx: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  const trkptRe = /<trkpt\b[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  // Also handle self-closing <trkpt .../> with no children.
  const selfCloseRe = /<trkpt\b[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*\/>/g;

  let m: RegExpExecArray | null;
  while ((m = trkptRe.exec(gpx)) !== null) {
    const lat = parseFloat(m[1]!);
    const lon = parseFloat(m[2]!);
    const inner = m[3] ?? "";
    const time = extract(inner, "time");
    const speed = extract(inner, "speed");
    const cog = extract(inner, "course") ?? extract(inner, "cog");
    const acc = extract(inner, "accuracy") ?? extractAttr(inner, "hdop");
    points.push({
      t: time ? Date.parse(time) : NaN,
      lat,
      lon,
      ...(speed != null ? { speed: parseFloat(speed) } : {}),
      ...(cog != null ? { cog: parseFloat(cog) } : {}),
      ...(acc != null ? { accuracy: parseFloat(acc) } : {}),
    });
  }
  while ((m = selfCloseRe.exec(gpx)) !== null) {
    points.push({ t: NaN, lat: parseFloat(m[1]!), lon: parseFloat(m[2]!) });
  }

  return points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .sort((a, b) => a.t - b.t);
}

function extract(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}>([^<]+)</(?:\\w+:)?${tag}>`);
  const m = re.exec(xml);
  return m ? m[1]!.trim() : null;
}

function extractAttr(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}>([^<]+)`);
  const m = re.exec(xml);
  return m ? m[1]!.trim() : null;
}
