const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, updateProfile, getUserById, getUsers, deleteUser, forgotPassword, resetPassword } = require('../controllers/authController');
const { uploadImage } = require('../controllers/moduleController');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/auth');

// Login is the sensitive one — caps brute-force attempts per IP. Registration gets a
// looser limit too, mainly to stop automated account-creation spam.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again in a few minutes.' }
});
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many accounts created from this network. Please try again later.' }
});
// Unauthenticated and enumerable (an attacker could otherwise probe which
// emails are registered by hammering this endpoint), so it gets its own cap.
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many reset requests. Please try again in a few minutes.' }
});

router.post('/register', registerLimiter, optionalAuth, register);
router.post('/login', loginLimiter, login);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/profile/:id', requireAuth, getUserById);
router.put('/profile/:id', requireAuth, updateProfile);
router.get('/users', requireAdmin, getUsers);
router.delete('/users/:id', requireAdmin, deleteUser);
router.post('/upload-avatar', uploadImage);

module.exports = router;
