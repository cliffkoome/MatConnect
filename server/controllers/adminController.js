const { Stage, Vehicle, User, Feedback } = require('../models');
const bcrypt = require("bcrypt");
const { Op } = require('sequelize');
const { getVehicleLocation } = require('../services/firebaseService');
const { getLocationName } = require('../services/googleMapsService');

// --- Stage Management ---

const getAllStages = async (req, res) => {
  try {
    const stages = await Stage.findAll({
      include: { model: Vehicle, through: { attributes: [] } },
      order: [['name', 'ASC']]
    });
    res.status(200).json(stages);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stages', error: error.message });
  }
};

const createStage = async (req, res) => {
  try {
    const { name, latitude, longitude } = req.body;
    const newStage = await Stage.create({ name, latitude, longitude });
    res.status(201).json(newStage);
  } catch (error) {
    res.status(500).json({ message: 'Error creating stage', error: error.message });
  }
};

// --- Vehicle Management ---

const getAllVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.findAll({ order: [['plateNumber', 'ASC']] });
    res.status(200).json(vehicles);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching vehicles', error: error.message });
  }
};

const createVehicle = async (req, res) => {
  try {
    const { carId, plateNumber, ownerId } = req.body;
    const newVehicle = await Vehicle.create({ carId, plateNumber, ownerId: ownerId || null });
    res.status(201).json(newVehicle);
  } catch (error) {
    res.status(500).json({ message: 'Error creating vehicle', error: error.message });
  }
};

const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findByPk(id);

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    await vehicle.destroy();
    res.status(200).json({ message: 'Vehicle deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting vehicle', error: error.message });
  }
};

// --- Association Management ---

const assignVehicleToStage = async (req, res) => {
  try {
    const { stageId, vehicleId } = req.body;
    const stage = await Stage.findByPk(stageId);
    const vehicle = await Vehicle.findByPk(vehicleId);

    if (!stage || !vehicle) {
      return res.status(404).json({ message: 'Stage or Vehicle not found' });
    }

    await stage.addVehicle(vehicle);
    res.status(200).json({ message: 'Vehicle assigned to stage successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error assigning vehicle', error: error.message });
  }
};

const removeVehicleFromStage = async (req, res) => {
  try {
    const { stageId, vehicleId } = req.params;
    const stage = await Stage.findByPk(stageId);
    const vehicle = await Vehicle.findByPk(vehicleId);
    if (!stage || !vehicle) return res.status(404).json({ message: 'Stage or Vehicle not found' });
    await stage.removeVehicle(vehicle);
    res.status(200).json({ message: 'Vehicle unassigned successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error unassigning vehicle', error: error.message });
  }
};

const getDashboardData = async (req, res) => {
  try {
    const vehicles = await Vehicle.findAll({ order: [['plateNumber', 'ASC']] });

    const vehicleDetails = await Promise.all(
      vehicles.map(async (vehicle) => {
        const locationData = await getVehicleLocation(vehicle.carId);

        let locationName = 'Offline';
        let latitude = null;
        let longitude = null;
        if (locationData && locationData.latitude && locationData.longitude) {
          locationName = await getLocationName(locationData);
          latitude = locationData.latitude;
          longitude = locationData.longitude;
        }

        return {
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          status: locationData ? locationData.gpsStatus : 'Offline',
          location: locationName,
          latitude,
          longitude,
          // Route is hardcoded for now as requested
          route: 'CBD - Westlands',
        };
      })
    );
    res.status(200).json({ vehicles: vehicleDetails });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard data', error: error.message });
  }
};

const getAllFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, attributes: ['name'] },
        { model: Vehicle, attributes: ['plateNumber'] }
      ]
    });
    res.status(200).json(feedback);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching feedback', error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { q = '', role = '' } = req.query;
    const whereClause = {
      id: { [Op.ne]: req.user.id }, // Exclude the current admin
    };

    if (q) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
      ];
    }

    if (role && ['Admin', 'MatAdmin', 'Passenger'].includes(role)) {
      whereClause.role = role;
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'email', 'role', 'twoFactorEnabled', 'disabled'], // 'disabled' is a virtual field
      order: [['name', 'ASC']],
    });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

const updateUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { disabled } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.update({ disabled: !!disabled });
    res.status(200).json({ message: `User has been ${disabled ? 'blocked' : 'unblocked'}.` });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

const deleteUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.destroy();
    res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

const getAllMatAdmins = async (req, res) => {
  try {
    const matAdmins = await User.findAll({
      where: { role: 'MatAdmin' },
      attributes: ['id', 'name'], // Only need id and name for the dropdown
      order: [['name', 'ASC']]
    });
    res.status(200).json(matAdmins);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching Matatu Admins', error: error.message });
  }
};

const createUserByAdmin = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!['Admin', 'MatAdmin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role specified.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name, email, password: hashedPassword, role,
    });
    delete user.dataValues.password;

    res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Error creating user", error: error.message });
  }
};

module.exports = { getAllStages, createStage, getAllVehicles, createVehicle, deleteVehicle, assignVehicleToStage, removeVehicleFromStage, getDashboardData, getAllMatAdmins, getAllFeedback, getAllUsers, updateUserByAdmin, deleteUserByAdmin, createUserByAdmin };