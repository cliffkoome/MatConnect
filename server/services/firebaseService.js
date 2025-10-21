const admin = require("firebase-admin");
const path = require("path");

// IMPORTANT: Make sure you have firebase-service-account.json in the /server/config directory
const serviceAccount = require("../config/firebase-service-account.json");

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://matatu-eta-default-rtdb.europe-west1.firebasedatabase.app/"
  });
  console.log("✅ Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error("❌ Error initializing Firebase Admin SDK:", error);
}

const db = admin.database();
const locationsRef = db.ref('locations');

/**
 * Fetches the real-time location data for a specific vehicle.
 * @param {string} carId - The ID of the car (e.g., "CAR_001").
 * @returns {Promise<object|null>} A promise that resolves to the vehicle's location data or null if not found.
 */
const getVehicleLocation = async (carId) => {
  const snapshot = await locationsRef.child(carId).once('value');
  return snapshot.val();
};

module.exports = { getVehicleLocation };