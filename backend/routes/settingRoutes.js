const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/', requireAuth, getSettings);
router.post('/', requireAdmin, updateSettings);

module.exports = router;
