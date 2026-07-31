const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Module = sequelize.define('Module', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    imageUrl: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    topic: {
        type: DataTypes.ENUM(
            'Anatomy & Physiology',
            'Breeds & Breeding',
            'Estrus Cycle & Detection',
            'Reproductive Biotechnology',
            'Gestation & Pregnancy',
            'Reproductive Health'
        ),
        allowNull: true,
    }
}, {
    timestamps: true,
});

module.exports = Module;
