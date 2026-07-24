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
    },
    resetPasswordTokenHash: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Stored as epoch milliseconds (not DATETIME) to sidestep MySQL/Node timezone
    // round-trip mismatches — these two fields are only ever compared against
    // Date.now()/JWT iat in JS, never displayed, so a plain number is both
    // simpler and immune to timezone drift.
    resetPasswordExpires: {
        type: DataTypes.BIGINT,
        allowNull: true,
    },
    passwordChangedAt: {
        type: DataTypes.BIGINT,
        allowNull: true,
    }
}, {
    timestamps: true,
});

module.exports = User;
