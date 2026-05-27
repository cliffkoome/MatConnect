require("dotenv").config();

let redis;
if (process.env.REDIS_URL) {
  try {
    const Redis = require("ioredis");
    redis = new Redis(process.env.REDIS_URL);
    console.log("✅ Redis connected successfully.");
    redis.on("error", (err) =>
      console.error("❌ Redis connection error:", err),
    );
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") {
      console.warn(
        "⚠️  `ioredis` package not found. Caching service will be in-memory only.",
      );
      console.warn("Run `npm install ioredis` to enable Redis caching.");
      redis = null;
    } else {
      // For other errors, it's better to let the app crash.
      throw e;
    }
  }
} else {
  console.warn(
    "REDIS_URL not set. Caching service will be in-memory only and not scalable.",
  );
}
// This service will now handle the vehicle locations cache.
// It uses Redis if available, otherwise falls back to in-memory Map.
const inMemoryCache = new Map();
const CACHE_KEY = "vehicle_locations";
const CACHE_TTL_SECONDS = 60; // How long to keep the data in Redis

const getLocations = async () => {
  if (redis) {
    const data = await redis.get(CACHE_KEY);
    return data ? new Map(JSON.parse(data)) : new Map();
  }
  return inMemoryCache;
};

const setLocations = async (locations) => {
  const mapAsArray = Array.from(locations.entries());
  if (redis) {
    await redis.set(
      CACHE_KEY,
      JSON.stringify(mapAsArray),
      "EX",
      CACHE_TTL_SECONDS,
    );
  } else {
    // For in-memory, we just replace the map.
    inMemoryCache.clear();
    for (const [key, value] of locations) {
      inMemoryCache.set(key, value);
    }
  }
};

module.exports = { getLocations, setLocations, redis };
