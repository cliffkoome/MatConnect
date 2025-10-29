require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { syncDB, Stage, Vehicle, User } = require("./models");
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

// --- Background ETA Update Service ---
const { calculateEtasForStage } = require('./services/etaCalculationService');
const { sendSms } = require('./services/smsService');
const { updateStageEtas } = require('./services/firebaseService');

const UPDATE_INTERVAL = 30000; // 30 seconds

const runEtaUpdateCycle = async () => {
  console.log('Running ETA update cycle...');
  try {
    const stages = await Stage.findAll({
      include: [
        { model: Vehicle, through: { attributes: [] } },
        { model: User, as: 'Subscribers', attributes: ['id', 'phoneNumber'] }
      ]
    });

    for (const stage of stages) {
      const vehicleEtas = await calculateEtasForStage(stage);
      
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

      // --- SMS Alert Logic ---
      for (const vehicle of vehicleEtas) {
        if (vehicle.status === 'Arrived') {
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
