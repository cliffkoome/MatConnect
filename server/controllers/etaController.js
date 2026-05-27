const { Stage, Vehicle } = require("../models");
const { calculateEtasForStage } = require("../services/etaCalculationService");
const { getLocations } = require("../services/locationCache");

const getStageEta = async (req, res, next) => {
  const { stageId } = req.params;

  try {
    // Find the stage by its primary key and include its associated vehicles
    const stage = await Stage.findByPk(stageId, {
      include: {
        model: Vehicle,
        through: { attributes: [] }, // Don't include the join table attributes
      },
    });

    if (!stage) {
      return res.status(404).json({ message: "Stage not found" });
    }

    // Get all vehicle locations from the central cache
    const allVehicleLocations = await getLocations();

    const vehicleEtas = await calculateEtasForStage(stage, allVehicleLocations);
    res.status(200).json({ stageName: stage.name, arrivals: vehicleEtas });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStageEta };
