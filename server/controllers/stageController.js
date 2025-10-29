const { Stage, User } = require('../models');

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


module.exports = { getAllStages, getSubscriptionStatus, subscribeToStage, unsubscribeFromStage };