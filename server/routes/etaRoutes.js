const express = require("express");
const router = express.Router();
const { getStageEta } = require("../controllers/etaController");
const authMiddleware = require("../middleware/authMiddleware");
const { apiLimiter } = require("../middleware/rateLimiters");

router.get('/:stageId', authMiddleware(), apiLimiter, getStageEta);

module.exports = router;
