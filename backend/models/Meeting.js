const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Meeting = sequelize.define('Meeting', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    host: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    dateTime: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('Live', 'Upcoming', 'Ended'),
        defaultValue: 'Upcoming',
    },
    registrants: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    videoLink: {
        type: DataTypes.STRING,
        defaultValue: 'https://meet.jit.si/philsar-session',
    },
    minutes: {
        type: DataTypes.TEXT,
        defaultValue: '',
    },
    recordingUrl: {
        type: DataTypes.STRING,
        defaultValue: '',
    }
}, {
    timestamps: true,
});

module.exports = Meeting;
