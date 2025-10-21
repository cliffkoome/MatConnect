const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

/**
 * Calculates the estimated travel time and distance between an origin and a destination.
 * @param {object} origin - The starting location { latitude, longitude }.
 * @param {object} destination - The ending location { latitude, longitude }.
 * @returns {Promise<object|null>} A promise that resolves to the route leg object, or null on error.
 */
const getDirectionsInfo = async (origin, destination) => {
  if (!API_KEY) {
    console.error("❌ Google Maps API Key is missing.");
    return null;
  }

  const params = {
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    departure_time: 'now', // Add this to get traffic-aware ETAs
    key: API_KEY,
  };

  try {
    const response = await axios.get(DIRECTIONS_URL, { params });
    const route = response.data.routes[0];
    if (route && route.legs && route.legs[0]) {
      const leg = route.legs[0];
      return leg; // e.g., { distance: { text, value }, duration: { text, value }, ... }
    }
    return null;
  } catch (error) {
    console.error('❌ Error fetching directions from Google Maps:', error.response ? error.response.data : error.message);
    return null;
  }
};

/**
 * Converts coordinates into a human-readable address.
 * @param {object} location - The location to geocode { latitude, longitude }.
 * @returns {Promise<string|null>} A promise that resolves to a formatted address string or null on error.
 */
const getLocationName = async (location) => {
  if (!API_KEY) {
    console.error("❌ Google Maps API Key is missing.");
    return "Unknown Location";
  }

  const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
  const params = {
    latlng: `${location.latitude},${location.longitude}`,
    key: API_KEY,
    // Optional: Add location_type to filter results. ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE
    // Optional: Add result_type to filter. e.g., 'route' to prefer roads.
  };

  try {
    const response = await axios.get(GEOCODE_URL, { params });
    if (response.data.results && response.data.results.length > 0) {
      const results = response.data.results;

      // --- New Logic to find the best address ---
      // 1. Look for a specific street name ('route').
      const route = results.find(r => r.types.includes('route'));
      if (route) {
        return route.formatted_address;
      }

      // 2. If no street is found, fall back to the most specific result (the first one).
      // This handles cases where the vehicle is in a parking lot or an unnamed area.
      return results[0].formatted_address;
    }
    return "Location not found";
  } catch (error) {
    console.error('❌ Error fetching geocode data from Google Maps:', error.response ? error.response.data : error.message);
    return "Unknown Location";
  }
};

module.exports = { getDirectionsInfo, getLocationName };