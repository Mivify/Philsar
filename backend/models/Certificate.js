const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// One row per certificate actually issued (on its first download). `code` is
// printed on the PDF next to a QR code that opens /verify/<code>, where anyone
// can check it. The name, seminar and date are copied in when it's issued, so
// the check shows what was printed even if the account or seminar changes
// later. Revoking sets revokedAt; granting again clears it, so the same code
// (and every copy already downloaded) is valid again.
const Certificate = sequelize.define('Certificate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: 'certificates_code_unique',
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    meetingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    recipientName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    meetingTitle: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    meetingHost: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Same text as Meeting.dateTime
    meetingDate: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    revokedByName: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, {
    timestamps: true,
    indexes: [
        { fields: ['userId', 'meetingId'] }
    ]
});

module.exports = Certificate;
