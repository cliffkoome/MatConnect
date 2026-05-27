const {
  Vehicle,
  DailyDistance,
  DailyTrip,
  Feedback,
  Stage, // Import Stage model
  User,
} = require("../models");
const { Op, fn, col } = require("sequelize");
const { validationResult } = require("express-validator");
const sequelize = require("../config/database");
const { getVehicleLocation } = require("../services/firebaseService");
const { getLocations } = require("../services/locationCache");
const { getLocationName } = require("../services/googleMapsService");

const createVehicle = async (req, res, next) => {
  // ValidationResult check is done in matAdminRoutes.js
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { carId, plateNumber } = req.body;
    const ownerId = req.user.id; // Vehicle is owned by the logged-in MatAdmin

    const newVehicle = await Vehicle.create({ carId, plateNumber, ownerId });
    res.status(201).json(newVehicle);
  } catch (error) {
    next(error);
  }
};

const getDashboardData = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    // Fetch locations once before the loop to avoid N Redis/cache calls
    const allVehicleLocations = await getLocations();

    const vehicles = await Vehicle.findAll({
      where: { ownerId },
      order: [["plateNumber", "ASC"]],
      include: {
        attributes: ["name"],
        through: { attributes: [] },
      },
    });

    const vehicleDetails = await Promise.all(
      vehicles.map(async (vehicle) => {
        const locationData = allVehicleLocations.get(vehicle.id);

        let locationName = "Offline";
        let latitude = null;
        let longitude = null;
        if (locationData && locationData.latitude && locationData.longitude) {
          locationName = await getLocationName(locationData);
          latitude = locationData.latitude;
          longitude = locationData.longitude;
        }

        // Dynamically construct the route from associated stages
        let route = "Not Assigned";
        if (vehicle.Stages && vehicle.Stages.length > 0) {
          if (vehicle.Stages.length > 1) {
            route = `${vehicle.Stages[0].name} - ${vehicle.Stages[vehicle.Stages.length - 1].name}`;
          } else {
            route = vehicle.Stages[0].name;
          }
        }

        return {
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          status: locationData ? "Online" : "Offline",
          location: locationName,
          latitude,
          longitude,
          route: route,
        };
      }),
    );
    res.status(200).json({ vehicles: vehicleDetails });
  } catch (error) {
    next(error);
  }
};

const getDashboardSummary = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const ownedVehicles = await Vehicle.findAll({ where: { ownerId } });
    const vehicleIds = ownedVehicles.map((v) => v.id);

    const totalVehicles = ownedVehicles.length;

    const totalDistanceResult = await DailyDistance.sum("distanceCovered", {
      where: { vehicleId: { [Op.in]: vehicleIds }, date: today },
    });

    const totalTripsResult = await DailyTrip.sum("tripCount", {
      where: { vehicleId: { [Op.in]: vehicleIds }, date: today },
    });

    res.status(200).json({
      totalVehicles,
      totalDistanceToday: totalDistanceResult || 0,
      totalTripsToday: totalTripsResult || 0,
    });
  } catch (error) {
    next(error);
  }
};

// Helper to fetch latest feedback for a vehicle
const getLatestFeedbackForVehicle = async (vehicleId) => {
  try {
    const feedback = await Feedback.findAll({
      where: { vehicleId },
      include: [{ model: User, attributes: ["name"] }],
      limit: 5,
      order: [["createdAt", "DESC"]],
    });
    return feedback;
  } catch (error) {
    console.error(`Error fetching feedback for vehicle ${vehicleId}:`, error);
    return [];
  }
};

