const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Admin-managed background photos that rotate through the Home page hero.
const LandingImage = sequelize.define('LandingImage', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    imageUrl: {
        type: DataTypes.STRING,
        allowNull: false,
    }
}, {
    timestamps: true,
});

module.exports = LandingImage;
