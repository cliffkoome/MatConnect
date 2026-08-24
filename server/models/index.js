const sequelize = require("../config/database");
const User = require("./User");
const Stage = require("./Stage");
const Vehicle = require("./Vehicle");
const DailyDistance = require("./DailyDistance");
const DailyTrip = require("./DailyTrip");
const Feedback = require("./Feedback");

// A Stage can have many vehicles, and a Vehicle can belong to many stages (in different routes)
// This creates a join table `StageVehicles`
Stage.belongsToMany(Vehicle, { through: "StageVehicles" });
Vehicle.belongsToMany(Stage, { through: "StageVehicles" });

// A User can subscribe to many stages for alerts, and a Stage can have many subscribers.
// This creates a join table `UserStageSubscriptions`
User.belongsToMany(Stage, {
  through: "UserStageSubscriptions",
  as: "AlertSubscriptions",
});
Stage.belongsToMany(User, {
  through: "UserStageSubscriptions",
  as: "Subscribers",
});

// A User (MatAdmin) can own many Vehicles.
User.hasMany(Vehicle, {
  foreignKey: "ownerId",
  as: "OwnedVehicles",
  onDelete: "SET NULL",
});
Vehicle.belongsTo(User, { foreignKey: "ownerId", as: "Owner" });

// A Vehicle can have many DailyDistance records.
Vehicle.hasMany(DailyDistance, {
  foreignKey: "vehicleId",
  onDelete: "CASCADE",
});
DailyDistance.belongsTo(Vehicle, { foreignKey: "vehicleId" });

// A Vehicle can have many DailyTrip records.
Vehicle.hasMany(DailyTrip, { foreignKey: "vehicleId", onDelete: "CASCADE" });
DailyTrip.belongsTo(Vehicle, { foreignKey: "vehicleId" });

// A Vehicle can have many Feedback entries. A User can give many Feedbacks.
Vehicle.hasMany(Feedback, { foreignKey: "vehicleId", onDelete: "CASCADE" });
Feedback.belongsTo(Vehicle, { foreignKey: "vehicleId" });
User.hasMany(Feedback, { foreignKey: "userId", onDelete: "CASCADE" });
Feedback.belongsTo(User, { foreignKey: "userId" });

const syncDB = async () => {
  try {
    // In a production environment, you should use migrations instead of `sync`.
    // `sync({ alter: true })` is dangerous and can lead to data loss.
    // For development, `sync()` is acceptable. For production, this should be disabled
    // and a migration tool like Sequelize-CLI or Umzug should be used instead.
    if (process.env.NODE_ENV !== "production") {
      await sequelize.sync();
      console.log(
        "✅ Database synchronized (Note: Use migrations for production).",
      );
    }
  } catch (error) {
    console.error("❌ Error synchronizing the database:", error);
    // Re-throw the error to be caught by the server startup logic.
    throw error;
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
