const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "mariadb",
    logging: false,
  }
);

sequelize
  .authenticate()
  .then(() => console.log("✅ MariaDB connected successfully"))
  .catch((err) => console.error("❌ Database connection failed:", err));

module.exports = sequelize;