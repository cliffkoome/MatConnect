const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const authMiddleware = require("../middleware/authMiddleware");
const { adminLimiter, dashboardLimiter } = require("../middleware/rateLimiters");
const {
  getAllStages,
  createStage,
  getAllVehicles,
  createVehicle,
  deleteVehicle,
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
router.use(adminLimiter);
router.use(authMiddleware("Admin"));

// Dashboard data
router.get("/dashboard-data", dashboardLimiter, getDashboardData);

// User Management
router.get("/users", getAllUsers);
router.post(
  "/users",
  body("name", "Name is required").notEmpty().trim().escape(),
  body("email", "Please provide a valid email").isEmail().normalizeEmail(),
  body("password", "Password must be at least 6 characters long").isLength({
    min: 6,
  }),
  body("role")
    .isIn(["Admin", "MatAdmin"])
    .withMessage("Invalid role specified"),
  createUserByAdmin,
);
router.put(
  "/users/:id",
  body("disabled", "Disabled status must be a boolean").isBoolean(),
  updateUserByAdmin,
);
router.delete("/users/:id", deleteUserByAdmin);

router.get("/feedback", getAllFeedback);
router.get("/mat-admins", getAllMatAdmins);
router.get("/stages", getAllStages);
router.post(
  "/stages",
  body("name", "Stage name is required").notEmpty().trim(),
  body("latitude", "A valid latitude is required").isFloat({
    min: -90,
    max: 90,
  }),
  body("longitude", "A valid longitude is required").isFloat({
    min: -180,
    max: 180,
  }),
  createStage,
);
router.get("/vehicles", getAllVehicles);
router.post(
  "/vehicles",
  body("carId", "Car ID is required").notEmpty().trim(),
  body("plateNumber", "Plate number is required").notEmpty().trim(),
  body("ownerId", "Owner ID must be an integer")
    .optional({ checkFalsy: true })
    .isInt(),
  createVehicle,
);
router.delete("/vehicles/:id", deleteVehicle);
router.post(
  "/stages/assign-vehicle",
  body("stageId", "Stage ID must be a positive integer").isInt({ min: 1 }),
  body("vehicleId", "Vehicle ID must be a positive integer").isInt({ min: 1 }),
  assignVehicleToStage,
);
router.delete(
  "/stages/:stageId/vehicles/:vehicleId",
  param("stageId", "Stage ID must be a positive integer").isInt({ min: 1 }),
  param("vehicleId", "Vehicle ID must be a positive integer").isInt({ min: 1 }),
  removeVehicleFromStage,
);

module.exports = router;
