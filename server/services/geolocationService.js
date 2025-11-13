/**
 * Converts degrees to radians.
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Converts radians to degrees.
 * @param {number} radians
 * @returns {number}
 */
function toDegrees(radians) {
  return radians * 180 / Math.PI;
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
  const x = Math.cos(startLat) * Math.sin(destLat) -
            Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);
  
  let brng = Math.atan2(y, x);
  brng = toDegrees(brng);
  
  return (brng + 360) % 360; // Normalize to 0-360
}

module.exports = { calculateBearing };