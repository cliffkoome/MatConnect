import { bearingDifference, calculateBearing, haversineDistance, type LatLng } from "./geo";

/** Only ask Google for directions when the vehicle is within this straight-line distance. */
export const GEOFENCE_RADIUS_M = 5_000;
/** Straight-line distance at or below which a vehicle counts as "Arrived". */
export const ARRIVAL_RADIUS_M = 50;
/**
 * Straight-line distance a vehicle must exceed before it counts as having left a stage. Larger than
 * ARRIVAL_RADIUS_M on purpose (hysteresis): GPS jitter around the 50 m line must not look like
 * leave-and-return, or one stop would be counted as several trips.
 */
export const DEPARTURE_RADIUS_M = 150;
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
 * Pure classification step of the ETA calculation. `getDirections` is only called for vehicles
 * that are inside the geofence but not yet at the stage.
 *
 * Arrival is decided from the GPS fix alone, never from Google: directions are cached on a ~110 m
 * grid for minutes, which is far coarser than the 50 m arrival radius, and a Maps outage must not
 * stop trips being counted. (Road distance is never shorter than straight-line distance, so this
 * can only detect arrival earlier than the old route-distance rule, never miss one.)
 */
export async function computeVehicleEta(
  vehicle: EtaVehicle,
  current: LatLng | undefined,
  stage: LatLng,
  getDirections: (origin: LatLng, destination: LatLng) => Promise<Directions | null>,
): Promise<VehicleEta> {
  const base = { id: vehicle.id, carId: vehicle.carId, plateNumber: vehicle.plateNumber };

  if (!current) return { ...base, eta: "N/A", status: "Offline" };

  const straightLine = haversineDistance(current, stage);
  if (straightLine > GEOFENCE_RADIUS_M) {
    return { ...base, eta: "N/A", status: "Too Far" };
  }
  if (straightLine <= ARRIVAL_RADIUS_M) {
    return { ...base, eta: "Arrived", status: "Arrived" };
  }

  const directions = await getDirections(current, stage);
  if (!directions?.distance || !directions.duration) {
    return { ...base, eta: "N/A", status: "No Route" };
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
 * True only with positive evidence that the vehicle is away from every stage it serves: it has a
 * fix, and that fix is beyond DEPARTURE_RADIUS_M of each of them. A missing fix (GPS dropout) or a
 * failed lookup is *not* evidence of leaving, so it can't cause a second trip to be counted.
 */
export function hasLeftAllStages(current: LatLng | undefined, stages: readonly LatLng[]): boolean {
  if (!current) return false;
  return stages.every((stage) => haversineDistance(current, stage) > DEPARTURE_RADIUS_M);
}
