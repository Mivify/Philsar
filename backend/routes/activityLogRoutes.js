const express = require('express');
const router = express.Router();
const { getActivityLogs, getActivitySummary } = require('../controllers/activityLogController');
const { requireAdmin } = require('../middleware/auth');

// System-Admin-only, deliberately: a Sub Admin's own actions are recorded
// here too, so a role below Admin must never be able to view (or by
// implication, monitor/scrub) this trail.
router.get('/summary', requireAdmin, getActivitySummary);
router.get('/', requireAdmin, getActivityLogs);

module.exports = router;
