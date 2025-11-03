const { Vehicle, DailyDistance, DailyTrip, Feedback, User } = require('../models');
const { Op, fn, col } = require('sequelize');
const sequelize = require('../config/database');
const { getVehicleLocation } = require('../services/firebaseService');
const { getLocationName } = require('../services/googleMapsService');

const createVehicle = async (req, res) => {
  try {
    const { carId, plateNumber } = req.body;
    const ownerId = req.user.id; // Vehicle is owned by the logged-in MatAdmin

    const newVehicle = await Vehicle.create({ carId, plateNumber, ownerId });
    res.status(201).json(newVehicle);
  } catch (error) {
    res.status(500).json({ message: 'Error creating vehicle', error: error.message });
  }
};

const getDashboardData = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const vehicles = await Vehicle.findAll({
      where: { ownerId },
      order: [['plateNumber', 'ASC']]
    });

    const vehicleDetails = await Promise.all(
      vehicles.map(async (vehicle) => {
        const locationData = await getVehicleLocation(vehicle.carId);

        let locationName = 'Offline';
        let latitude = null;
        let longitude = null;
        if (locationData && locationData.latitude && locationData.longitude) {
          locationName = await getLocationName(locationData);
          latitude = locationData.latitude;
          longitude = locationData.longitude;
        }

        return {
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          status: locationData ? 'Online' : 'Offline',
          location: locationName,
          latitude,
          longitude,
        };
      })
    );
    res.status(200).json({ vehicles: vehicleDetails });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard data', error: error.message });
  }
};

const getDashboardSummary = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const ownedVehicles = await Vehicle.findAll({ where: { ownerId } });
    const vehicleIds = ownedVehicles.map(v => v.id);

    const totalVehicles = ownedVehicles.length;

    const totalDistanceResult = await DailyDistance.sum('distanceCovered', {
      where: { vehicleId: { [Op.in]: vehicleIds }, date: today }
    });

    const totalTripsResult = await DailyTrip.sum('tripCount', {
      where: { vehicleId: { [Op.in]: vehicleIds }, date: today }
    });

    res.status(200).json({
      totalVehicles,
      totalDistanceToday: totalDistanceResult || 0,
      totalTripsToday: totalTripsResult || 0,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard summary', error: error.message });
  }
};

const getVehicleStats = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const vehicles = await Vehicle.findAll({
      where: { ownerId },
      include: [
        {
          model: DailyDistance,
          where: { date: today },
          required: false // Use LEFT JOIN
        },
        {
          model: DailyTrip,
          where: { date: today },
          required: false
        },
        {
          model: Feedback,
          include: [{ model: User, attributes: ['name'] }],
          limit: 5, // Get latest 5 feedback entries
          order: [['createdAt', 'DESC']]
        }
      ],
      order: [['plateNumber', 'ASC']]
    });

    res.status(200).json(vehicles);

  } catch (error) {
    console.error("Error fetching vehicle stats:", error);
    res.status(500).json({ message: 'Error fetching vehicle stats', error: error.message });
  }
};

const getVehicleChartData = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { period = 'daily' } = req.query; // 'daily', 'weekly', 'monthly'
    const ownerId = req.user.id;

    // Security check: Ensure the vehicle belongs to the logged-in MatAdmin
    const vehicle = await Vehicle.findOne({ where: { id: vehicleId, ownerId } });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found or you do not have permission to view it.' });
    }

    let distanceData, tripData;
    const today = new Date();

    switch (period) {
      case 'weekly':
        const fourWeeksAgo = new Date(new Date().setDate(today.getDate() - 28));
        distanceData = await DailyDistance.findAll({
          where: { vehicleId, date: { [Op.gte]: fourWeeksAgo } },
          attributes: [[fn('YEARWEEK', col('date')), 'period'], [fn('SUM', col('distanceCovered')), 'total']],
          group: ['period'], order: [[col('period'), 'ASC']]
        });
        tripData = await DailyTrip.findAll({
          where: { vehicleId, date: { [Op.gte]: fourWeeksAgo } },
          attributes: [[fn('YEARWEEK', col('date')), 'period'], [fn('SUM', col('tripCount')), 'total']],
          group: ['period'], order: [[col('period'), 'ASC']]
        });
        break;

      case 'monthly':
        const twelveMonthsAgo = new Date(new Date().setMonth(today.getMonth() - 12));
        distanceData = await DailyDistance.findAll({
          where: { vehicleId, date: { [Op.gte]: twelveMonthsAgo } },
          attributes: [[fn('DATE_FORMAT', col('date'), '%Y-%m'), 'period'], [fn('SUM', col('distanceCovered')), 'total']],
          group: ['period'], order: [[col('period'), 'ASC']]
        });
        tripData = await DailyTrip.findAll({
          where: { vehicleId, date: { [Op.gte]: twelveMonthsAgo } },
          attributes: [[fn('DATE_FORMAT', col('date'), '%Y-%m'), 'period'], [fn('SUM', col('tripCount')), 'total']],
          group: ['period'], order: [[col('period'), 'ASC']]
        });
        break;

      case 'daily':
      default:
        const sevenDaysAgo = new Date(new Date().setDate(today.getDate() - 7));
        distanceData = await DailyDistance.findAll({
          where: { vehicleId, date: { [Op.gte]: sevenDaysAgo } },
          attributes: [['date', 'period'], ['distanceCovered', 'total']],
          order: [['date', 'ASC']]
        });
        tripData = await DailyTrip.findAll({
          where: { vehicleId, date: { [Op.gte]: sevenDaysAgo } },
          attributes: [['date', 'period'], ['tripCount', 'total']],
          order: [['date', 'ASC']]
        });
        break;
    }

    // Convert raw data to a format Chart.js can easily use
    const formatData = (data, isDistance = false) => {
      return data.map(d => ({
        period: d.get('period'),
        total: isDistance ? parseFloat((d.get('total') / 1000).toFixed(2)) : parseInt(d.get('total'), 10)
      }));
    };

    res.status(200).json({
      distance: formatData(distanceData, true),
      trips: formatData(tripData, false),
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ message: 'Error fetching chart data', error: error.message });
  }
};

