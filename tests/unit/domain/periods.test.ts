import { describe, expect, it } from "vitest";
import {
  addUtcDays,
  bucketByPeriod,
  isoWeekKey,
  metresToKm,
  monthKey,
  periodKey,
  periodRangeStart,
  startOfUtcDay,
  utcDateKey,
} from "@/server/domain/periods";

const d = (iso: string) => new Date(iso);

describe("isoWeekKey", () => {
  it.each([
    ["2026-01-01", "2026-W01"], // Thursday
    ["2025-12-29", "2026-W01"], // Monday of ISO week 1 of 2026
    ["2027-01-01", "2026-W53"], // Friday belongs to the last week of 2026
    ["2026-10-19", "2026-W43"],
    ["2024-12-30", "2025-W01"],
  ])("%s → %s", (date, key) => {
    expect(isoWeekKey(d(`${date}T12:00:00Z`))).toBe(key);
  });
});

describe("keys", () => {
  it("uses UTC calendar days", () => {
    // 23:30 in Nairobi on the 18th is 20:30 UTC on the 18th; 02:00 Nairobi on the 19th is 23:00 UTC on the 18th.
    expect(utcDateKey(d("2026-10-18T23:00:00Z"))).toBe("2026-10-18");
    expect(monthKey(d("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(periodKey(d("2026-10-19T00:00:00Z"), "daily")).toBe("2026-10-19");
    expect(periodKey(d("2026-10-19T00:00:00Z"), "weekly")).toBe("2026-W43");
    expect(periodKey(d("2026-10-19T00:00:00Z"), "monthly")).toBe("2026-10");
  });

  it("startOfUtcDay / addUtcDays", () => {
    expect(startOfUtcDay(d("2026-10-19T17:45:00Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(addUtcDays(d("2026-03-01T10:00:00Z"), -1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

describe("periodRangeStart", () => {
  const now = d("2026-10-19T15:00:00Z");
  it("daily covers 7 days including today", () => {
    expect(utcDateKey(periodRangeStart("daily", now))).toBe("2026-10-13");
  });
  it("weekly covers 28 days including today", () => {
    expect(utcDateKey(periodRangeStart("weekly", now))).toBe("2026-09-22");
  });
  it("monthly covers this month and the 11 before it", () => {
    expect(utcDateKey(periodRangeStart("monthly", now))).toBe("2025-11-01");
    expect(utcDateKey(periodRangeStart("monthly", d("2026-01-15T00:00:00Z")))).toBe("2025-02-01");
  });
});

describe("bucketByPeriod", () => {
  const rows = [
    { date: d("2026-10-12T00:00:00Z"), value: 1_000 }, // Mon W42
    { date: d("2026-10-18T00:00:00Z"), value: 500 }, // Sun W42
    { date: d("2026-10-19T00:00:00Z"), value: 250 }, // Mon W43
    { date: d("2026-09-30T00:00:00Z"), value: 100 },
  ];

  it("sums per day, sorted", () => {
    expect(bucketByPeriod(rows, "daily").map((r) => r.period)).toEqual([
      "2026-09-30",
      "2026-10-12",
      "2026-10-18",
      "2026-10-19",
    ]);
  });

  it("sums per ISO week", () => {
    expect(bucketByPeriod(rows, "weekly")).toEqual([
      { period: "2026-W40", total: 100 },
      { period: "2026-W42", total: 1_500 },
      { period: "2026-W43", total: 250 },
    ]);
  });

  it("sums per month", () => {
    expect(bucketByPeriod(rows, "monthly")).toEqual([
      { period: "2026-09", total: 100 },
      { period: "2026-10", total: 1_750 },
    ]);
  });

  it("returns [] for no rows", () => {
    expect(bucketByPeriod([], "weekly")).toEqual([]);
  });
});

describe("metresToKm", () => {
  it("rounds to 2 decimals", () => {
    expect(metresToKm(12_345.678)).toBe(12.35);
    expect(metresToKm(0)).toBe(0);
  });
});
