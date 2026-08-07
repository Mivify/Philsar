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
    },
    // Controls hero-carousel order. Existing rows default to 0 and tie-break on
    // createdAt (see getLandingImages), so this only starts differentiating order
    // once an admin actually reorders something via the reorder endpoint.
    position: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    }
}, {
    timestamps: true,
});

module.exports = LandingImage;