const getVehicleChartData = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const { period = "daily" } = req.query; // 'daily', 'weekly', 'monthly'
    const ownerId = req.user.id;

    // Security check: Ensure the vehicle belongs to the logged-in MatAdmin
    const vehicle = await Vehicle.findOne({
      where: { id: vehicleId, ownerId },
    });
    if (!vehicle) {
      return res.status(404).json({
        message: "Vehicle not found or you do not have permission to view it.",
      });
    }

    let distanceData, tripData;
    const today = new Date();
    // Helper to format date to YYYY-MM-DD to avoid timezone issues with DATEONLY fields
    const toYYYYMMDD = (date) => date.toISOString().slice(0, 10);

    switch (period) {
      case "weekly":
        const fourWeeksAgo = new Date(new Date().setDate(today.getDate() - 27)); // Go back 27 days to include today in the 4th week
        // Use toYYYYMMDD to ensure correct date comparison
        distanceData = await DailyDistance.findAll({
          where: { vehicleId, date: { [Op.gte]: fourWeeksAgo } },
          attributes: [
            [fn("YEARWEEK", col("date")), "period"],
            [fn("SUM", col("distanceCovered")), "total"],
          ],
          group: ["period"],
          order: [[col("period"), "ASC"]],
        });
        tripData = await DailyTrip.findAll({
          // Use toYYYYMMDD for tripData as well
          where: { vehicleId, date: { [Op.gte]: fourWeeksAgo } },
          attributes: [
            [fn("YEARWEEK", col("date")), "period"],
            [fn("SUM", col("tripCount")), "total"],
          ],
          group: ["period"],
          order: [[col("period"), "ASC"]],
        });
        break;

      case "monthly":
        const twelveMonthsAgo = new Date(
          new Date().setMonth(today.getMonth() - 11), // Go back 11 months to include the current month
        );
        distanceData = await DailyDistance.findAll({
          // Use toYYYYMMDD to ensure correct date comparison
          where: { vehicleId, date: { [Op.gte]: toYYYYMMDD(twelveMonthsAgo) } },
          attributes: [
            [fn("DATE_FORMAT", col("date"), "%Y-%m"), "period"],
            [fn("SUM", col("distanceCovered")), "total"],
          ],
          group: ["period"],
          order: [[col("period"), "ASC"]],
        });
        tripData = await DailyTrip.findAll({
          // Use toYYYYMMDD for tripData as well
          where: { vehicleId, date: { [Op.gte]: twelveMonthsAgo } },
          attributes: [
            [fn("DATE_FORMAT", col("date"), "%Y-%m"), "period"],
            [fn("SUM", col("tripCount")), "total"],
          ],
          group: ["period"],
          order: [[col("period"), "ASC"]],
        });
        break;

      case "daily":
      default:
        const sevenDaysAgo = new Date(new Date().setDate(today.getDate() - 6)); // Go back 6 days to get 7 total days
        // Use toYYYYMMDD to ensure correct date comparison
        distanceData = await DailyDistance.findAll({
          where: { vehicleId, date: { [Op.gte]: sevenDaysAgo } },
          attributes: [
            ["date", "period"],
            ["distanceCovered", "total"],
          ],
          order: [["date", "ASC"]],
        });
        tripData = await DailyTrip.findAll({
          // Use toYYYYMMDD for tripData as well
          where: { vehicleId, date: { [Op.gte]: sevenDaysAgo } },
          attributes: [
            ["date", "period"],
            ["tripCount", "total"],
          ],
          order: [["date", "ASC"]],
        });
        break;
    }

    // Convert raw data to a format Chart.js can easily use
    const formatData = (data, isDistance = false) => {
      return data.map((d) => ({
        period: d.get("period"),
        total: isDistance
          ? parseFloat((d.get("total") / 1000).toFixed(2))
          : parseInt(d.get("total"), 10),
      }));
    };

    res.status(200).json({
      distance: formatData(distanceData, true),
      trips: formatData(tripData, false),
    });
  } catch (error) {
    next(error);
  }
};

