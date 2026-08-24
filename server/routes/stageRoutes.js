const express = require("express");
const router = express.Router();
const {
  getAllStages,
  getSubscriptionStatus,
  subscribeToStage,
  unsubscribeFromStage,
} = require("../controllers/stageController");
const authMiddleware = require("../middleware/authMiddleware");
const { subscriptionLimiter } = require("../middleware/rateLimiters");

// This route is for any authenticated user (Passenger or Admin)
router.get("/", authMiddleware(), getAllStages);

// Routes for managing SMS alert subscriptions
router.get("/:stageId/subscription", authMiddleware(), getSubscriptionStatus);
router.post(
  "/:stageId/subscribe",
  authMiddleware(),
  subscriptionLimiter,
  subscribeToStage,
);
router.post(
  "/:stageId/unsubscribe",
  authMiddleware(),
  subscriptionLimiter,
  unsubscribeFromStage,
);

module.exports = router;
