/**
 * Post-race: turn detection results into a ranked, scratch finish-order table
 * and a CSV the OOD can download. No handicap in v1 (scratch only).
 */

import type { BoatRaceResult, RankedResult } from "./types";

/**
 * Rank boats by finish time (scratch). OCS boats are listed but unranked.
 * Boats with no finish are DNF. Protest status is applied externally if a
 * protest has been lodged (passed in via protestBoatIds).
 */
export function rankResults(
  results: BoatRaceResult[],
  protestBoatIds: Set<string> = new Set(),
): RankedResult[] {
  const rows: RankedResult[] = results.map((r) => {
    let status: RankedResult["status"] = "finished";
    if (r.startStatus === "ocs-confident") status = "OCS";
    else if (r.finishTime == null) status = "DNF";
    if (protestBoatIds.has(r.boatId)) status = "protest";
    return {
      rank: null,
      boatId: r.boatId,
      classId: r.classId,
      finishTime: r.finishTime,
      elapsedSeconds: r.elapsedSeconds,
      status,
    };
  });

  const finishers = rows
    .filter((r) => r.status === "finished" && r.finishTime != null)
    .sort((a, b) => a.finishTime! - b.finishTime!);
  finishers.forEach((r, i) => (r.rank = i + 1));

  return rows.sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank;
    if (a.rank != null) return -1;
    if (b.rank != null) return 1;
    return 0;
  });
}

/** CSV export for the OOD. */
export function resultsToCsv(rows: RankedResult[]): string {
  const header = "Rank,Boat,Class,Status,Finish (UTC),Elapsed (s)";
  const lines = rows.map((r) => {
    const finish = r.finishTime != null ? new Date(r.finishTime).toISOString() : "";
    const rank = r.rank ?? "";
    const elapsed = r.elapsedSeconds ?? "";
    return `${rank},${csv(r.boatId)},${csv(r.classId)},${r.status},${finish},${elapsed}`;
  });
  return [header, ...lines].join("\n");
}

function csv(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
