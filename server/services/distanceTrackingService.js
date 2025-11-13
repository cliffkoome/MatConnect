const { Vehicle, DailyDistance } = require('../models');
const { getVehicleLocation } = require('./firebaseService');
const { Op } = require('sequelize');

/**
 * Calculates the distance between two GPS coordinates in meters using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} The distance in meters.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Updates the daily distance for a single vehicle.
 * @param {object} vehicle - The Sequelize vehicle instance.
 * @param {object} currentLocation - The vehicle's current location { latitude, longitude }.
 */
async function updateVehicleDistance(vehicle, currentLocation) {
  const { latitude: lat2, longitude: lon2 } = currentLocation;
  const { lastLatitude: lat1, lastLongitude: lon1 } = vehicle;

  // If we have previous coordinates from the last cycle, calculate the distance moved
  if (lat1 && lon1) {
    const distanceMoved = haversineDistance(lat1, lon1, lat2, lon2);

    // If the vehicle has moved, add the distance to the daily total.
    // The threshold was removed to ensure all small movements are counted.
    if (distanceMoved > 0) {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // Find or create a daily distance record for this vehicle for today
      const [dailyDistance] = await DailyDistance.findOrCreate({
        where: {
          vehicleId: vehicle.id,
          date: today,
        },
        defaults: {
          vehicleId: vehicle.id,
          date: today,
          distanceCovered: 0,
        },
      });

      // Add the new distance to the existing total for the day
      await dailyDistance.increment('distanceCovered', { by: distanceMoved });
    }
  }
};

module.exports = { updateVehicleDistance };