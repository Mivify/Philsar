const express = require('express');
const router = express.Router();
const { getModules, getModuleById, createModule, updateModule, deleteModule, uploadImage, backfillEmbeddings } = require('../controllers/moduleController');
const { requireAuth, requireAdmin, requireSubAdmin } = require('../middleware/auth');

router.get('/', requireAuth, getModules);
router.get('/:id', requireAuth, getModuleById);
router.post('/', requireSubAdmin, createModule);
router.put('/:id', requireSubAdmin, updateModule);
router.delete('/:id', requireSubAdmin, deleteModule);
router.post('/upload', requireAuth, uploadImage);
router.post('/backfill-embeddings', requireAdmin, backfillEmbeddings);

module.exports = router;
