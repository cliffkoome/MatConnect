import { describe, expect, it } from "vitest";
import { csvField, fleetReportCsv } from "@/lib/client/csv";
import { TtlCache } from "@/server/lib/ttl-cache";

describe("TtlCache", () => {
  it("expires entries after the TTL", () => {
    let now = 0;
    const cache = new TtlCache<string, number>(100, 10, () => now);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    now = 100;
    expect(cache.get("a")).toBeUndefined();
  });

  it("can cache falsy values such as null (negative caching)", () => {
    const cache = new TtlCache<string, null>(100, 10, () => 0);
    cache.set("miss", null);
    expect(cache.get("miss")).toBeNull();
  });

  it("evicts the oldest entries beyond the size cap", () => {
    const cache = new TtlCache<number, number>(1_000, 2, () => 0);
    cache.set(1, 1);
    cache.set(2, 2);
    cache.set(3, 3);
    expect(cache.size).toBe(2);
    expect(cache.get(1)).toBeUndefined();
    expect(cache.get(3)).toBe(3);
  });
});

describe("CSV export", () => {
  it("quotes fields that need it", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField(1.5)).toBe("1.5");
  });

  it("builds the fleet report sorted by period", () => {
    expect(
      fleetReportCsv({
        "2026-W43": { distance: 12.5, trips: 3 },
        "2026-W42": { distance: 40, trips: 9 },
      }),
    ).toBe("Period,Total Distance (km),Total Trips\n2026-W42,40,9\n2026-W43,12.5,3\n");
  });
});
