const { Stage, User, Vehicle, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Fetches all stages from the database.
 */
const getAllStages = async (req, res) => {
  try {
    const stages = await Stage.findAll({
      order: [['name', 'ASC']]
    });
    res.status(200).json(stages);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stages', error: error.message });
  }
};

/**
 * Finds all stages that have vehicles routing to a specific destination.
 */
const findStagesByDestination = async (req, res) => {
  try {
    const { destinationId } = req.query;

    if (!destinationId) {
      return res.status(400).json({ message: 'Destination ID is required.' });
    }

    // Find all vehicles that have the destinationId in their route.
    const vehiclesOnRoute = await Vehicle.findAll({
      attributes: ['id'],
      include: [{
        model: Stage,
        as: 'RouteStages',
        where: { id: destinationId },
        attributes: [], // We don't need stage attributes here
        through: { attributes: [] }
      }]
    });

    const vehicleIds = vehiclesOnRoute.map(v => v.id);

    // Find all unique stages served by these vehicles, excluding the destination itself.
    const originStages = await Stage.findAll({
      include: [{ model: Vehicle, where: { id: { [Op.in]: vehicleIds } }, attributes: [], through: { attributes: [] } }],
      where: { id: { [Op.ne]: destinationId } }
    });

    res.status(200).json(originStages);
  } catch (error) { res.status(500).json({ message: 'Error finding stages by destination', error: error.message }); }
};

const getSubscriptionStatus = async (req, res) => {
  try {
    const stageId = req.params.stageId;
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isSubscribed = await user.hasAlertSubscription(stageId);
    res.status(200).json({ isSubscribed });
  } catch (error) {
    res.status(500).json({ message: 'Error checking subscription status', error: error.message });
  }
};

const subscribeToStage = async (req, res) => {
  try {
    const stageId = req.params.stageId;
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.phoneNumber) {
      return res.status(400).json({ message: 'Please add a phone number to your profile to subscribe for alerts.' });
    }

    const stage = await Stage.findByPk(stageId);
    if (!stage) return res.status(404).json({ message: 'Stage not found' });

    await user.addAlertSubscription(stage);

    res.status(200).json({ message: `Successfully subscribed to alerts for ${stage.name}.` });
  } catch (error) {
    res.status(500).json({ message: 'Error subscribing to stage', error: error.message });
  }
};

const unsubscribeFromStage = async (req, res) => {
  try {
    const stageId = req.params.stageId;
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const stage = await Stage.findByPk(stageId);
    if (!stage) return res.status(404).json({ message: 'Stage not found' });

    await user.removeAlertSubscription(stage);

    res.status(200).json({ message: `Successfully unsubscribed from alerts for ${stage.name}.` });
  } catch (error) {
    res.status(500).json({ message: 'Error unsubscribing from stage', error: error.message });
  }
};


module.exports = { getAllStages, findStagesByDestination, getSubscriptionStatus, subscribeToStage, unsubscribeFromStage };