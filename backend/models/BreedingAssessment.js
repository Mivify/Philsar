const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const BreedingAssessment = sequelize.define('BreedingAssessment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    cattleId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Stored in years, but FLOAT rather than INTEGER: a first-breeding heifer
    // is assessed in months (15 months = 1.25 years), which a whole-year
    // column would silently truncate to 1.
    age: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    bcs: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    daysSinceCalving: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    estrusIndicators: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    history: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    healthStatus: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    isReady: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
    },
    recommendation: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    guidance: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    }
}, {
    timestamps: true,
});

module.exports = BreedingAssessment;
