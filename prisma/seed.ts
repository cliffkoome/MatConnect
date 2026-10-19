/**
 * Development seed — idempotent, safe to re-run:  npm run db:seed
 *
 * Creates one account per role (password: `matconnect123`), a few Nairobi stages and vehicles.
 * Never run against production: it refuses when NODE_ENV=production.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed with NODE_ENV=production.");
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL (or DIRECT_URL) before seeding.");

// Same UTC session rule as src/server/db.ts (see createUtcPool there).
const pool = new pg.Pool({ connectionString, onConnect: async (client) => void (await client.query("SET TIME ZONE 'UTC'")) });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const password = await bcrypt.hash("matconnect123", 10);
  const user = (email: string, name: string, role: "Admin" | "MatAdmin" | "Passenger", phoneNumber?: string) =>
    db.user.upsert({
      where: { email },
      update: {},
      create: { email, name, role, password, phoneNumber },
    });

  const [, owner] = await Promise.all([
    user("admin@matconnect.local", "System Admin", "Admin"),
    user("owner@matconnect.local", "Matatu Owner", "MatAdmin"),
    user("passenger@matconnect.local", "Pat Passenger", "Passenger", "+254700000000"),
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

  console.log(`Seeded ${stages.length} stages, ${vehicles.length} vehicles and 3 users (password: matconnect123).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
