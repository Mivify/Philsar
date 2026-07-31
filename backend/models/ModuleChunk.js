const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// One row per lesson (split on '## ' in the parent Module's content, the
// same boundary the frontend uses to build the lesson list), with a
// precomputed embedding for RAG retrieval in the chatbot. No FK cascade is
// configured, so callers (moduleController) must clean these up explicitly
// when a Module's content changes or it's deleted.
const ModuleChunk = sequelize.define('ModuleChunk', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    moduleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    lessonTitle: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    embedding: {
        type: DataTypes.JSON,
        allowNull: false,
    }
}, {
    timestamps: true,
    indexes: [
        { fields: ['moduleId'] }
    ]
});

module.exports = ModuleChunk;
