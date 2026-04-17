const express = require('express');
const router = express.Router();
const { getModules, getModuleById, createModule } = require('../controllers/moduleController');

router.get('/', getModules);
router.get('/:id', getModuleById);
router.post('/', createModule);

module.exports = router;
