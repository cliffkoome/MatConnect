const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DailyDistance = sequelize.define(
  "DailyDistance",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    vehicleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Vehicles",
        key: "id",
      },
    },
    date: {
      type: DataTypes.DATEONLY, // Stores date as 'YYYY-MM-DD'
      allowNull: false,
    },
    distanceCovered: {
      type: DataTypes.FLOAT, // Distance in meters
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["vehicleId", "date"],
      },
      { fields: ["vehicleId"] },
    ],
  },
);

module.exports = DailyDistance;
