const express = require('express');
const router = express.Router();
const { handleChat } = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');

router.post('/ask', requireAuth, handleChat);

module.exports = router;
