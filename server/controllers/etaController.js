const { Stage, Vehicle, sequelize } = require('../models');
const { Op } = require('sequelize');
const { calculateEtasForStage } = require('../services/etaCalculationService');
const { getVehicleLocation } = require('../services/firebaseService');

const getStageEta = async (req, res) => {
  const { stageId } = req.params;
  
  // Find the stage by its primary key and include its associated vehicles
  const stage = await Stage.findByPk(stageId, {
    include: {
      model: Vehicle,
      as: 'Vehicles',
      through: {
        model: sequelize.models.VehicleRoute,
        attributes: []
      }
    }
  });

  if (!stage) {
    return res.status(404).json({ message: 'Stage not found' });
  }
  try {
    // --- Replicate the logic from server.js to build the vehicleLocations map ---
    const vehicleLocations = new Map();
    if (stage.Vehicles && stage.Vehicles.length > 0) {
      await Promise.all(stage.Vehicles.map(async (vehicle) => {
        const location = await getVehicleLocation(vehicle.carId);
        if (location) {
          vehicleLocations.set(vehicle.id, location);
        }
      }));
    }
    // --- End replication ---

    const vehicleEtas = await calculateEtasForStage(stage, vehicleLocations);
    res.status(200).json({ stageName: stage.name, arrivals: vehicleEtas });
  } catch (error) {
    console.error('Error calculating ETAs:', error);
    res.status(500).json({ message: 'Failed to calculate ETAs' });
  }
};

const getPossibleDestinations = async (req, res) => {
  try {
    const { stageId } = req.params;

    // Find all vehicles that are assigned to the current stage
    const vehiclesAtStage = await Vehicle.findAll({
      attributes: ['id'],
      include: [{
        model: Stage,
        as: 'RouteStages',
        where: { id: stageId },
        attributes: [],
        through: { attributes: [] }
      }]
    });

    if (vehiclesAtStage.length === 0) {
      return res.status(200).json([]);
    }

    const vehicleIds = vehiclesAtStage.map(v => v.id);

    // Find all unique stages that are part of these vehicles' routes,
    // excluding the current stage itself.
    const destinations = await Stage.findAll({
      include: [{
        model: Vehicle,
        where: { id: { [Op.in]: vehicleIds } },
        attributes: [],
        through: { attributes: [] }
      }],
      where: { id: { [Op.ne]: stageId } },
      order: [['name', 'ASC']]
    });
    res.status(200).json(destinations);
  } catch (error) { res.status(500).json({ message: 'Error fetching destinations', error: error.message }); }
};

module.exports = { getStageEta, getPossibleDestinations };