const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DailyTrip = sequelize.define(
  "DailyTrip",
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
    tripCount: {
      type: DataTypes.INTEGER,
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

module.exports = DailyTrip;
