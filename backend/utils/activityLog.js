const ActivityLog = require('../models/ActivityLog');

// Fire-and-forget by design — swallows its own errors so a logging hiccup
// (e.g. a transient DB issue) never breaks the real action it's recording.
// Pass `req` when available so the IP address gets captured; req.ip already
// resolves correctly through Railway's proxy (see server.js's trust proxy setting).
const logActivity = async ({ userId = null, userName = null, userRole = null, action, category, details = null, req = null }) => {
    try {
        await ActivityLog.create({
            userId,
            userName,
            userRole,
            action,
            category,
            details,
            ipAddress: req?.ip || null,
        });
    } catch (error) {
        console.error('Failed to record activity log:', error);
    }
};

module.exports = { logActivity };
