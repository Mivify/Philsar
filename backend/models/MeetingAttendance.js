const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MeetingAttendance = sequelize.define('MeetingAttendance', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    meetingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    secondsAttended: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    granted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    }
}, {
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['userId', 'meetingId']
        }
    ]
});

module.exports = MeetingAttendance;
