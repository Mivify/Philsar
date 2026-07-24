const express = require('express');
const router = express.Router();
const { getCattleList, createCattle, updateCattle, deleteCattle } = require('../controllers/cattleController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, getCattleList);
router.post('/', requireAuth, createCattle);
router.put('/:id', requireAuth, updateCattle);
router.delete('/:id', requireAuth, deleteCattle);

module.exports = router;
