const { getVehicleLocation } = require('./firebaseService');
const { getDirectionsInfo } = require('./googleMapsService');

/**
 * Calculates ETAs for all vehicles assigned to a specific stage.
 * @param {object} stage - A Sequelize Stage object with its Vehicles included.
 * @returns {Promise<Array>} A promise that resolves to an array of vehicle ETA objects.
 */
const calculateEtasForStage = async (stage) => {
  if (!stage || !stage.Vehicles) {
    return [];
  }

  const vehicleEtas = await Promise.all(stage.Vehicles.map(async (vehicle) => {
    const carId = vehicle.carId;
    const vehicleLocation = await getVehicleLocation(carId);

    if (!vehicleLocation || !vehicleLocation.latitude || !vehicleLocation.longitude) {
      console.log(`Location data not found or incomplete for ${carId}`);
      return { id: vehicle.id, carId, plateNumber: vehicle.plateNumber, eta: 'N/A', status: 'Offline' };
    }

    const origin = { latitude: vehicleLocation.latitude, longitude: vehicleLocation.longitude };
    const destination = { latitude: stage.latitude, longitude: stage.longitude };

    const directions = await getDirectionsInfo(origin, destination);

    if (!directions || !directions.distance || !directions.duration) {
      console.log(`Could not calculate directions for ${carId}`);
      return { id: vehicle.id, carId, plateNumber: vehicle.plateNumber, eta: 'N/A', status: 'Unknown' };
    }

    const duration = directions.duration_in_traffic || directions.duration;
    const distanceInMeters = directions.distance.value;
    const status = distanceInMeters < 50 ? 'Arrived' : 'Approaching';

    return {
      id: vehicle.id,
      carId: carId,
      plateNumber: vehicle.plateNumber,
      eta: status === 'Arrived' ? 'Arrived' : duration.text,
      status: status
    };
  }));

  return vehicleEtas;
};

module.exports = { calculateEtasForStage };