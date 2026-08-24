const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getDashboardData,
  createVehicle,
  getMyVehicles,
  getDashboardSummary,
  getVehicleStats,
  getVehicleChartData,
  getFleetAggregateData,
} = require("../controllers/matAdminController");

// All routes in this file are for MatAdmins only
router.use(authMiddleware("MatAdmin"));

router.get("/dashboard-summary", getDashboardSummary);
router.get("/dashboard-data", getDashboardData); // For live vehicle status
router.get("/vehicle-stats", getVehicleStats);
router.get("/fleet-aggregate-data", getFleetAggregateData);
router.get("/vehicles/:vehicleId/chart-data", getVehicleChartData);
router.post(
  "/vehicles",
  body("carId", "Car ID is required").notEmpty().trim(),
  body("plateNumber", "Plate number is required").notEmpty().trim(),
  createVehicle,
);
router.get("/vehicles", getMyVehicles);

module.exports = router;
