/**
 * Course renderers. One Course produces three representations of the SAME data:
 *   1. (UI handles the interactive map preview)
 *   2. GPX for chart plotters
 *   3. Plain printable text for people who won't use a phone during the race
 *
 * Position (lat/long) travels with every mark in every representation.
 */

import type { Course, GeoPoint, StartClass } from "./types";

/**
 * Format a coordinate as degrees + decimal minutes — the format chart plotters
 * and handheld GPS units use, e.g. 50°40.21'N 001°33.46'E.
 */
export function formatLatLon(p: GeoPoint): string {
  return `${formatOne(p.lat, "lat")} ${formatOne(p.lon, "lon")}`;
}

function formatOne(value: number, kind: "lat" | "lon"): string {
  const hemi =
    kind === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const degStr =
    kind === "lat"
      ? String(deg).padStart(2, "0")
      : String(deg).padStart(3, "0");
  const minStr = min.toFixed(2).padStart(5, "0");
  return `${degStr}\u00B0${minStr}'${hemi}`;
}

const roundingWord = (r: "port" | "starboard") =>
  r === "port" ? "leave to PORT" : "leave to STARBOARD";

/**
 * Plain-text, printable course sheet. Self-sufficient: names for recognition,
 * lat/long for navigation, rounding direction in words, plus race meta.
 */
export function renderCourseText(
  course: Course,
  meta: {
    raceName: string;
    seriesName?: string;
    cls?: StartClass;
    vhfChannel?: string;
    safetyNotes?: string;
  },
): string {
  const lines: string[] = [];
  const header = meta.seriesName
    ? `${meta.raceName} \u2014 ${meta.seriesName}`
    : meta.raceName;
  lines.push(header);
  if (meta.cls) {
    const gun = new Date(meta.cls.startTime);
    lines.push(
      `${meta.cls.name} start ${gun.toISOString().slice(11, 16)} (flag: ${meta.cls.classFlag}, prep: ${meta.cls.sequence.prepFlag})`,
    );
  }
  lines.push("");

  const s1 = course.startEnd1Name ?? "Committee Boat";
  const s2 = course.startEnd2Name ?? "Pin";
  lines.push(`Start:  between ${s1} and ${s2}`);
  lines.push(`        ${s1}: ${formatLatLon(course.start.end1)}`);
  lines.push(`        ${s2}: ${formatLatLon(course.start.end2)}`);
  lines.push("");

  for (const cm of [...course.marks].sort((a, b) => a.order - b.order)) {
    const tag = cm.mark.source === "race" ? "  [laid for today]" : "";
    const pos = formatLatLon({ lat: cm.mark.lat, lon: cm.mark.lon });
    lines.push(
      `${cm.order}. ${cm.mark.name.padEnd(16)} ${pos}   \u2014 ${roundingWord(cm.rounding)}${tag}`,
    );
    if (cm.mark.notes) lines.push(`     note: ${cm.mark.notes}`);
  }
  lines.push("");

  const f1 = course.finishEnd1Name ?? "Committee Boat";
  const f2 = course.finishEnd2Name ?? "Pin";
  lines.push(`Finish: between ${f1} and ${f2}`);
  lines.push(`        ${f1}: ${formatLatLon(course.finish.end1)}`);
  lines.push(`        ${f2}: ${formatLatLon(course.finish.end2)}`);

  if (meta.vhfChannel) {
    lines.push("");
    lines.push(`VHF: ${meta.vhfChannel}`);
  }
  if (meta.safetyNotes) {
    lines.push(`Safety: ${meta.safetyNotes}`);
  }
  return lines.join("\n");
}

/** Minimal GPX export of all course marks (plus line ends as waypoints). */
export function renderCourseGpx(course: Course, name = "Course"): string {
  const wpts: string[] = [];
  const wpt = (p: GeoPoint, n: string) =>
    `  <wpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><name>${escapeXml(n)}</name></wpt>`;

  wpts.push(wpt(course.start.end1, course.startEnd1Name ?? "Start-CB"));
  wpts.push(wpt(course.start.end2, course.startEnd2Name ?? "Start-Pin"));
  for (const cm of [...course.marks].sort((a, b) => a.order - b.order)) {
    wpts.push(wpt({ lat: cm.mark.lat, lon: cm.mark.lon }, `${cm.order}-${cm.mark.name}`));
  }
  wpts.push(wpt(course.finish.end1, course.finishEnd1Name ?? "Finish-CB"));
  wpts.push(wpt(course.finish.end2, course.finishEnd2Name ?? "Finish-Pin"));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="SailClubHQ" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escapeXml(name)}</name></metadata>`,
    ...wpts,
    "</gpx>",
  ].join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
