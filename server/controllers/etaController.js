const { getVehicleLocation } = require('../services/firebaseService');
const { getDirectionsInfo } = require('../services/googleMapsService');
const { Stage, Vehicle } = require('../models');

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
    const vehicleEtas = await Promise.all(stage.Vehicles.map(async (vehicle) => {
      const carId = vehicle.carId;
      const vehicleLocation = await getVehicleLocation(carId);

      if (!vehicleLocation || !vehicleLocation.latitude || !vehicleLocation.longitude) {
        console.log(`Location data not found or incomplete for ${carId}`);
        return { carId, plateNumber: carId, eta: 'N/A', status: 'Offline' };
      }

      const origin = { latitude: vehicleLocation.latitude, longitude: vehicleLocation.longitude };
      const destination = { latitude: stage.latitude, longitude: stage.longitude };

      const directions = await getDirectionsInfo(origin, destination);
      
      if (!directions || !directions.distance || !directions.duration) {
        console.log(`Could not calculate directions for ${carId}`);
        return { carId, plateNumber: vehicle.plateNumber, eta: 'N/A', status: 'Unknown' };
      }

      const duration = directions.duration_in_traffic || directions.duration;
      const distanceInMeters = directions.distance.value;
      const status = distanceInMeters < 50 ? 'Arrived' : 'Approaching';

      return {
        carId: carId,
        plateNumber: vehicle.plateNumber,
        eta: status === 'Arrived' ? 'Arrived' : duration.text,
        status: status
      };
    }));

    res.status(200).json({ stageName: stage.name, arrivals: vehicleEtas });
  } catch (error) {
    console.error('Error calculating ETAs:', error);
    res.status(500).json({ message: 'Failed to calculate ETAs' });
  }
};

module.exports = { getStageEta };