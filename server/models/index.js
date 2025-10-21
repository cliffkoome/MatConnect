const sequelize = require("../config/database");
const User = require('./User');
const Stage = require('./Stage');
const Vehicle = require('./Vehicle');

// A Stage can have many vehicles, and a Vehicle can belong to many stages (in different routes)
// This creates a join table `StageVehicles`
Stage.belongsToMany(Vehicle, { through: 'StageVehicles' });
Vehicle.belongsToMany(Stage, { through: 'StageVehicles' });


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
};