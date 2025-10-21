const express = require("express");
const router = express.Router();
const { getAllStages } = require("../controllers/stageController");
const authMiddleware = require("../middleware/authMiddleware");

// This route is for any authenticated user (Passenger or Admin)
router.get('/', authMiddleware(), getAllStages);

module.exports = router;