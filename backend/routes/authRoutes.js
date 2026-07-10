const express = require('express');
const router = express.Router();
const { register, login, updateProfile, getUsers, deleteUser } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.put('/profile/:id', updateProfile);
router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);

module.exports = router;
