const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getAllStages,
  createStage,
  getAllVehicles,
  createVehicle,
  assignVehicleToStage,
  removeVehicleFromStage,
  getDashboardData,
} = require("../controllers/adminController");

// All routes in this file are for Admins only
router.use(authMiddleware('Admin'));

// Dashboard data
router.get('/dashboard-data', getDashboardData);

router.get('/stages', getAllStages);
router.post('/stages', createStage);
router.get('/vehicles', getAllVehicles);
router.post('/vehicles', createVehicle);
router.post('/stages/assign-vehicle', assignVehicleToStage);
router.delete('/stages/:stageId/vehicles/:vehicleId', removeVehicleFromStage);

module.exports = router;