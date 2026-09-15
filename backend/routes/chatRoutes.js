const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { handleChat } = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');

// Each message costs a real Gemini API call against a shared quota — unlike
// the auth endpoints, this had no cap at all, so one runaway client (buggy
// frontend loop, or a deliberately hostile account) could burn through the
// whole app's free-tier quota for every other user. Generous enough not to
// interrupt normal use (a full classroom chatting during a live demo on the
// same IP), tight enough to stop an automated loop.
const chatLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { response: "You're sending messages a bit too fast — please wait a few minutes and try again.", sources: [] }
});

router.post('/ask', chatLimiter, requireAuth, handleChat);

module.exports = router;
