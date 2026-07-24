const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Admin-authored news/announcement cards shown on the Home page, each with
// an optional photo — modeled after the "Highlights" cards on the PCC site.
const Announcement = sequelize.define('Announcement', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    body: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    imageUrl: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, {
    timestamps: true,
});

module.exports = Announcement;
