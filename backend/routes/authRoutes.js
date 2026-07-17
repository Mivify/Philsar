const express = require('express');
const router = express.Router();
const { register, login, updateProfile, getUsers, deleteUser } = require('../controllers/authController');
const { uploadImage } = require('../controllers/moduleController');

router.post('/register', register);
router.post('/login', login);
router.put('/profile/:id', updateProfile);
router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);
router.post('/upload-avatar', uploadImage);

module.exports = router;
