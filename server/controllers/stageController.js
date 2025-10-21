const { Stage } = require('../models');

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

module.exports = { getAllStages };