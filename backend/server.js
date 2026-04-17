const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { connectDB, sequelize } = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const moduleRoutes = require('./routes/moduleRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/modules', moduleRoutes);

app.get('/', (req, res) => {
    res.send('PHILSAR API is running.');
});

// Sync database and start server
const startServer = async () => {
    await connectDB();

    // Sync Sequelize models
    try {
        await sequelize.sync({ alter: true }); // Automatically creates tables if they don't exist
        console.log('Database synchronized.');
    } catch (error) {
        console.error('Failed to sync database:', error);
    }

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

startServer();
