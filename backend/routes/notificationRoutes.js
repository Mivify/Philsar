const express = require('express');
const router = express.Router();
const { getMyNotifications, markAllNotificationsRead } = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, getMyNotifications);
router.post('/read-all', requireAuth, markAllNotificationsRead);

module.exports = router;
