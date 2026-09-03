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
    // Sub Admin: everything under Learning Modules and the Meetings/seminars
    // control panel, but never Users or Settings — only Admin (System Admin)
    // has that. Secretary: identical to a normal self-serve role everywhere
    // except one added power, editing meeting minutes — see requireMinutesAccess
    // in middleware/auth.js. Neither is self-registerable (see SELF_SERVE_ROLES
    // in authController.js), same as Admin already wasn't.
    role: {
        type: DataTypes.ENUM('Livestock Manager', 'Farmer', 'Veterinarian', 'Extension Worker', 'Admin', 'Sub Admin', 'Secretary'),
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
    // Defaults to true (not false) so this migrates safely onto an existing
    // table: every pre-existing row picks up `true` when the column is added,
    // and admin-created accounts (which never go through the self-serve
    // verification flow) also get `true` implicitly. Only self-serve
    // registration explicitly sets this to false at creation time.
    emailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    emailVerificationTokenHash: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    emailVerificationExpires: {
        type: DataTypes.BIGINT,
        allowNull: true,
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
