const { Stage, Vehicle } = require('../models');
const { calculateEtasForStage } = require('../services/etaCalculationService');
const { getVehicleLocation } = require('../services/firebaseService');

const getStageEta = async (req, res) => {
  const { stageId } = req.params;
  
  // Find the stage by its primary key and include its associated vehicles
  const stage = await Stage.findByPk(stageId, {
    include: {
      model: Vehicle,
      through: { attributes: [] } // Don't include the join table attributes
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

module.exports = { getStageEta };