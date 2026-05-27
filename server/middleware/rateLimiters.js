const rateLimit = require("express-rate-limit");
const { redis } = require("../services/locationCache");

let store;

// Only try to use RedisStore if Redis is configured and the package is installed.
if (redis) {
  try {
    const { RedisStore } = require("rate-limit-redis");
    store = new RedisStore({
      // @ts-ignore
      sendCommand: (...args) => redis.call(...args),
    });
    console.log("✅ Rate limiter connected to Redis.");
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") {
      console.warn(
        "⚠️  `rate-limit-redis` package not found. Rate limiting will use in-memory store.",
      );
    } else {
      throw e;
    }
  }
}

// General limiter for authentication actions
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  store,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
});

// A stricter limiter for potentially costly operations like SMS
const subscriptionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // Limit each IP to 30 subscription changes per 10 minutes
  store,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many subscription requests. Please try again later.",
});

module.exports = {
  authLimiter,
  subscriptionLimiter,
};
