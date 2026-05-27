require("dotenv").config();

let redis;
// In-memory fallback for the blocklist
const inMemoryBlocklist = new Map(); // Use a Map to store jti -> expiration
let cleanupInterval = null;

if (process.env.REDIS_URL) {
  try {
    const Redis = require("ioredis");
    redis = new Redis(process.env.REDIS_URL);
    console.log("✅ Token blocklist connected to Redis.");
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") {
      console.warn(
        "⚠️  `ioredis` package not found. Token blocklist will be in-memory only.",
      );
      redis = null;
    } else {
      throw e;
    }
  }
} else {
  console.warn(
    "REDIS_URL not set. Token blocklist will be in-memory only and not scalable.",
  );

  // Start a single cleanup interval for the in-memory blocklist
  if (!cleanupInterval) {
    cleanupInterval = setInterval(
      () => {
        const now = Math.floor(Date.now() / 1000);
        let deletedCount = 0;
        for (const [jti, expires] of inMemoryBlocklist.entries()) {
          if (expires < now) {
            inMemoryBlocklist.delete(jti);
            deletedCount++;
          }
        }
        if (deletedCount > 0 && process.env.NODE_ENV !== "production") {
          console.log(
            `In-memory blocklist cleaned up ${deletedCount} expired tokens. Size: ${inMemoryBlocklist.size}`,
          );
        }
      },
      15 * 60 * 1000,
    ); // Run every 15 minutes
    cleanupInterval.unref(); // Allow the process to exit if this is the only timer
  }
}

const BLOCKLIST_PREFIX = "blocklist:";

const addToBlocklist = async (jti, expires) => {
  // Calculate the remaining time-to-live for the token in seconds.
  const now = Math.floor(Date.now() / 1000);
  const ttl = expires - now;

  // Only add to blocklist if the token hasn't already expired.
  if (ttl <= 0) {
    return;
  }

  if (redis) {
    await redis.set(`${BLOCKLIST_PREFIX}${jti}`, "1", "EX", ttl);
  } else {
    // Fallback to in-memory Map, storing the expiration time
    inMemoryBlocklist.set(jti, expires);
  }
};

const isBlocklisted = async (jti) => {
  if (redis) {
    const result = await redis.get(`${BLOCKLIST_PREFIX}${jti}`);
    return result === "1";
  }
  // Fallback to in-memory Set
  return inMemoryBlocklist.has(jti);
};

module.exports = { addToBlocklist, isBlocklisted };
