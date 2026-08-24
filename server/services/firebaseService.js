const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(
  __dirname,
  "../config/firebase-service-account.json",
);
let firebaseInitialized = false;

let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS_BASE64) {
  try {
    const decodedString = Buffer.from(
      process.env.FIREBASE_CREDENTIALS_BASE64,
      "base64",
    ).toString("utf-8");
    serviceAccount = JSON.parse(decodedString);
  } catch (e) {
    console.error("❌ Failed to parse FIREBASE_CREDENTIALS_BASE64:", e);
  }
} else if (fs.existsSync(serviceAccountPath)) {
  serviceAccount = require(serviceAccountPath);
}

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL:
        "https://matatu-eta-default-rtdb.europe-west1.firebasedatabase.app/",
    });
    console.log("✅ Firebase Admin SDK initialized successfully.");
    firebaseInitialized = true;
  } catch (error) {
    console.error("❌ Error initializing Firebase Admin SDK:", error);
  }
} else {
  console.warn(
    "⚠️  Firebase credentials not found. Checked FIREBASE_CREDENTIALS_BASE64 env var and 'server/config/firebase-service-account.json' file.",
  );
  console.warn(
    "Firebase-dependent features (live locations, ETAs) will be disabled.",
  );
}

const db = firebaseInitialized ? admin.database() : null;
const locationsRef = firebaseInitialized ? db.ref("locations") : null;
const etasRef = firebaseInitialized ? db.ref("etas") : null;

/**
 * Fetches the real-time location data for a specific vehicle.
 * @param {string} carId - The ID of the car (e.g., "CAR_001").
 * @returns {Promise<object|null>} A promise that resolves to the vehicle's location data or null if not found.
 */
const getVehicleLocation = async (carId) => {
  if (!firebaseInitialized) return null;
  const snapshot = await locationsRef.child(carId).once("value");
  return snapshot.val();
};

/**
 * Updates the ETA data for a specific stage in Firebase.
 * @param {string} stageId - The ID of the stage.
 * @param {object} etas - The ETA data object to be stored.
 * @returns {Promise<void>}
 */
const updateStageEtas = async (stageId, etas) => {
  if (!firebaseInitialized) return;
  await etasRef.child(stageId).set(etas);
};

/**
 * Fetches all vehicle locations from Firebase in a single operation.
 * @returns {Promise<object|null>} A promise that resolves to an object of all vehicle locations or null.
 */
const getAllVehicleLocations = async () => {
  if (!firebaseInitialized) return null;
  const snapshot = await locationsRef.once("value");
  return snapshot.val();
};

module.exports = {
  getVehicleLocation,
  updateStageEtas,
  getAllVehicleLocations,
};
