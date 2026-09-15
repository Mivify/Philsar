const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { createAssessment, getAssessments, getHerdStats } = require('../controllers/assessmentController');
const { requireAuth } = require('../middleware/auth');

// Same reasoning as the chatbot's limiter — each assessment triggers a real
// Gemini call for the AI-narrated guidance, on the same shared quota.
const assessmentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many assessments submitted — please wait a few minutes and try again.' }
});

router.post('/', assessmentLimiter, requireAuth, createAssessment);
router.get('/', requireAuth, getAssessments);
router.get('/stats', requireAuth, getHerdStats);

module.exports = router;
