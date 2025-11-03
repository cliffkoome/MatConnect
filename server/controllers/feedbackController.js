const { Feedback, Vehicle } = require('../models');

/**
 * Allows a passenger to submit feedback for a specific vehicle.
 */
const submitFeedback = async (req, res) => {
  try {
    const { vehicleId, rating, comment } = req.body;
    const userId = req.user.id;

    if (!vehicleId || !rating) {
      return res.status(400).json({ message: 'Vehicle and rating are required.' });
    }

    // Check if vehicle exists
    const vehicle = await Vehicle.findByPk(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found.' });
    }

    await Feedback.create({
      vehicleId,
      userId,
      rating,
      comment,
    });

    res.status(201).json({ message: 'Thank you for your feedback!' });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ message: 'Error submitting feedback', error: error.message });
  }
};

/**
 * Fetches all vehicles so passengers can select one for feedback.
 */
const getAllVehiclesForFeedback = async (req, res) => {
  try {
    const vehicles = await Vehicle.findAll({ attributes: ['id', 'plateNumber'], order: [['plateNumber', 'ASC']] });
    res.status(200).json(vehicles);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching vehicles', error: error.message });
  }
};

module.exports = { submitFeedback, getAllVehiclesForFeedback };
