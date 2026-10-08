const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// A seminar recording made in a host's browser ("⏺ Record" in the call). It is
// uploaded to Cloudflare R2 in parts while the seminar runs (an R2 multipart
// upload), so little is left to send when the recording stops. Attendees can
// watch it once the seminar has ended.
const MeetingRecording = sequelize.define('MeetingRecording', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    meetingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    startedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // 'recording' while parts are still arriving, 'ready' once saved
    status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'recording',
    },
    storageKey: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    mimeType: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    // R2's id for the multipart upload; cleared once the recording is saved
    uploadId: {
        type: DataTypes.STRING(1024),
        allowNull: true,
    },
    // Parts uploaded so far: [{ PartNumber, ETag, size }]. No database default
    // (MySQL doesn't allow one on JSON columns); always set when created.
    parts: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    sizeBytes: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
    },
    durationSec: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Saved from the parts that arrived after the host's browser stopped sending
    // (tab closed, crash, lost connection) instead of being stopped normally
    partial: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    endedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    timestamps: true,
    indexes: [
        { fields: ['meetingId'] },
        { fields: ['status'] }
    ]
});

module.exports = MeetingRecording;
