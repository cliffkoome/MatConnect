import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { badRequest, notFound } from "@/server/http/errors";
import { feedbackSelect } from "@/server/modules/feedback/feedback.service";
import { toPublicUser } from "@/server/modules/auth/auth.service";
import { activeVehicle, liveVehicleStatus, vehicleSummarySelect } from "@/server/modules/vehicles/vehicles";
import type {
  createStageSchema,
  createUserSchema,
  listUsersQuerySchema,
  paginationQuerySchema,
} from "./admin.schemas";

type Page = z.infer<typeof paginationQuerySchema>;

// --- Stages ---------------------------------------------------------------------------------

export async function listStagesWithVehicles({ limit, offset }: Page) {
  const [stages, total] = await Promise.all([
    db.stage.findMany({
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        vehicles: {
          where: { vehicle: activeVehicle },
          orderBy: { vehicle: { plateNumber: "asc" } },
          select: { vehicle: { select: vehicleSummarySelect } },
        },
      },
    }),
    db.stage.count(),
  ]);
  return {
    stages: stages.map(({ vehicles, ...stage }) => ({ ...stage, vehicles: vehicles.map((v) => v.vehicle) })),
    total,
  };
}

export async function createStage(input: z.infer<typeof createStageSchema>) {
  const stage = await db.stage.create({
    data: input,
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  return { ...stage, vehicles: [] };
}

// --- Vehicles -------------------------------------------------------------------------------

export async function listVehicles({ limit, offset }: Page) {
  const [vehicles, total] = await Promise.all([
    db.vehicle.findMany({
      where: activeVehicle,
      orderBy: { plateNumber: "asc" },
      take: limit,
      skip: offset,
      select: vehicleSummarySelect,
    }),
    db.vehicle.count({ where: activeVehicle }),
  ]);
  return { vehicles, total };
}

/** Soft delete (keeps trip/distance/feedback history) and drop the vehicle from every route. */
export async function deleteVehicle(vehicleId: number) {
  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, ...activeVehicle }, select: { id: true } });
  if (!vehicle) throw notFound("Vehicle not found");
  await db.$transaction([
    db.stageVehicle.deleteMany({ where: { vehicleId } }),
    db.vehicle.update({ where: { id: vehicleId }, data: { deletedAt: new Date(), isAtStage: false } }),
  ]);
  return { message: "Vehicle deleted successfully." };
}

export async function assignVehicleToStage(stageId: number, vehicleId: number) {
  const [stage, vehicle] = await Promise.all([
    db.stage.findUnique({ where: { id: stageId }, select: { id: true } }),
    db.vehicle.findFirst({ where: { id: vehicleId, ...activeVehicle }, select: { id: true } }),
  ]);
  if (!stage || !vehicle) throw notFound("Stage or Vehicle not found");
  await db.stageVehicle.upsert({
    where: { stageId_vehicleId: { stageId, vehicleId } },
    create: { stageId, vehicleId },
    update: {},
  });
  return { message: "Vehicle assigned to stage successfully" };
}

export async function removeVehicleFromStage(stageId: number, vehicleId: number) {
  const { count } = await db.stageVehicle.deleteMany({ where: { stageId, vehicleId } });
  if (count === 0) throw notFound("Stage or Vehicle not found");
  return { message: "Vehicle unassigned successfully" };
}

export async function dashboardData() {
  return { vehicles: await liveVehicleStatus() };
}

// --- Feedback -------------------------------------------------------------------------------

export async function listFeedback({ limit, offset }: Page) {
  const [feedback, total] = await Promise.all([
    db.feedback.findMany({ orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: feedbackSelect }),
    db.feedback.count(),
  ]);
  return { feedback, total };
}

// --- Users ----------------------------------------------------------------------------------

const userRowSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  authUserId: true,
  disabled: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export function buildUserListWhere(
  currentUserId: number,
  { q, role }: Pick<z.infer<typeof listUsersQuerySchema>, "q" | "role">,
): Prisma.UserWhereInput {
  return {
    id: { not: currentUserId },
    ...(role ? { role } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listUsers(currentUserId: number, query: z.infer<typeof listUsersQuerySchema>) {
  const where = buildUserListWhere(currentUserId, query);
  const [users, total] = await Promise.all([
    db.user.findMany({ where, orderBy: { name: "asc" }, take: query.limit, skip: query.offset, select: userRowSelect }),
    db.user.count({ where }),
  ]);
  // `activated`: the person has signed in through Neon Auth at least once (an Admin-added user hasn't).
  return { users: users.map(({ authUserId, ...user }) => ({ ...user, activated: authUserId !== null })), total };
}

export async function setUserDisabled(actingAdminId: number, userId: number, disabled: boolean) {
  if (actingAdminId === userId) throw badRequest("You can't block your own account.");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw notFound("User not found");
  // Takes effect on the user's next request: the API guard reads `disabled` on every call.
  await db.user.update({ where: { id: userId }, data: { disabled } });
  return { message: `User has been ${disabled ? "blocked" : "unblocked"}.` };
}

export async function deleteUser(actingAdminId: number, userId: number) {
  if (actingAdminId === userId) throw badRequest("You can't delete your own account.");
  const { count } = await db.user.deleteMany({ where: { id: userId } });
  if (count === 0) throw notFound("User not found");
  return { message: "User deleted successfully." };
}

export const listMatAdmins = () =>
  db.user.findMany({ where: { role: "MatAdmin" }, orderBy: { name: "asc" }, select: { id: true, name: true } });

/**
 * Adds a user ahead of their first sign-in. Neon Auth owns passwords, so there's none to set here:
 * the row is linked, keeping this role, when someone signs in with this (verified) email.
 */
export async function createUser(input: z.infer<typeof createUserSchema>) {
  const user = await db.user.create({ data: input });
  return { message: "User added. They get this role when they sign up with this email.", user: toPublicUser(user) };
}
