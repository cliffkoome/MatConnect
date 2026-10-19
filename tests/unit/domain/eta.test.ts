import { describe, expect, it, vi } from "vitest";
import {
  GEOFENCE_RADIUS_M,
  computeVehicleEta,
  mergeVehicleStatus,
  type Directions,
  type EtaVehicle,
  type VehicleStatus,
} from "@/server/domain/eta";

const stage = { latitude: -1.2833, longitude: 36.8167 };
/** ~111 m per 0.001° latitude. */
const south = (metres: number) => ({ latitude: stage.latitude - metres / 111_195, longitude: stage.longitude });

const vehicle = (overrides: Partial<EtaVehicle> = {}): EtaVehicle => ({
  id: 1,
  carId: "CAR_001",
  plateNumber: "KDH 420X",
  lastLatitude: null,
  lastLongitude: null,
  ...overrides,
});

const leg = (distanceM: number, duration = "4 mins", inTraffic?: string): Directions => ({
  distance: { value: distanceM, text: `${distanceM} m` },
  duration: { value: 240, text: duration },
  ...(inTraffic ? { duration_in_traffic: { value: 300, text: inTraffic } } : {}),
});

describe("computeVehicleEta", () => {
  it("is Offline without a location and never asks for directions", async () => {
    const directions = vi.fn();
    const eta = await computeVehicleEta(vehicle(), undefined, stage, directions);
    expect(eta).toMatchObject({ status: "Offline", eta: "N/A" });
    expect(directions).not.toHaveBeenCalled();
  });

  it("is Too Far outside the geofence (saves a Google Maps call)", async () => {
    const directions = vi.fn();
    const eta = await computeVehicleEta(vehicle(), south(GEOFENCE_RADIUS_M + 500), stage, directions);
    expect(eta.status).toBe("Too Far");
    expect(directions).not.toHaveBeenCalled();
  });

  it("is No Route when directions are unavailable", async () => {
    const eta = await computeVehicleEta(vehicle(), south(1_000), stage, async () => null);
    expect(eta).toMatchObject({ status: "No Route", eta: "N/A" });
  });

  it("is Arrived within 50 m of route distance", async () => {
    const eta = await computeVehicleEta(vehicle(), south(30), stage, async () => leg(30));
    expect(eta).toMatchObject({ status: "Arrived", eta: "Arrived" });
  });

  it("is Approaching with the traffic-aware duration when available", async () => {
    const eta = await computeVehicleEta(vehicle(), south(1_000), stage, async () => leg(1_200, "4 mins", "6 mins"));
    expect(eta).toEqual({ id: 1, carId: "CAR_001", plateNumber: "KDH 420X", status: "Approaching", eta: "6 mins" });
  });

  it("falls back to the plain duration", async () => {
    const eta = await computeVehicleEta(vehicle(), south(1_000), stage, async () => leg(1_200, "4 mins"));
    expect(eta.eta).toBe("4 mins");
  });

  it("is Departed when heading away from the stage", async () => {
    const previous = south(800);
    const current = south(1_000); // moved 200 m further south, i.e. away from the stage
    const eta = await computeVehicleEta(
      vehicle({ lastLatitude: previous.latitude, lastLongitude: previous.longitude }),
      current,
      stage,
      async () => leg(1_200),
    );
    expect(eta.status).toBe("Departed");
  });

  it("is Approaching when heading towards the stage", async () => {
    const previous = south(1_200);
    const eta = await computeVehicleEta(
      vehicle({ lastLatitude: previous.latitude, lastLongitude: previous.longitude }),
      south(1_000),
      stage,
      async () => leg(1_100),
    );
    expect(eta.status).toBe("Approaching");
  });

  it("ignores GPS drift below the movement threshold when judging heading", async () => {
    const previous = south(995); // 5 m away "backwards"
    const eta = await computeVehicleEta(
      vehicle({ lastLatitude: previous.latitude, lastLongitude: previous.longitude }),
      south(1_000),
      stage,
      async () => leg(1_100),
    );
    expect(eta.status).toBe("Approaching");
  });
});

describe("mergeVehicleStatus", () => {
  it("keeps the first status unless a later stage reports Arrived", () => {
    const statuses = new Map<number, VehicleStatus>();
    mergeVehicleStatus(statuses, 1, "Approaching");
    mergeVehicleStatus(statuses, 1, "Departed");
    expect(statuses.get(1)).toBe("Approaching");
    mergeVehicleStatus(statuses, 1, "Arrived");
    mergeVehicleStatus(statuses, 1, "Too Far");
    expect(statuses.get(1)).toBe("Arrived");
  });
});
