const { Vehicle, DailyDistance } = require("../models");
const { getVehicleLocation } = require("./firebaseService");
const { Op } = require("sequelize");
const { haversineDistance } = require("./geolocationService");

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

    // A threshold is crucial to prevent accumulation of false distance from GPS drift.
    // Only count movement if it's greater than a reasonable threshold (e.g., 10 meters).
    if (distanceMoved > 10) {
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
      await dailyDistance.increment("distanceCovered", { by: distanceMoved });

      // Update the last known location for the *next* cycle because significant movement was detected.
      await vehicle.update({
        lastLatitude: lat2,
        lastLongitude: lon2,
      });
    }
    // If distanceMoved <= 10, we do NOT update the last known location to prevent losing small increments.
  } else {
    // If there's no previous location, this is the first time we're seeing the vehicle.
    // Set the current one as the baseline for the next cycle.
    await vehicle.update({
      lastLatitude: lat2,
      lastLongitude: lon2,
    });
  }
}

module.exports = { updateVehicleDistance };
