const sequelize = require("../config/database");
const User = require('./User');
const Stage = require('./Stage');
const Vehicle = require('./Vehicle');
const DailyDistance = require('./DailyDistance');
const DailyTrip = require('./DailyTrip');
const Feedback = require('./Feedback');

// A Vehicle has an ordered route of Stages. This join table includes a sequence.
const VehicleRoute = sequelize.define('VehicleRoute', {
  sequence: {
    type: sequelize.Sequelize.INTEGER,
    allowNull: false,
  }
}, { timestamps: false });

Vehicle.belongsToMany(Stage, {
  through: VehicleRoute,
  as: 'RouteStages', // Use a clear alias
  foreignKey: 'vehicleId'
});
Stage.belongsToMany(Vehicle, { through: VehicleRoute, foreignKey: 'stageId' });

// A User can subscribe to many stages for alerts, and a Stage can have many subscribers.
// This creates a join table `UserStageSubscriptions`
User.belongsToMany(Stage, { through: 'UserStageSubscriptions', as: 'AlertSubscriptions' });
Stage.belongsToMany(User, { through: 'UserStageSubscriptions', as: 'Subscribers' });

// A User (MatAdmin) can own many Vehicles.
User.hasMany(Vehicle, { foreignKey: 'ownerId', as: 'OwnedVehicles' });
Vehicle.belongsTo(User, { foreignKey: 'ownerId', as: 'Owner' });

// A Vehicle can have many DailyDistance records.
Vehicle.hasMany(DailyDistance, { foreignKey: 'vehicleId' });
DailyDistance.belongsTo(Vehicle, { foreignKey: 'vehicleId' });

// A Vehicle can have many DailyTrip records.
Vehicle.hasMany(DailyTrip, { foreignKey: 'vehicleId' });
DailyTrip.belongsTo(Vehicle, { foreignKey: 'vehicleId' });

// A Vehicle can have many Feedback entries. A User can give many Feedbacks.
Vehicle.hasMany(Feedback, { foreignKey: 'vehicleId' });
Feedback.belongsTo(Vehicle, { foreignKey: 'vehicleId' });
User.hasMany(Feedback, { foreignKey: 'userId' });
Feedback.belongsTo(User, { foreignKey: 'userId' });


const syncDB = async () => {
  try {
    await sequelize.sync({ alter: true }); // Sync with DB
    console.log("✅ Database synchronized");
  } catch (error) {
    console.error("❌ Error synchronizing the database:", error);
  }
};

module.exports = {
  sequelize,
  syncDB,
  User,
  Stage,
  Vehicle,
  DailyDistance,
  DailyTrip,
  Feedback,
};