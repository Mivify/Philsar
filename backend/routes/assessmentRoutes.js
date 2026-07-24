const express = require('express');
const router = express.Router();
const { createAssessment, getAssessments, getHerdStats } = require('../controllers/assessmentController');
const { requireAuth } = require('../middleware/auth');

router.post('/', requireAuth, createAssessment);
router.get('/', requireAuth, getAssessments);
router.get('/stats', requireAuth, getHerdStats);

module.exports = router;
