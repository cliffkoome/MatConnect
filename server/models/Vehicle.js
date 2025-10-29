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
  },
  plateNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  indexes: [
    // Create a unique index on carId
    { unique: true, fields: ['carId'] },
    // Create a unique index on plateNumber
    { unique: true, fields: ['plateNumber'] }
  ]
})

// Note: The above is the standard way to define indexes. If you still face issues,
// you could try a composite unique index on both fields if that fits your logic:
// { unique: true, fields: ['carId', 'plateNumber'] }

module.exports = Vehicle;