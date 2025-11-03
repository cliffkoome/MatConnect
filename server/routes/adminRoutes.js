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
  getAllFeedback,
  getAllUsers,
  updateUserByAdmin,
  deleteUserByAdmin,
  createUserByAdmin,
  getAllMatAdmins,
} = require("../controllers/adminController");

// All routes in this file are for Admins only
router.use(authMiddleware('Admin'));

// Dashboard data
router.get('/dashboard-data', getDashboardData);

// User Management
router.get('/users', getAllUsers);
router.post('/users', createUserByAdmin);
router.put('/users/:id', updateUserByAdmin);
router.delete('/users/:id', deleteUserByAdmin);

router.get('/feedback', getAllFeedback);
router.get('/mat-admins', getAllMatAdmins);
router.get('/stages', getAllStages);
router.post('/stages', createStage);
router.get('/vehicles', getAllVehicles);
router.post('/vehicles', createVehicle);
router.post('/stages/assign-vehicle', assignVehicleToStage);
router.delete('/stages/:stageId/vehicles/:vehicleId', removeVehicleFromStage);

module.exports = router;