const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: 'users_email_unique',
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    role: {
        type: DataTypes.ENUM('Livestock Manager', 'Farmer', 'Veterinarian', 'Extension Worker', 'Admin'),
        defaultValue: 'Farmer',
    },
    organization: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    profilePicture: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('Active', 'Inactive'),
        defaultValue: 'Active',
    },
    modulesCompleted: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    seminarsAttended: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    dssAssessmentsRun: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    }
}, {
    timestamps: true,
});

module.exports = User;
