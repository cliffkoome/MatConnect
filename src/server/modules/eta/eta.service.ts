import "server-only";
import { db } from "@/server/db";
import { HIDDEN_STATUSES, computeVehicleEta, type Directions, type EtaVehicle, type VehicleEta } from "@/server/domain/eta";
import type { LatLng } from "@/server/domain/geo";
import { notFound } from "@/server/http/errors";
import { getVehicleLocations } from "@/server/integrations/firebase";
import { getDirections } from "@/server/integrations/google-maps";
import { activeVehicle } from "@/server/modules/vehicles/vehicles";

export type DirectionsFn = (origin: LatLng, destination: LatLng) => Promise<Directions | null>;

/**
 * ETAs for every vehicle on a stage, in parallel. Returns all statuses; callers decide what to hide
 * (`visibleArrivals`) — the cycle needs "Departed" vehicles for trip/state bookkeeping.
 */
export function calculateEtasForStage(
  stage: LatLng,
  vehicles: EtaVehicle[],
  locationsByCarId: Map<string, LatLng>,
  directions: DirectionsFn = getDirections,
): Promise<VehicleEta[]> {
  return Promise.all(
    vehicles.map((vehicle) => computeVehicleEta(vehicle, locationsByCarId.get(vehicle.carId), stage, directions)),
  );
}

export const visibleArrivals = (etas: VehicleEta[]) => etas.filter((e) => !HIDDEN_STATUSES.has(e.status));

export async function getStageEta(stageId: number) {
  const stage = await db.stage.findUnique({
    where: { id: stageId },
    select: {
      name: true,
      latitude: true,
      longitude: true,
      vehicles: {
        where: { vehicle: activeVehicle },
        select: {
          vehicle: {
            select: { id: true, carId: true, plateNumber: true, lastLatitude: true, lastLongitude: true },
          },
        },
      },
    },
  });
  if (!stage) throw notFound("Stage not found");

  const locations = await getVehicleLocations();
  const etas = await calculateEtasForStage(
    stage,
    stage.vehicles.map((v) => v.vehicle),
    locations,
  );
  return { stageName: stage.name, arrivals: visibleArrivals(etas) };
}
