const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const LessonProgress = sequelize.define('LessonProgress', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    moduleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    lessonIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['userId', 'moduleId', 'lessonIndex']
        }
    ]
});

module.exports = LessonProgress;
