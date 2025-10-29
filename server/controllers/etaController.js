const { calculateEtasForStage } = require('../services/etaCalculationService');
const { Stage, Vehicle } = require('../models');

const getStageEta = async (req, res) => {
  const { stageId } = req.params;
  
  // Find the stage by its primary key and include its associated vehicles
  const stage = await Stage.findByPk(stageId, {
    include: {
      model: Vehicle,
      through: { attributes: [] } // Don't include the join table attributes
    }
  });

  if (!stage) {
    return res.status(404).json({ message: 'Stage not found' });
  }
  try {
    const vehicleEtas = await calculateEtasForStage(stage);

    res.status(200).json({ stageName: stage.name, arrivals: vehicleEtas });
  } catch (error) {
    console.error('Error calculating ETAs:', error);
    res.status(500).json({ message: 'Failed to calculate ETAs' });
  }
};

module.exports = { getStageEta };