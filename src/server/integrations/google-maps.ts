import "server-only";
import type { Directions } from "@/server/domain/eta";
import type { LatLng } from "@/server/domain/geo";
import { env } from "@/server/env";
import { TtlCache } from "@/server/lib/ttl-cache";

const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const CACHE_TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 5_000;

const routeCache = new TtlCache<string, Directions | null>(CACHE_TTL_MS, 2_000);
const geocodeCache = new TtlCache<string, string>(CACHE_TTL_MS, 2_000);

/** ~110 m grid, so small GPS jitter still hits the cache. */
const round = (p: LatLng) => `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;

let warned = false;
function apiKey(): string | null {
  const key = env().GOOGLE_MAPS_API_KEY ?? null;
  if (!key && !warned) {
    console.warn("[google-maps] GOOGLE_MAPS_API_KEY not set — ETAs and place names are disabled.");
    warned = true;
  }
  return key;
}

async function getJson(url: URL): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`Google Maps HTTP ${res.status}`);
  return res.json();
}

/** Traffic-aware directions leg (`departure_time=now`), or null. */
export async function getDirections(origin: LatLng, destination: LatLng): Promise<Directions | null> {
  const key = apiKey();
  if (!key) return null;

  const cacheKey = `${round(origin)}-${round(destination)}`;
  const cached = routeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const url = new URL(DIRECTIONS_URL);
  url.search = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    departure_time: "now",
    key,
  }).toString();

  try {
    const data = (await getJson(url)) as { routes?: { legs?: Directions[] }[] };
    const leg = data.routes?.[0]?.legs?.[0] ?? null;
    routeCache.set(cacheKey, leg);
    return leg;
  } catch (error) {
    console.error("[google-maps] directions failed", error);
    return null;
  }
}

/** Street-level address for coordinates (prefers a `route` result), with the same fallbacks as before. */
export async function getLocationName(location: LatLng): Promise<string> {
  const key = apiKey();
  if (!key) return "Unknown Location";

  const cacheKey = round(location);
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const url = new URL(GEOCODE_URL);
  url.search = new URLSearchParams({ latlng: `${location.latitude},${location.longitude}`, key }).toString();

  try {
    const data = (await getJson(url)) as { results?: { types: string[]; formatted_address: string }[] };
    const results = data.results ?? [];
    if (!results.length) return "Location not found";
    const address = (results.find((r) => r.types.includes("route")) ?? results[0]!).formatted_address;
    geocodeCache.set(cacheKey, address);
    return address;
  } catch (error) {
    console.error("[google-maps] geocoding failed", error);
    return "Unknown Location";
  }
}
