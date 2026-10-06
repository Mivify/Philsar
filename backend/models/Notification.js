const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Notices shown under the bell in the top bar. `type` says what happened and
// `data` holds the details (role_changed: { from, to }); the frontend turns them
// into text in the user's language. No FK cascade is configured, so
// approveUserDeletion removes a deleted user's notifications itself.
const Notification = sequelize.define('Notification', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    data: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    }
}, {
    timestamps: true,
    indexes: [
        { fields: ['userId'] }
    ]
});

module.exports = Notification;
