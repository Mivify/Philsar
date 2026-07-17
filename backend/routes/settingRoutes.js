const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingController');

router.get('/', getSettings);
router.post('/', updateSettings);

module.exports = router;
