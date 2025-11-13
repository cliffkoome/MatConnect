require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { syncDB, Stage, Vehicle, User, DailyTrip } = require("./models");
const app = express();
const passport = require('passport');

const isPkg = typeof process.pkg !== 'undefined';
const basePath = isPkg ? path.dirname(process.execPath) : __dirname;
app.use(express.static(path.join(basePath, '../public')));

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(passport.initialize());

// This should be after dotenv config and passport.initialize
require('./config/passport'); // Import the passport configuration

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/eta", require("./routes/etaRoutes"));
app.use("/api/stages", require("./routes/stageRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/feedback", require("./routes/feedbackRoutes"));
app.use("/api/mat-admin", require("./routes/matAdminRoutes"));

// --- Background ETA Update Service ---
const { calculateEtasForStage } = require('./services/etaCalculationService');
const { sendSms } = require('./services/smsService');
const { updateStageEtas, getVehicleLocation } = require('./services/firebaseService');
const { updateVehicleDistance } = require('./services/distanceTrackingService');

const UPDATE_INTERVAL = 30000; // 30 seconds

const runEtaUpdateCycle = async () => {
  console.log('Running ETA update cycle...');
  try { // Outer try-catch for fetching stages
    const stages = await Stage.findAll({
      include: [
        // Eager load all necessary data at the start of the cycle
        { model: Vehicle, through: { attributes: [] }, required: false },
        { model: User, as: 'Subscribers', attributes: ['id', 'phoneNumber'] }
      ]
    });

    // --- 1. Read Phase: Get all vehicle data at once ---
    const allVehicles = await Vehicle.findAll();
    const vehicleLocations = new Map();
    await Promise.all(allVehicles.map(async (vehicle) => {
      const location = await getVehicleLocation(vehicle.carId);
      if (location) {
        vehicleLocations.set(vehicle.id, location);
      }
    }));

    // This map will track the final calculated status for each vehicle across all stages.
    const vehicleFinalStatuses = new Map();

    // --- 2. Calculation Phase: Use the fetched data ---
    for (const stage of stages) {
      try { // Inner try-catch for processing each stage
        const vehicleEtas = await calculateEtasForStage(stage, vehicleLocations);
        
        // Transform the array into an object with carId as the key for Firebase
        const etasForFirebase = vehicleEtas.reduce((acc, vehicle) => {
          acc[vehicle.carId] = {
            plateNumber: vehicle.plateNumber,
            eta: vehicle.eta,
            status: vehicle.status
          };
          return acc;
        }, {});

        await updateStageEtas(stage.name, etasForFirebase);

        // Store the status of each vehicle for this stage.
        for (const vehicle of vehicleEtas) {
          // If the vehicle is 'Arrived' at this stage, its final status for the cycle is 'Arrived'.
          // Otherwise, only set the status if it hasn't already been marked as 'Arrived' by another stage.
          if (vehicle.status === 'Arrived' || !vehicleFinalStatuses.has(vehicle.id)) {
            vehicleFinalStatuses.set(vehicle.id, vehicle.status);
          }
        }

        // --- SMS Alert Logic ---
        for (const vehicle of vehicleEtas) {
          const vehicleInstance = allVehicles.find(v => v.id === vehicle.id);
          if (!vehicleInstance) continue;

          if (vehicle.status === 'Arrived') {
            // --- New Trip Counting Logic ---
            // Only count a trip if the vehicle was NOT previously at the stage.
            if (!vehicleInstance.isAtStage) {
              const today = new Date().toISOString().slice(0, 10);
              const [dailyTrip] = await DailyTrip.findOrCreate({
                where: { vehicleId: vehicle.id, date: today },
                defaults: { vehicleId: vehicle.id, date: today, tripCount: 0 },
              });
              await dailyTrip.increment('tripCount', { by: 1 });

              // Set the flag to true so we don't count it again in the next cycle.
              await vehicleInstance.update({ isAtStage: true });
              console.log(`Trip counted for ${vehicle.plateNumber}.`);
            }

            // We iterate over a copy of the subscribers array because we are modifying the subscription
            // in the loop, which could cause issues with the iterator.
            const subscribersCopy = [...stage.Subscribers];
            for (const subscriber of subscribersCopy) {
              // Double-check subscription status right before sending
              const isStillSubscribed = await subscriber.hasAlertSubscription(stage.id);

              if (subscriber.phoneNumber && isStillSubscribed) {
                const message = `Matatu ${vehicle.plateNumber} has arrived at ${stage.name}.`;
                console.log(`Sending SMS to ${subscriber.phoneNumber}: "${message}"`);
                await sendSms(subscriber.phoneNumber, message);
                await subscriber.removeAlertSubscription(stage); // Unsubscribe immediately after sending
              }
            }
          }
        }
      } catch (stageError) {
        console.error(`❌ Error processing stage ${stage.name}:`, stageError);
      }
    }

    // --- 2.5. State Reset Phase ---
    // Now that all stages are processed, reset the isAtStage flag for any vehicle
    // that is no longer 'Arrived' at ANY of its assigned stages.
    for (const vehicle of allVehicles) {
      if (vehicle.isAtStage && vehicleFinalStatuses.get(vehicle.id) !== 'Arrived') {
        await vehicle.update({ isAtStage: false });
      }
    }
    // --- 3. Write Phase: Update distances and last known locations ---
    console.log('Updating vehicle distances and locations...');
    for (const vehicle of allVehicles) {
      const currentLocation = vehicleLocations.get(vehicle.id);
      if (currentLocation) {
        // Calculate distance using previous location from DB and current from Firebase
        await updateVehicleDistance(vehicle, currentLocation);
        // NOW, update the last known location for the *next* cycle
        await vehicle.update({
          lastLatitude: currentLocation.latitude,
          lastLongitude: currentLocation.longitude,
        });
      }
    }

    console.log('✅ ETA update cycle completed successfully.');
  } catch (error) {
    console.error('❌ Error during ETA update cycle:', error);
  }
};

// Sync DB & Start Server
syncDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log("Open front end at http://localhost:5000/");
    // Start the background job after the server starts
    setInterval(runEtaUpdateCycle, UPDATE_INTERVAL);
    runEtaUpdateCycle(); // Run once immediately on start
  });
});
