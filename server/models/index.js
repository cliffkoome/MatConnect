const sequelize = require("../config/database");
const User = require('./User');


const syncDB = async () => {
  try {
    await sequelize.sync({ alter: true }); // Sync with DB
    console.log("✅ Database synchronized");
  } catch (error) {
    console.error("❌ Database sync failed:", error);
  }
};


module.exports = { syncDB, User };