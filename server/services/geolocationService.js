/**
 * Converts degrees to radians.
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 * @param {number} radians
 * @returns {number}
 */
function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Calculates the bearing (direction) from one GPS coordinate to another.
 * @param {{latitude: number, longitude: number}} start - The starting coordinate.
 * @param {{latitude: number, longitude: number}} end - The ending coordinate.
 * @returns {number} The bearing in degrees (0-360).
 */
function calculateBearing(start, end) {
  const startLat = toRadians(start.latitude);
  const startLng = toRadians(start.longitude);
  const destLat = toRadians(end.latitude);
  const destLng = toRadians(end.longitude);

  const y = Math.sin(destLng - startLng) * Math.cos(destLat);
  const x =
    Math.cos(startLat) * Math.sin(destLat) -
    Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);

  let brng = Math.atan2(y, x);
  brng = toDegrees(brng);

  return (brng + 360) % 360; // Normalize to 0-360
}

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
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

module.exports = { calculateBearing, haversineDistance };
