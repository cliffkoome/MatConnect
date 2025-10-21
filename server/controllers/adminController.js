const { Stage, Vehicle } = require('../models');
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
    const { carId, plateNumber } = req.body;
    const newVehicle = await Vehicle.create({ carId, plateNumber });
    res.status(201).json(newVehicle);
  } catch (error) {
    res.status(500).json({ message: 'Error creating vehicle', error: error.message });
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

module.exports = { getAllStages, createStage, getAllVehicles, createVehicle, assignVehicleToStage, removeVehicleFromStage, getDashboardData };