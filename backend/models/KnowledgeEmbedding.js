const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Saved embeddings for the chatbot's knowledge files (backend/knowledge/), one
// row per "## " section, keyed by a hash of the section's text. A server start
// only asks Gemini to embed sections that are new or were edited; the rest are
// read from here (see utils/chatbotKnowledge.js).
const KnowledgeEmbedding = sequelize.define('KnowledgeEmbedding', {
    contentHash: {
        type: DataTypes.STRING(64),
        primaryKey: true,
    },
    // Which file and section it came from (for reading the table only)
    source: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    sectionTitle: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    embedding: {
        type: DataTypes.JSON,
        allowNull: false,
    }
}, {
    timestamps: true
});

module.exports = KnowledgeEmbedding;
