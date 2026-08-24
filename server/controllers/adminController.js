const { Stage, Vehicle, User, Feedback } = require("../models");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const { validationResult } = require("express-validator");
const { getLocationName } = require("../services/googleMapsService");
const { getLocations } = require("../services/locationCache");

// --- Stage Management ---

const getAllStages = async (req, res, next) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const rawOffset = parseInt(req.query.offset, 10);

    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 25;
    const offset =
      Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const { count, rows } = await Stage.findAndCountAll({
      include: { model: Vehicle, through: { attributes: [] } },
      order: [["name", "ASC"]],
      limit,
      offset,
    });
    res.status(200).json({ stages: rows, total: count });
  } catch (error) {
    next(error);
  }
};

const createStage = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { name, latitude, longitude } = req.body;

    const newStage = await Stage.create({ name, latitude, longitude });
    res.status(201).json(newStage);
  } catch (error) {
    next(error);
  }
};

// --- Vehicle Management ---

const getAllVehicles = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 25;
    const offset = parseInt(req.query.offset, 10) || 0;
    const { count, rows } = await Vehicle.findAndCountAll({
      order: [["plateNumber", "ASC"]],
      limit,
      offset,
    });
    res.status(200).json({ vehicles: rows, total: count });
  } catch (error) {
    next(error);
  }
};

const createVehicle = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { carId, plateNumber, ownerId } = req.body;
    const newVehicle = await Vehicle.create({
      carId,
      plateNumber,
      ownerId: ownerId || null,
    });
    res.status(201).json(newVehicle);
  } catch (error) {
    next(error);
  }
};

const deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findByPk(id);

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    await vehicle.destroy();
    res.status(200).json({ message: "Vehicle deleted successfully." });
  } catch (error) {
    next(error);
  }
};

// --- Association Management ---

const assignVehicleToStage = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { stageId, vehicleId } = req.body;
    const stage = await Stage.findByPk(stageId);
    const vehicle = await Vehicle.findByPk(vehicleId);

    if (!stage || !vehicle) {
      return res.status(404).json({ message: "Stage or Vehicle not found" });
    }

    await stage.addVehicle(vehicle);
    res.status(200).json({ message: "Vehicle assigned to stage successfully" });
  } catch (error) {
    next(error);
  }
};

const removeVehicleFromStage = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { stageId, vehicleId } = req.params;
    const stage = await Stage.findByPk(stageId);
    const vehicle = await Vehicle.findByPk(vehicleId);
    if (!stage || !vehicle)
      return res.status(404).json({ message: "Stage or Vehicle not found" });
    await stage.removeVehicle(vehicle);
    res.status(200).json({ message: "Vehicle unassigned successfully" });
  } catch (error) {
    next(error);
  }
};

const getDashboardData = async (req, res, next) => {
  try {
    const vehicles = await Vehicle.findAll({
      order: [["plateNumber", "ASC"]],
      include: {
        model: Stage,
        attributes: ["name"],
        through: { attributes: [] }, // Don't include the join table attributes
      },
    });
    const vehicleLocations = await getLocations();

    const vehicleDetails = await Promise.all(
      vehicles.map(async (vehicle) => {
        const locationData = vehicleLocations.get(vehicle.id);

        let locationName = "Offline";
        let latitude = null;
        let longitude = null;
        if (locationData && locationData.latitude && locationData.longitude) {
          locationName = await getLocationName(locationData);
          latitude = locationData.latitude;
          longitude = locationData.longitude;
        }

        // Dynamically construct the route from the eager-loaded stages
        let route = "Not Assigned";
        if (vehicle.Stages && vehicle.Stages.length > 0) {
          // Simple route: first stage to last stage
          if (vehicle.Stages.length > 1) {
            // Sort stages by name to get a consistent route order, though a dedicated `order` column would be better.
            const sortedStages = [...vehicle.Stages].sort((a, b) =>
              a.name.localeCompare(b.name),
            );
            route = `${sortedStages[0].name} - ${sortedStages[sortedStages.length - 1].name}`;
          } else {
            route = vehicle.Stages[0].name;
          }
        }

        return {
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          status: locationData ? locationData.gpsStatus : "Offline",
          location: locationName,
          latitude,
          longitude,
          route: route,
        };
      }),
    );
    res.status(200).json({ vehicles: vehicleDetails });
  } catch (error) {
    next(error);
  }
};

const getAllFeedback = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    const { count, rows } = await Feedback.findAndCountAll({
      order: [["createdAt", "DESC"]],
      include: [
        { model: User, attributes: ["name"] },
        { model: Vehicle, attributes: ["plateNumber"] },
      ],
      limit,
      offset,
    });
    res.status(200).json({ feedback: rows, total: count });
  } catch (error) {
    next(error);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const { q = "", role = "" } = req.query;
    const rawLimit = parseInt(req.query.limit, 10);
    const rawOffset = parseInt(req.query.offset, 10);

    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 25;
    const offset =
      Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    const whereClause = {
      id: { [Op.ne]: req.user.id }, // Exclude the current admin
    };

    if (q) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
      ];
    }

    if (role && ["Admin", "MatAdmin", "Passenger"].includes(role)) {
      whereClause.role = role;
    }

    const { count, rows } = await User.findAndCountAll({
      where: whereClause,
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "twoFactorEnabled",
        "disabled",
      ], // 'disabled' is a virtual field
      order: [["name", "ASC"]],
      limit: limit,
      offset: offset,
    });
    res.status(200).json({ users: rows, total: count });
  } catch (error) {
    next(error);
  }
};

const updateUserByAdmin = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { id } = req.params;
    const { disabled } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatePayload = { disabled: !!disabled };

    // If disabling the user, invalidate all their existing tokens by updating the timestamp.
    if (disabled) {
      updatePayload.tokensValidFrom = new Date();
    }

    await user.update(updatePayload);
    res.status(200).json({
      message: `User has been ${disabled ? "blocked" : "unblocked"}.`,
    });
  } catch (error) {
    next(error);
  }
};

const deleteUserByAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.destroy();
    res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    next(error);
  }
};

const getAllMatAdmins = async (req, res, next) => {
  try {
    const matAdmins = await User.findAll({
      where: { role: "MatAdmin" },
      attributes: ["id", "name"], // Only need id and name for the dropdown
      order: [["name", "ASC"]],
    });
    res.status(200).json(matAdmins);
  } catch (error) {
    next(error);
  }
};

const createUserByAdmin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    if (!["Admin", "MatAdmin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });
    delete user.dataValues.password;

    res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllStages,
  createStage,
  getAllVehicles,
  createVehicle,
  deleteVehicle,
  assignVehicleToStage,
  removeVehicleFromStage,
  getDashboardData,
  getAllMatAdmins,
  getAllFeedback,
  getAllUsers,
  updateUserByAdmin,
  deleteUserByAdmin,
  createUserByAdmin,
};
