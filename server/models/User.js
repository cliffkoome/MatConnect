const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    password: {
      type: DataTypes.STRING,
      allowNull: true // Allow null for Google-based signups
    },
    role: {
      type: DataTypes.ENUM("Passenger", "Admin", "MatAdmin"),
      allowNull: false,
    },
    googleId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profilePictureUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    twoFactorSecret: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    twoFactorEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    disabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    }
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["email"],
        name: "idx_users_email",
      },
      {
        unique: true,
        fields: ["googleId"],
        name: "idx_users_googleid",
      },
    ],
  }
);

module.exports = User;
