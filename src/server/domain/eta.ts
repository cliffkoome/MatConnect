import { bearingDifference, calculateBearing, haversineDistance, type LatLng } from "./geo";

/** Only ask Google for directions when the vehicle is within this straight-line distance. */
export const GEOFENCE_RADIUS_M = 5_000;
/** Route distance below which a vehicle counts as "Arrived". */
export const ARRIVAL_RADIUS_M = 50;
/** Movement below this is treated as GPS drift. */
export const MOVEMENT_THRESHOLD_M = 10;
/** Heading this far away from the stage means the vehicle has already left it. */
export const DEPARTED_ANGLE_DEG = 90;

export type VehicleStatus = "Offline" | "Too Far" | "No Route" | "Approaching" | "Arrived" | "Departed";

export type Directions = {
  distance: { value: number; text: string };
  duration: { value: number; text: string };
  duration_in_traffic?: { value: number; text: string };
};

export type VehicleEta = {
  id: number;
  carId: string;
  plateNumber: string;
  eta: string;
  status: VehicleStatus;
};

/** Statuses passengers should not see for a stage. */
export const HIDDEN_STATUSES: ReadonlySet<VehicleStatus> = new Set(["Departed", "Too Far"]);

export type EtaVehicle = {
  id: number;
  carId: string;
  plateNumber: string;
  lastLatitude: number | null;
  lastLongitude: number | null;
};

/**
 * Pure classification step of the ETA calculation (same rules as the original
 * etaCalculationService, minus the I/O). `getDirections` is only called inside the geofence.
 */
export async function computeVehicleEta(
  vehicle: EtaVehicle,
  current: LatLng | undefined,
  stage: LatLng,
  getDirections: (origin: LatLng, destination: LatLng) => Promise<Directions | null>,
): Promise<VehicleEta> {
  const base = { id: vehicle.id, carId: vehicle.carId, plateNumber: vehicle.plateNumber };

  if (!current) return { ...base, eta: "N/A", status: "Offline" };

  if (haversineDistance(current, stage) > GEOFENCE_RADIUS_M) {
    return { ...base, eta: "N/A", status: "Too Far" };
  }

  const directions = await getDirections(current, stage);
  if (!directions?.distance || !directions.duration) {
    return { ...base, eta: "N/A", status: "No Route" };
  }

  if (directions.distance.value < ARRIVAL_RADIUS_M) {
    return { ...base, eta: "Arrived", status: "Arrived" };
  }

  const previous =
    vehicle.lastLatitude != null && vehicle.lastLongitude != null
      ? { latitude: vehicle.lastLatitude, longitude: vehicle.lastLongitude }
      : null;

  if (previous && haversineDistance(previous, current) > MOVEMENT_THRESHOLD_M) {
    const heading = calculateBearing(previous, current);
    const towardsStage = calculateBearing(current, stage);
    if (bearingDifference(heading, towardsStage) > DEPARTED_ANGLE_DEG) {
      return { ...base, eta: "N/A", status: "Departed" };
    }
  }

  const duration = directions.duration_in_traffic ?? directions.duration;
  return { ...base, eta: duration.text, status: "Approaching" };
}

/**
 * A vehicle can serve several stages. Its status for the cycle is "Arrived" if it arrived at any
 * of them, otherwise the first status seen.
 */
export function mergeVehicleStatus(
  statuses: Map<number, VehicleStatus>,
  vehicleId: number,
  status: VehicleStatus,
): void {
  if (status === "Arrived" || !statuses.has(vehicleId)) statuses.set(vehicleId, status);
}
