import "server-only";
import { db } from "@/server/db";
import { badRequest, notFound } from "@/server/http/errors";

const stageSelect = { id: true, name: true, latitude: true, longitude: true } as const;

export const listStages = () => db.stage.findMany({ orderBy: { name: "asc" }, select: stageSelect });

async function requireStage(stageId: number) {
  const stage = await db.stage.findUnique({ where: { id: stageId }, select: stageSelect });
  if (!stage) throw notFound("Stage not found");
  return stage;
}

export async function getSubscriptionStatus(userId: number, stageId: number) {
  const count = await db.stageSubscription.count({ where: { userId, stageId } });
  return { isSubscribed: count > 0 };
}

export async function subscribe(userId: number, stageId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { phoneNumber: true } });
  if (!user) throw notFound("User not found");
  if (!user.phoneNumber) {
    throw badRequest("Please add a phone number to your profile to subscribe for alerts.");
  }
  const stage = await requireStage(stageId);
  await db.stageSubscription.upsert({
    where: { userId_stageId: { userId, stageId } },
    create: { userId, stageId },
    update: {},
  });
  return { message: `Successfully subscribed to alerts for ${stage.name}.` };
}

export async function unsubscribe(userId: number, stageId: number) {
  const stage = await requireStage(stageId);
  await db.stageSubscription.deleteMany({ where: { userId, stageId } });
  return { message: `Successfully unsubscribed from alerts for ${stage.name}.` };
}
