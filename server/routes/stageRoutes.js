const express = require("express");
const router = express.Router();
const {
  getAllStages,
  findStagesByDestination,
  getSubscriptionStatus,
  subscribeToStage,
  unsubscribeFromStage
} = require("../controllers/stageController");
const authMiddleware = require("../middleware/authMiddleware");

// This route is for any authenticated user (Passenger or Admin)
router.get('/', authMiddleware(), getAllStages);

// Find stages that have routes to a given destination
router.get('/by-destination', authMiddleware(), findStagesByDestination);

// Routes for managing SMS alert subscriptions
router.get('/:stageId/subscription', authMiddleware(), getSubscriptionStatus);
router.post('/:stageId/subscribe', authMiddleware(), subscribeToStage);
router.post('/:stageId/unsubscribe', authMiddleware(), unsubscribeFromStage);

module.exports = router;