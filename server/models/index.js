const sequelize = require("../config/database");
const User = require('./User');

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
};