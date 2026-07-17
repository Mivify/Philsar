const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { connectDB, sequelize } = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const moduleRoutes = require('./routes/moduleRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const settingRoutes = require('./routes/settingRoutes');
const progressRoutes = require('./routes/progressRoutes');
const cattleRoutes = require('./routes/cattleRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Falls back to allow-all in local dev; set FRONTEND_URL in production to lock this down.
app.use(cors(process.env.FRONTEND_URL ? { origin: process.env.FRONTEND_URL } : {}));
// Configure higher limit to support Base64 cover uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/cattle', cattleRoutes);

app.get('/', (req, res) => {
    res.send('PHILSAR API is running.');
});

// Sync database and start server
const startServer = async () => {
    await connectDB();

    // Sync Sequelize models
    try {
        await sequelize.sync({ alter: true }); // Automatically creates/modifies tables if they don't exist
        console.log('Database synchronized.');
    } catch (error) {
        console.error('Failed to sync database:', error);
    }

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

startServer();
