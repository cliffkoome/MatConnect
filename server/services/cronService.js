const cron = require("node-cron");
const { sequelize, Stage, Vehicle, User } = require("../models");
const { calculateEtasForStage } = require("./etaCalculationService");
const { sendSms } = require("./smsService");
const {
  updateStageEtas,
  getAllVehicleLocations,
} = require("./firebaseService");
const { setLocations } = require("./locationCache");
const { updateVehicleDistance } = require("./distanceTrackingService");

let isCycleRunning = false;

const runEtaUpdateCycle = async () => {
  if (isCycleRunning) {
    console.log(
      "ETA update cycle is already running. Skipping this execution.",
    );
    return;
  }
  isCycleRunning = true;
  console.log("Running ETA update cycle...");
  try {
    // Outer try-catch for fetching stages
    const stages = await Stage.findAll({
      include: [
        // Eager load all necessary data at the start of the cycle
        { model: Vehicle, through: { attributes: [] }, required: false },
        { model: User, as: "Subscribers", attributes: ["id", "phoneNumber"] },
      ],
    });

    // --- 1. Read Phase: Get all vehicle data at once ---
    const allVehicles = await Vehicle.findAll();
    const allFirebaseLocations = await getAllVehicleLocations(); // Single call to Firebase
    const vehicleLocations = new Map();

    if (allFirebaseLocations) {
      for (const vehicle of allVehicles) {
        const location = allFirebaseLocations[vehicle.carId];
        if (location) {
          vehicleLocations.set(vehicle.id, location);
        }
      }
    }

    // Update the shared cache with the newly fetched locations
    setLocations(vehicleLocations);

    // This map will track the final calculated status for each vehicle across all stages.
    const vehicleFinalStatuses = new Map();

    // --- 2. Calculation Phase: Use the fetched data ---
    for (const stage of stages) {
      try {
        // Inner try-catch for processing each stage
        const vehicleEtas = await calculateEtasForStage(
          stage,
          vehicleLocations,
        );

        // Transform the array into an object with carId as the key for Firebase
        const etasForFirebase = vehicleEtas.reduce((acc, vehicle) => {
          acc[vehicle.carId] = {
            plateNumber: vehicle.plateNumber,
            eta: vehicle.eta,
            status: vehicle.status,
          };
          return acc;
        }, {});

        await updateStageEtas(stage.name, etasForFirebase);

        // Store the status of each vehicle for this stage.
        for (const vehicle of vehicleEtas) {
          // If the vehicle is 'Arrived' at this stage, its final status for the cycle is 'Arrived'.
          // Otherwise, only set the status if it hasn't already been marked as 'Arrived' by another stage.
          if (
            vehicle.status === "Arrived" ||
            !vehicleFinalStatuses.has(vehicle.id)
          ) {
            vehicleFinalStatuses.set(vehicle.id, vehicle.status);
          }
        }

        // --- SMS Alert Logic ---
        for (const vehicle of vehicleEtas) {
          const vehicleInstance = allVehicles.find((v) => v.id === vehicle.id);
          if (!vehicleInstance) continue;

          if (vehicle.status === "Arrived") {
            // --- New Trip Counting Logic ---
            // Use a transaction with row-level locking to prevent race conditions
            await sequelize.transaction(async (t) => {
              const freshVehicle = await Vehicle.findByPk(vehicle.id, {
                transaction: t, // Find within the transaction
              });

              if (freshVehicle && !freshVehicle.isAtStage) {
                const today = new Date().toISOString().slice(0, 10);
                // Use a raw query with ON DUPLICATE KEY UPDATE for an atomic increment.
                // This is more performant and less prone to deadlocks than findOrCreate/increment.
                await sequelize.query(
                  `INSERT INTO DailyTrips (vehicleId, date, tripCount, createdAt, updatedAt)
                   VALUES (:vehicleId, :date, 1, NOW(), NOW())
                   ON DUPLICATE KEY UPDATE tripCount = tripCount + 1, updatedAt = NOW()`,
                  {
                    replacements: { vehicleId: vehicle.id, date: today },
                    type: sequelize.QueryTypes.INSERT,
                    transaction: t,
                  },
                );

                await freshVehicle.update(
                  { isAtStage: true },
                  { transaction: t },
                );
                console.log(`Trip counted for ${vehicle.plateNumber}.`);
              }
            });

            // We iterate over a copy of the subscribers array because we are modifying the subscription
            // in the loop, which could cause issues with the iterator.
            const smsTasks = stage.Subscribers.map(async (subscriber) => {
              try {
                const isStillSubscribed = await subscriber.hasAlertSubscription(
                  stage.id,
                );
                if (subscriber.phoneNumber && isStillSubscribed) {
                  const message = `Matatu ${vehicle.plateNumber} has arrived at ${stage.name}.`;
                  console.log(
                    `Sending SMS to ${subscriber.phoneNumber}: "${message}"`,
                  );
                  const smsResponse = await sendSms(
                    subscriber.phoneNumber,
                    message,
                  );
                  // Only unsubscribe if the SMS was successfully sent (status code 101).
                  if (
                    smsResponse?.SMSMessageData?.Recipients?.[0]?.statusCode ===
                    101
                  ) {
                    await subscriber.removeAlertSubscription(stage);
                  } else {
                    console.warn(
                      `SMS to ${subscriber.phoneNumber} may have failed or was skipped. User will not be unsubscribed.`,
                    );
                  }
                }
              } catch (smsError) {
                // Log errors for individual SMS/DB failures without stopping the whole batch.
                console.error(
                  `Failed to process SMS for user ${subscriber.id}:`,
                  smsError,
                );
              }
            });
            // Process all SMS notifications concurrently for this arrival event.
            await Promise.allSettled(smsTasks);
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
      if (
        vehicle.isAtStage &&
        vehicleFinalStatuses.get(vehicle.id) !== "Arrived"
      ) {
        await vehicle.update({ isAtStage: false });
      }
    }
    // --- 3. Write Phase: Update distances and last known locations ---
    console.log("Updating vehicle distances and locations...");
    for (const vehicle of allVehicles) {
      const currentLocation = vehicleLocations.get(vehicle.id);
      if (currentLocation) {
        // This service now handles both distance calculation and conditionally updating the last known location.
        await updateVehicleDistance(vehicle, currentLocation);
      }
    }

    console.log("✅ ETA update cycle completed successfully.");
  } catch (error) {
    console.error("❌ Error during ETA update cycle:", error);
  } finally {
    isCycleRunning = false;
  }
};

const startEtaUpdateCycle = (intervalSeconds) => {
  // Schedule the task to run every `intervalSeconds`.
  // The cron job ensures that a new job won't start until the previous one has finished.
  cron.schedule(`*/${intervalSeconds} * * * * *`, runEtaUpdateCycle, {
    scheduled: true,
    timezone: "UTC",
  });
  console.log(
    `✅ ETA update cycle scheduled to run every ${intervalSeconds} seconds.`,
  );
};

module.exports = { startEtaUpdateCycle };
