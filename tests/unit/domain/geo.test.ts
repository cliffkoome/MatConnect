import { describe, expect, it } from "vitest";
import { bearingDifference, calculateBearing, haversineDistance, isValidLatLng } from "@/server/domain/geo";

const nairobiCbd = { latitude: -1.2833, longitude: 36.8167 };

describe("haversineDistance", () => {
  it("is zero for the same point", () => {
    expect(haversineDistance(nairobiCbd, nairobiCbd)).toBe(0);
  });

  it("measures one degree of latitude as ~111.2 km", () => {
    const d = haversineDistance({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(d).toBeGreaterThan(111_100);
    expect(d).toBeLessThan(111_250);
  });

  it("is symmetric", () => {
    const westlands = { latitude: -1.2676, longitude: 36.8108 };
    expect(haversineDistance(nairobiCbd, westlands)).toBeCloseTo(haversineDistance(westlands, nairobiCbd), 6);
  });

  it("matches a known short distance (CBD → Westlands ≈ 1.85 km)", () => {
    const d = haversineDistance(nairobiCbd, { latitude: -1.2676, longitude: 36.8108 });
    expect(d).toBeGreaterThan(1_750);
    expect(d).toBeLessThan(1_950);
  });
});

describe("calculateBearing", () => {
  const origin = { latitude: 0, longitude: 0 };
  it.each([
    ["north", { latitude: 1, longitude: 0 }, 0],
    ["east", { latitude: 0, longitude: 1 }, 90],
    ["south", { latitude: -1, longitude: 0 }, 180],
    ["west", { latitude: 0, longitude: -1 }, 270],
  ])("points %s", (_label, to, expected) => {
    expect(calculateBearing(origin, to)).toBeCloseTo(expected, 5);
  });
});

describe("bearingDifference", () => {
  it.each([
    [10, 350, 20],
    [0, 180, 180],
    [90, 90, 0],
    [270, 45, 135],
    [720, 0, 0],
  ])("diff(%d, %d) = %d", (a, b, expected) => {
    expect(bearingDifference(a, b)).toBeCloseTo(expected, 6);
  });
});

describe("isValidLatLng", () => {
  it("accepts real coordinates, including zero", () => {
    expect(isValidLatLng({ latitude: 0, longitude: 0 })).toBe(true);
    expect(isValidLatLng({ latitude: -1.28, longitude: 36.81, extra: "ok" })).toBe(true);
  });

  it.each([null, undefined, "x", {}, { latitude: "1", longitude: 2 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: NaN }])(
    "rejects %j",
    (value) => {
      expect(isValidLatLng(value)).toBe(false);
    },
  );
});
