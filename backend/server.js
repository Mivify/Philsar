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
const landingRoutes = require('./routes/landingRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Railway sits in front of the app as a single reverse proxy, so the real client
// IP arrives via X-Forwarded-For. Trusting exactly one hop lets Express (and the
// express-rate-limit middleware, which otherwise can't safely read that header)
// resolve req.ip correctly instead of lumping every visitor into one bucket.
app.set('trust proxy', 1);

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
app.use('/api/landing-images', landingRoutes);

app.get('/api', (req, res) => {
    res.send('PHILSAR API is running.');
});

// Serve the frontend's production build (when it exists — e.g. built as part of a
// combined Railway deploy). Falls through harmlessly in local dev, where the API
// and the Vite dev server run as two separate processes on different ports.
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
// Path-less middleware (not a route pattern) — Express 5's router no longer accepts
// a bare '*' wildcard string, so this runs for any request that reached this point.
app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
        if (err) next();
    });
});

// Sync database and start server
const startServer = async () => {
    await connectDB();

    // Sync Sequelize models. `alter: true` auto-migrates the schema on every boot —
    // convenient while the schema is still actively changing, but a real risk once
    // this stabilizes (auto-altering a live production table on every deploy can lock
    // it or behave unexpectedly as the schema grows). Set DB_SYNC_ALTER=false once
    // schema changes become rare; sync() without alter just creates missing tables.
    const shouldAlter = process.env.DB_SYNC_ALTER !== 'false';
    try {
        await sequelize.sync({ alter: shouldAlter });
        console.log(`Database synchronized${shouldAlter ? ' (with schema auto-alter)' : ''}.`);
    } catch (error) {
        console.error('Failed to sync database:', error);
    }

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

startServer();
