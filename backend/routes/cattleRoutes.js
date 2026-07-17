const express = require('express');
const router = express.Router();
const { getCattleList, createCattle, updateCattle, deleteCattle } = require('../controllers/cattleController');

router.get('/', getCattleList);
router.post('/', createCattle);
router.put('/:id', updateCattle);
router.delete('/:id', deleteCattle);

module.exports = router;
