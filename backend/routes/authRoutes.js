const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, updateProfile, getUserById, getUsers, deleteUser } = require('../controllers/authController');
const { uploadImage } = require('../controllers/moduleController');

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

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.get('/profile/:id', getUserById);
router.put('/profile/:id', updateProfile);
router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);
router.post('/upload-avatar', uploadImage);

module.exports = router;