const getFleetAggregateData = async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const ownerId = req.user.id;

    const ownedVehicles = await Vehicle.findAll({ where: { ownerId }, attributes: ['id'] });
    const vehicleIds = ownedVehicles.map(v => v.id);

    if (vehicleIds.length === 0) {
      return res.status(200).json({ distance: [], trips: [] });
    }

    let distanceData, tripData;
    const today = new Date();
    const whereClause = { vehicleId: { [Op.in]: vehicleIds } };

    switch (period) {
      case 'weekly':
        whereClause.date = { [Op.gte]: new Date(new Date().setDate(today.getDate() - 28)) };
        distanceData = await DailyDistance.findAll({ where: whereClause, attributes: [[fn('YEARWEEK', col('date')), 'period'], [fn('SUM', col('distanceCovered')), 'total']], group: ['period'], order: [[col('period'), 'ASC']] });
        tripData = await DailyTrip.findAll({ where: whereClause, attributes: [[fn('YEARWEEK', col('date')), 'period'], [fn('SUM', col('tripCount')), 'total']], group: ['period'], order: [[col('period'), 'ASC']] });
        break;

      case 'monthly':
        whereClause.date = { [Op.gte]: new Date(new Date().setMonth(today.getMonth() - 12)) };
        distanceData = await DailyDistance.findAll({ where: whereClause, attributes: [[fn('DATE_FORMAT', col('date'), '%Y-%m'), 'period'], [fn('SUM', col('distanceCovered')), 'total']], group: ['period'], order: [[col('period'), 'ASC']] });
        tripData = await DailyTrip.findAll({ where: whereClause, attributes: [[fn('DATE_FORMAT', col('date'), '%Y-%m'), 'period'], [fn('SUM', col('tripCount')), 'total']], group: ['period'], order: [[col('period'), 'ASC']] });
        break;

      case 'daily':
      default:
        whereClause.date = { [Op.gte]: new Date(new Date().setDate(today.getDate() - 7)) };
        distanceData = await DailyDistance.findAll({ where: whereClause, attributes: [['date', 'period'], [fn('SUM', col('distanceCovered')), 'total']], group: ['date'], order: [['date', 'ASC']] });
        tripData = await DailyTrip.findAll({ where: whereClause, attributes: [['date', 'period'], [fn('SUM', col('tripCount')), 'total']], group: ['date'], order: [['date', 'ASC']] });
        break;
    }

    const formatData = (data, isDistance = false) => {
      return data.map(d => ({
        period: d.get('period'),
        total: isDistance ? parseFloat((d.get('total') / 1000).toFixed(2)) : parseInt(d.get('total') || 0, 10)
      }));
    };

    const formattedDistance = formatData(distanceData, true);
    const formattedTrips = formatData(tripData);

    // Combine the data into a single structure for easier CSV generation
    const combinedData = {};
    formattedDistance.forEach(d => {
      if (!combinedData[d.period]) combinedData[d.period] = {};
      combinedData[d.period].distance = d.total;
    });
    formattedTrips.forEach(t => {
      if (!combinedData[t.period]) combinedData[t.period] = {};
      combinedData[t.period].trips = t.total;
    });

    res.status(200).json(combinedData);
  } catch (error) {
    console.error('Error fetching fleet aggregate data:', error);
    res.status(500).json({ message: 'Error fetching fleet aggregate data', error: error.message });
  }
};

const getMyVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.findAll({ where: { ownerId: req.user.id }, order: [['plateNumber', 'ASC']] });
    res.status(200).json(vehicles);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching vehicles', error: error.message });
  }
};

module.exports = { createVehicle, getDashboardData, getMyVehicles, getDashboardSummary, getVehicleStats, getVehicleChartData, getFleetAggregateData };