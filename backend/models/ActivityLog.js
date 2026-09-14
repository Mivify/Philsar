const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// A generic, append-only security/audit trail. `action` and `category` are
// plain strings rather than an ENUM deliberately — new event types get added
// here often as the app grows, and a STRING column never needs a migration
// for that, unlike ENUM. userName/userRole are snapshotted at write time so
// the log still reads correctly after a name change, role change, or even
// account deletion (userId can dangle — there's no foreign key).
const ActivityLog = sequelize.define('ActivityLog', {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    userName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    userRole: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    category: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    details: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: true,
    },
}, {
    timestamps: true,
    updatedAt: false,
});

module.exports = ActivityLog;
