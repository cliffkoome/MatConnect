const express = require("express");
const router = express.Router();
const { getStageEta, getPossibleDestinations } = require("../controllers/etaController");
const authMiddleware = require("../middleware/authMiddleware");

router.get('/:stageId', authMiddleware(), getStageEta);
router.get('/:stageId/destinations', authMiddleware(), getPossibleDestinations);

module.exports = router;