const getFleetAggregateData = async (req, res, next) => {
  try {
    const { period = "daily" } = req.query;
    const ownerId = req.user.id;

    const ownedVehicles = await Vehicle.findAll({
      where: { ownerId },
      attributes: ["id"],
    });
    const vehicleIds = ownedVehicles.map((v) => v.id);

    if (vehicleIds.length === 0) {
      return res.status(200).json({ distance: [], trips: [] });
    }

    let distanceData, tripData;
    const today = new Date();
    const whereClause = { vehicleId: { [Op.in]: vehicleIds } };

    switch (period) {
      case "weekly":
        whereClause.date = {
          [Op.gte]: new Date(new Date().setDate(today.getDate() - 28)),
        };
        distanceData = await DailyDistance.findAll({
          where: whereClause,
          attributes: [
            [fn("YEARWEEK", col("date")), "period"],
            [fn("SUM", col("distanceCovered")), "total"],
          ],
          group: ["period"],
          order: [[col("period"), "ASC"]],
        });
        tripData = await DailyTrip.findAll({
          where: whereClause,
          attributes: [
            [fn("YEARWEEK", col("date")), "period"],
            [fn("SUM", col("tripCount")), "total"],
          ],
          group: ["period"],
          order: [[col("period"), "ASC"]],
        });
        break;

      case "monthly":
        const twelveMonthsAgo = new Date(
          new Date().setMonth(today.getMonth() - 11),
        );
        whereClause.date = { [Op.gte]: toYYYYMMDD(twelveMonthsAgo) };
        distanceData = await DailyDistance.findAll({
          where: whereClause,
          attributes: [
            [fn("DATE_FORMAT", col("date"), "%Y-%m"), "period"],
            [fn("SUM", col("distanceCovered")), "total"],
          ],
          group: ["period"],
          order: [[col("period"), "ASC"]],
        });
        tripData = await DailyTrip.findAll({
          where: whereClause,
          attributes: [
            [fn("DATE_FORMAT", col("date"), "%Y-%m"), "period"],
            [fn("SUM", col("tripCount")), "total"],
          ],
          group: ["period"],
          order: [[col("period"), "ASC"]],
        });
        break;

      case "daily":
      default: // Use toYYYYMMDD to ensure correct date comparison
        const sevenDaysAgo = new Date(new Date().setDate(today.getDate() - 6));
        whereClause.date = { [Op.gte]: toYYYYMMDD(sevenDaysAgo) };
        distanceData = await DailyDistance.findAll({
          where: whereClause,
          attributes: [
            ["date", "period"],
            [fn("SUM", col("distanceCovered")), "total"],
          ],
          group: ["date"],
          order: [["date", "ASC"]],
        });
        tripData = await DailyTrip.findAll({
          where: whereClause,
          attributes: [
            ["date", "period"],
            [fn("SUM", col("tripCount")), "total"],
          ],
          group: ["date"],
          order: [["date", "ASC"]],
        });
        break;
    }

    const formatData = (data, isDistance = false) => {
      return data.map((d) => ({
        period: d.get("period"),
        total: isDistance
          ? parseFloat((d.get("total") / 1000).toFixed(2))
          : parseInt(d.get("total") || 0, 10),
      }));
    };

    const formattedDistance = formatData(distanceData, true);
    const formattedTrips = formatData(tripData);

    // Combine the data into a single structure, ensuring all periods are covered
    const combinedData = {};
    const allPeriods = new Set([
      ...formattedDistance.map((d) => d.period),
      ...formattedTrips.map((t) => t.period),
    ]);

    allPeriods.forEach((period) => {
      const dist = formattedDistance.find((d) => d.period === period);
      const trip = formattedTrips.find((t) => t.period === period);
      combinedData[period] = {
        distance: dist ? dist.total : 0,
        trips: trip ? trip.total : 0,
      };
    });

    res.status(200).json(combinedData);
  } catch (error) {
    next(error);
  }
};

const getMyVehicles = async (req, res, next) => {
  try {
    const vehicles = await Vehicle.findAll({
      where: { ownerId: req.user.id },
      order: [["plateNumber", "ASC"]],
    });
    res.status(200).json(vehicles);
  } catch (error) {
    next(error);
  }
};

const getVehicleStats = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    // Fetch vehicles owned by the MatAdmin
    const vehicles = await Vehicle.findAll({ where: { ownerId } });

    // For each vehicle, fetch its stats and latest feedback separately
    const vehicleStats = await Promise.all(
      vehicles.map(async (vehicle) => {
        const dailyDistance = await DailyDistance.findOne({
          where: { vehicleId: vehicle.id, date: today },
        });
        const dailyTrip = await DailyTrip.findOne({
          where: { vehicleId: vehicle.id, date: today },
        });
        const latestFeedback = await Feedback.findAll({
          where: { vehicleId: vehicle.id },
          include: [{ model: User, attributes: ["name"] }],
          limit: 5,
          order: [["createdAt", "DESC"]],
        });

        return {
          ...vehicle.toJSON(), // Convert Sequelize instance to plain object
          DailyDistances: dailyDistance ? [dailyDistance.toJSON()] : [],
          DailyTrips: dailyTrip ? [dailyTrip.toJSON()] : [],
          Feedbacks: latestFeedback.map((f) => f.toJSON()),
        };
      }),
    );

    res.status(200).json(vehicleStats);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVehicle,
  getDashboardData,
  getMyVehicles,
  getDashboardSummary,
  getVehicleStats,
  getVehicleChartData,
  getFleetAggregateData,
};
