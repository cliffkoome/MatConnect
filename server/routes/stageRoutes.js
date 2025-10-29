const express = require("express");
const router = express.Router();
const {
  getAllStages,
  getSubscriptionStatus,
  subscribeToStage,
  unsubscribeFromStage
} = require("../controllers/stageController");
const authMiddleware = require("../middleware/authMiddleware");

// This route is for any authenticated user (Passenger or Admin)
router.get('/', authMiddleware(), getAllStages);

// Routes for managing SMS alert subscriptions
router.get('/:stageId/subscription', authMiddleware(), getSubscriptionStatus);
router.post('/:stageId/subscribe', authMiddleware(), subscribeToStage);
router.post('/:stageId/unsubscribe', authMiddleware(), unsubscribeFromStage);

module.exports = router;