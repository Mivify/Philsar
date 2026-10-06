const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { verifyCertificate } = require('../controllers/certificateController');

// Public (no login): scanning a certificate's QR code lands here. Limited so
// certificate codes can't be found by guessing.
const verifyLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many checks. Please wait a minute and try again.' }
});

router.get('/verify/:code', verifyLimiter, verifyCertificate);

module.exports = router;
