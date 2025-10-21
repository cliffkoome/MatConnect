const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Stage = sequelize.define(
  "Stage",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    latitude: { type: DataTypes.DOUBLE, allowNull: false },
    longitude: { type: DataTypes.DOUBLE, allowNull: false },
  }
);

module.exports = Stage;