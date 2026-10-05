const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { handleChat } = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');


const chatLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { response: "You're sending messages a bit too fast — please wait a few minutes and try again.", sources: [] }
});

router.post('/ask', chatLimiter, requireAuth, handleChat);

module.exports = router;
