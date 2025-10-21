const express = require("express");
const router = express.Router();
const { getStageEta } = require("../controllers/etaController");
const authMiddleware = require("../middleware/authMiddleware");

router.get('/:stageId', authMiddleware(), getStageEta);

module.exports = router;