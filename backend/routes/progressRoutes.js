const express = require('express');
const router = express.Router();
const { getProgress, markLessonComplete, unmarkLessonComplete } = require('../controllers/progressController');
const { requireAuth } = require('../middleware/auth');

router.get('/:userId', requireAuth, getProgress);
router.post('/complete', requireAuth, markLessonComplete);
router.post('/uncomplete', requireAuth, unmarkLessonComplete);

module.exports = router;
