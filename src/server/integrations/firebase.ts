import "server-only";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";
import { isValidLatLng, type LatLng } from "@/server/domain/geo";
import { env } from "@/server/env";

/**
 * Firebase Realtime Database: IoT devices write GPS fixes to `locations/<carId>`, and the ETA
 * cycle publishes `etas/<stageName>` for live clients.
 *
 * Credentials come from FIREBASE_CREDENTIALS_BASE64 (base64 of the service-account JSON) —
 * the file-on-disk option from the Express app doesn't suit serverless deploys.
 */

export type VehicleLocation = LatLng & { gpsStatus?: string };
export type StageEtaPayload = Record<string, { plateNumber: string; eta: string; status: string }>;

let database: Database | null | undefined;

function getRtdb(): Database | null {
  if (database !== undefined) return database;

  const { FIREBASE_CREDENTIALS_BASE64, FIREBASE_DATABASE_URL } = env();
  if (!FIREBASE_CREDENTIALS_BASE64) {
    console.warn("[firebase] FIREBASE_CREDENTIALS_BASE64 not set — live locations and ETAs are disabled.");
    database = null;
    return database;
  }

  try {
    const serviceAccount = JSON.parse(
      Buffer.from(FIREBASE_CREDENTIALS_BASE64, "base64").toString("utf8"),
    ) as ServiceAccount;
    const app: App =
      getApps().find((a) => a.name === "matconnect") ??
      initializeApp({ credential: cert(serviceAccount), databaseURL: FIREBASE_DATABASE_URL }, "matconnect");
    database = getDatabase(app);
  } catch (error) {
    console.error("[firebase] failed to initialise", error);
    database = null;
  }
  return database;
}

/** Raw `locations` node, keeping only entries that look like valid coordinates. */
export async function fetchVehicleLocations(): Promise<Map<string, VehicleLocation>> {
  const rtdb = getRtdb();
  const result = new Map<string, VehicleLocation>();
  if (!rtdb) return result;

  const snapshot = await rtdb.ref("locations").once("value");
  const raw = (snapshot.val() ?? {}) as Record<string, unknown>;
  for (const [carId, value] of Object.entries(raw)) {
    if (isValidLatLng(value)) {
      const { latitude, longitude, gpsStatus } = value as VehicleLocation;
      result.set(carId, { latitude, longitude, gpsStatus });
    }
  }
  return result;
}

export async function publishStageEtas(stageName: string, etas: StageEtaPayload): Promise<void> {
  const rtdb = getRtdb();
  if (!rtdb) return;
  await rtdb.ref("etas").child(stageName).set(etas);
}

// --- Short-lived cache -----------------------------------------------------------------------
// Replaces the Express app's in-memory/Redis "locationCache". Instead of depending on a background
// loop in the same process (which doesn't exist on serverless), readers fetch from Firebase and
// share the result for a few seconds.

const LOCATION_CACHE_TTL_MS = 10_000;
let cache: { at: number; value: Promise<Map<string, VehicleLocation>> } | undefined;

export function getVehicleLocations(now = Date.now()): Promise<Map<string, VehicleLocation>> {
  if (!cache || now - cache.at > LOCATION_CACHE_TTL_MS) {
    const value = fetchVehicleLocations().catch((error) => {
      console.error("[firebase] failed to read locations", error);
      cache = undefined;
      return new Map<string, VehicleLocation>();
    });
    cache = { at: now, value };
  }
  return cache.value;
}

/** Lets the ETA cycle seed the cache with what it just read. */
export function primeVehicleLocations(locations: Map<string, VehicleLocation>, now = Date.now()) {
  cache = { at: now, value: Promise.resolve(locations) };
}
