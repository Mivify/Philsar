const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: false, // Set to console.log to see SQL queries
        // Many managed MySQL hosts (e.g. Railway) require/expect SSL; opt in via DB_SSL=true
        dialectOptions: process.env.DB_SSL === 'true'
            ? { ssl: { require: true, rejectUnauthorized: false } }
            : {},
    }
);

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('MySQL Database connection has been established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
};

module.exports = { sequelize, connectDB };
