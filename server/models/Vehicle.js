const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Vehicle = sequelize.define("Vehicle", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  carId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  plateNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
});

module.exports = Vehicle;