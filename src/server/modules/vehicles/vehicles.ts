import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { describeRoute } from "@/server/domain/routes";
import { badRequest, notFound } from "@/server/http/errors";
import { getLocationName } from "@/server/integrations/google-maps";
import { getVehicleLocations } from "@/server/integrations/firebase";

/** Vehicles are soft-deleted; every query must go through this filter. */
export const activeVehicle = { deletedAt: null } satisfies Prisma.VehicleWhereInput;

export const vehicleSummarySelect = {
  id: true,
  carId: true,
  plateNumber: true,
  ownerId: true,
  isAtStage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VehicleSelect;

export type VehicleSummary = Prisma.VehicleGetPayload<{ select: typeof vehicleSummarySelect }>;

export async function createVehicle(input: { carId: string; plateNumber: string; ownerId: number | null }) {
  if (input.ownerId != null) {
    const owner = await db.user.findUnique({ where: { id: input.ownerId }, select: { role: true } });
    if (!owner) throw notFound("Owner not found");
    if (owner.role !== Role.MatAdmin) throw badRequest("Vehicles can only be owned by Matatu admins.");
  }
  return db.vehicle.create({ data: input, select: vehicleSummarySelect });
}

export type LiveVehicleRow = {
  id: number;
  plateNumber: string;
  status: "Online" | "Offline";
  gpsStatus: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  route: string;
};

/** Live status table rows (admin dashboard and Matatu-admin dashboard). */
export async function liveVehicleStatus(where: Prisma.VehicleWhereInput = {}): Promise<LiveVehicleRow[]> {
  const [vehicles, locations] = await Promise.all([
    db.vehicle.findMany({
      where: { ...activeVehicle, ...where },
      orderBy: { plateNumber: "asc" },
      select: {
        id: true,
        carId: true,
        plateNumber: true,
        stages: { select: { stage: { select: { name: true } } } },
      },
    }),
    getVehicleLocations(),
  ]);

  return Promise.all(
    vehicles.map(async (vehicle) => {
      const location = locations.get(vehicle.carId);
      return {
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        status: location ? "Online" : "Offline",
        gpsStatus: location?.gpsStatus ?? null,
        location: location ? await getLocationName(location) : "Offline",
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        route: describeRoute(vehicle.stages.map((s) => s.stage.name)),
      } satisfies LiveVehicleRow;
    }),
  );
}
