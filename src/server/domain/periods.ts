/**
 * Date bucketing for the Matatu-admin charts and reports.
 *
 * The Express version leaned on MySQL's YEARWEEK()/DATE_FORMAT(); doing it here keeps the queries
 * portable and lets us unit-test the maths. Everything is UTC, matching how daily rows are keyed.
 */

export type Period = "daily" | "weekly" | "monthly";
export const PERIODS: readonly Period[] = ["daily", "weekly", "monthly"];

/** `YYYY-MM-DD` for the UTC calendar day of `date`. */
export const utcDateKey = (date: Date) => date.toISOString().slice(0, 10);

/** Midnight UTC of the given day (what a Postgres DATE column round-trips to). */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  const d = startOfUtcDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** ISO-8601 week key, e.g. `2026-W43`. */
export function isoWeekKey(date: Date): string {
  const d = startOfUtcDay(date);
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this week decides the year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const monthKey = (date: Date) => date.toISOString().slice(0, 7);

export function periodKey(date: Date, period: Period): string {
  switch (period) {
    case "weekly":
      return isoWeekKey(date);
    case "monthly":
      return monthKey(date);
    default:
      return utcDateKey(date);
  }
}

/**
 * First day included for a period, counting `now` as part of the range:
 *  daily → last 7 days, weekly → last 28 days, monthly → this month and the 11 before it.
 */
export function periodRangeStart(period: Period, now: Date): Date {
  switch (period) {
    case "weekly":
      return addUtcDays(now, -27);
    case "monthly":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    default:
      return addUtcDays(now, -6);
  }
}

export type DatedValue = { date: Date; value: number };
export type PeriodTotal = { period: string; total: number };

/** Sums values per period key, sorted ascending. */
export function bucketByPeriod(rows: DatedValue[], period: Period): PeriodTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = periodKey(row.date, period);
    totals.set(key, (totals.get(key) ?? 0) + row.value);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodLabel, total]) => ({ period: periodLabel, total }));
}

export const metresToKm = (metres: number) => Math.round((metres / 1000) * 100) / 100;
