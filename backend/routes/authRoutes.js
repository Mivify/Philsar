const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, checkEmail, login, logout, updateProfile, getUserById, getUsers, deleteUser, approveUserDeletion, rejectUserDeletion, forgotPassword, resetPassword, verifyEmail, resendVerification, changeEmail, verifyEmailChange } = require('../controllers/authController');
const { uploadImage } = require('../controllers/moduleController');
const { optionalAuth, requireAuth, requireAdmin, requireSubAdmin, requireSubAdminOnly } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');


const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
    handler: (req, res) => {
        logActivity({
            userName: req.body?.email || 'unknown', action: 'account_locked', category: 'auth',
            details: '5 failed login attempts in 5 minutes — locked out', req
        });
        res.status(429).json({ message: 'Too many attempts. Please wait a few minutes and try again.' });
    }
});
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many accounts created from this network. Please try again later.' }
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many reset requests. Please try again in a few minutes.' }
});

const resetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again in a few minutes.' }
});
// Same enumeration concern as forgot-password — email-triggering and keyed
// off an unauthenticated email address.
const resendVerificationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again in a few minutes.' }
});

// The registration form calls this each time the email field loses focus
const checkEmailLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again in a few minutes.' }
});

router.post('/register', registerLimiter, optionalAuth, register);
router.post('/check-email', checkEmailLimiter, checkEmail);
router.post('/login', loginLimiter, login);
router.post('/logout', requireAuth, logout);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.post('/verify-email', resetPasswordLimiter, verifyEmail);
router.post('/resend-verification', resendVerificationLimiter, resendVerification);
router.get('/profile/:id', requireAuth, getUserById);
router.put('/profile/:id', requireAuth, updateProfile);
router.post('/profile/:id/change-email', requireAuth, changeEmail);
// Reuses resetPasswordLimiter
router.post('/verify-email-change', resetPasswordLimiter, verifyEmailChange);
// Sub Admin can see the full roster (the Users tab is view-only for them,
// plus approving/rejecting pending deletions below)
router.get('/users', requireSubAdmin, getUsers);
// Admin can only request a deletion, never perform one directly
router.delete('/users/:id', requireAdmin, deleteUser);
router.post('/users/:id/approve-deletion', requireSubAdminOnly, approveUserDeletion);
router.post('/users/:id/reject-deletion', requireSubAdminOnly, rejectUserDeletion);
router.post('/upload-avatar', requireAuth, uploadImage);

module.exports = router;
