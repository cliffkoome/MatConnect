const { Feedback, Vehicle } = require("../models");
const { validationResult } = require("express-validator");

/**
 * Allows a passenger to submit feedback for a specific vehicle.
 */
const submitFeedback = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { vehicleId, rating, comment } = req.body;
    const userId = req.user.id;

    // Check if vehicle exists
    const vehicle = await Vehicle.findByPk(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found." });
    }

    await Feedback.create({
      vehicleId,
      userId,
      rating,
      comment,
    });

    res.status(201).json({ message: "Thank you for your feedback!" });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetches all vehicles so passengers can select one for feedback.
 */
const getAllVehiclesForFeedback = async (req, res, next) => {
  try {
    const vehicles = await Vehicle.findAll({
      attributes: ["id", "plateNumber"],
      order: [["plateNumber", "ASC"]],
    });
    res.status(200).json(vehicles);
  } catch (error) {
    next(error);
  }
};

module.exports = { submitFeedback, getAllVehiclesForFeedback };
