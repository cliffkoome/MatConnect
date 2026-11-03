/**
 * Development seed — idempotent, safe to re-run:  npm run db:seed
 *
 * Creates one app user per role, a few Nairobi stages and vehicles. Passwords live in Neon Auth, so
 * the users have none here: sign up (or sign in with Google) with one of these emails and you get
 * that role. Neon Auth emails a verification code, so use addresses you can read, for example:
 *   SEED_ADMIN_EMAIL=you+admin@gmail.com SEED_MATADMIN_EMAIL=you+owner@gmail.com npm run db:seed
 * Never run against production: it refuses when NODE_ENV=production.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed with NODE_ENV=production.");
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL (or DIRECT_URL) before seeding.");

// Same UTC session rule as src/server/db.ts (see createUtcPool there).
const pool = new pg.Pool({ connectionString, onConnect: async (client) => void (await client.query("SET TIME ZONE 'UTC'")) });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const user = (email: string, name: string, role: "Admin" | "MatAdmin" | "Passenger", phoneNumber?: string) =>
    db.user.upsert({
      where: { email: email.trim().toLowerCase() },
      update: {},
      create: { email: email.trim().toLowerCase(), name, role, phoneNumber },
    });

  const emails = {
    admin: process.env.SEED_ADMIN_EMAIL || "admin@matconnect.local",
    owner: process.env.SEED_MATADMIN_EMAIL || "owner@matconnect.local",
    passenger: process.env.SEED_PASSENGER_EMAIL || "passenger@matconnect.local",
  };
  const [, owner] = await Promise.all([
    user(emails.admin, "System Admin", "Admin"),
    user(emails.owner, "Matatu Owner", "MatAdmin"),
    user(emails.passenger, "Pat Passenger", "Passenger", "+254700000000"),
  ]);

  const stages = await Promise.all(
    [
      { name: "Kenyatta Avenue", latitude: -1.2841, longitude: 36.8233 },
      { name: "Kencom", latitude: -1.2864, longitude: 36.8253 },
      { name: "Westlands", latitude: -1.2676, longitude: 36.8108 },
      { name: "Archives", latitude: -1.2836, longitude: 36.8265 },
    ].map((s) => db.stage.upsert({ where: { name: s.name }, update: {}, create: s })),
  );

  const vehicles = await Promise.all(
    [
      { carId: "CAR_001", plateNumber: "KDH 420X" },
      { carId: "CAR_002", plateNumber: "KCL 112A" },
      { carId: "CAR_003", plateNumber: "KDJ 899B" },
    ].map((v) => db.vehicle.upsert({ where: { carId: v.carId }, update: {}, create: { ...v, ownerId: owner.id } })),
  );

  // Route: every vehicle serves Westlands ↔ Kencom.
  const route = stages.filter((s) => ["Westlands", "Kencom"].includes(s.name));
  await db.stageVehicle.createMany({
    data: vehicles.flatMap((v) => route.map((s) => ({ stageId: s.id, vehicleId: v.id }))),
    skipDuplicates: true,
  });

  console.log(`Seeded ${stages.length} stages, ${vehicles.length} vehicles and 3 users.`);
  console.log(`Sign up with ${Object.values(emails).join(", ")} to use them (the role comes with the email).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
