const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { submitFeedback, getAllVehiclesForFeedback } = require("../controllers/feedbackController");

// All routes in this file are for authenticated passengers
router.use(authMiddleware('Passenger'));

router.get('/vehicles', getAllVehiclesForFeedback);
router.post('/', submitFeedback);

module.exports = router;