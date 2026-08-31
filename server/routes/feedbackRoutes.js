const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authMiddleware = require("../middleware/authMiddleware");
const { apiLimiter } = require("../middleware/rateLimiters");
const {
  submitFeedback,
  getAllVehiclesForFeedback,
} = require("../controllers/feedbackController");

// All routes in this file are for authenticated passengers
router.use(authMiddleware("Passenger"));
router.use(apiLimiter);

router.get("/vehicles", getAllVehiclesForFeedback);
router.post(
  "/",
  body("vehicleId", "Vehicle ID is required").isInt(),
  body("rating", "Rating must be between 1 and 5").isInt({ min: 1, max: 5 }),
  body("comment").optional().trim().escape(),
  submitFeedback,
);

module.exports = router;
