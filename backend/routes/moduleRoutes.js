const express = require('express');
const router = express.Router();
const { getModules, getModuleById, createModule, updateModule, deleteModule, uploadImage } = require('../controllers/moduleController');

router.get('/', getModules);
router.get('/:id', getModuleById);
router.post('/', createModule);
router.put('/:id', updateModule);
router.delete('/:id', deleteModule);
router.post('/upload', uploadImage);

module.exports = router;
