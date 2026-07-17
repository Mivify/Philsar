const express = require('express');
const router = express.Router();
const { getProgress, markLessonComplete, unmarkLessonComplete } = require('../controllers/progressController');

router.get('/:userId', getProgress);
router.post('/complete', markLessonComplete);
router.post('/uncomplete', unmarkLessonComplete);

module.exports = router;
