/** RFC 4180 field quoting. */
export function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\n") + "\n";
}

/** Fleet report CSV, one row per period, sorted. */
export function fleetReportCsv(data: Record<string, { distance: number; trips: number }>): string {
  const rows = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => [period, v.distance ?? 0, v.trips ?? 0]);
  return toCsv([["Period", "Total Distance (km)", "Total Trips"], ...rows]);
}
