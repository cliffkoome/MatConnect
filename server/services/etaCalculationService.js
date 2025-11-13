const { getVehicleLocation } = require('./firebaseService');
const { getDirectionsInfo } = require('./googleMapsService');
const { calculateBearing } = require('./geolocationService');

/**
 * Calculates ETAs for all vehicles assigned to a specific stage.
 * @param {object} stage - A Sequelize Stage object.
 * @param {Map<number, object>} vehicleLocations - A map of vehicleId to its current location.
 * @returns {Promise<Array>} A promise that resolves to an array of vehicle ETA objects.
 */
const calculateEtasForStage = async (stage, vehicleLocations) => {
  if (!stage || !stage.Vehicles) {
    return [];
  }

  const vehicleEtas = await Promise.all(stage.Vehicles.map(async (vehicle) => {
    const carId = vehicle.carId;
    const currentVehicleLocation = vehicleLocations.get(vehicle.id);

    if (!currentVehicleLocation || !currentVehicleLocation.latitude || !currentVehicleLocation.longitude) {
      console.log(`Location data not found or incomplete for ${carId}`);
      return { id: vehicle.id, carId, plateNumber: vehicle.plateNumber, eta: 'N/A', status: 'Offline' };
    }

    const origin = { latitude: currentVehicleLocation.latitude, longitude: currentVehicleLocation.longitude };
    const destination = { latitude: stage.latitude, longitude: stage.longitude };

    const directions = await getDirectionsInfo(origin, destination);

    if (!directions || !directions.distance || !directions.duration) {
      console.log(`Could not calculate directions for ${carId}`);
      return { id: vehicle.id, carId, plateNumber: vehicle.plateNumber, eta: 'N/A', status: 'No Route' };
    }

    const duration = directions.duration_in_traffic || directions.duration;
    const distanceInMeters = directions.distance.value;
    let status = 'Approaching';

    if (distanceInMeters < 50) {
      status = 'Arrived';
    } else {
      // Direction check for vehicles that are not at the stage
      const previousLocation = vehicle.lastLatitude && vehicle.lastLongitude ? { latitude: vehicle.lastLatitude, longitude: vehicle.lastLongitude } : null;

      // Check if the vehicle has moved significantly to avoid noise from GPS drift
      const hasMoved = previousLocation && (previousLocation.latitude !== origin.latitude || previousLocation.longitude !== origin.longitude);

      if (previousLocation && hasMoved) {
        const vehicleBearing = calculateBearing(previousLocation, origin);
        const bearingToStage = calculateBearing(origin, destination);

        // Calculate the difference in angle. The result is between 0 and 180.
        let angleDiff = Math.abs(vehicleBearing - bearingToStage);
        if (angleDiff > 180) {
          angleDiff = 360 - angleDiff;
        }

        // If the angle is greater than 90 degrees, the vehicle is moving away from the stage.
        if (angleDiff > 90) {
          status = 'Departed';
        }
      }
    }

    return {
      id: vehicle.id,
      carId: carId,
      plateNumber: vehicle.plateNumber,
      // Only show ETA if the vehicle is actually approaching
      eta: status === 'Approaching' ? duration.text : (status === 'Arrived' ? 'Arrived' : 'N/A'),
      status: status
    };
  }));

  // Filter out vehicles that have departed so they don't show up on the passenger's screen for that stage
  return vehicleEtas.filter(v => v.status !== 'Departed');
};

module.exports = { calculateEtasForStage };