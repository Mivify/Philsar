const express = require('express');
const router = express.Router();
const { getModules, getModuleById, createModule, updateModule, deleteModule, uploadImage, backfillEmbeddings } = require('../controllers/moduleController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/', requireAuth, getModules);
router.get('/:id', requireAuth, getModuleById);
router.post('/', requireAdmin, createModule);
router.put('/:id', requireAdmin, updateModule);
router.delete('/:id', requireAdmin, deleteModule);
router.post('/upload', requireAuth, uploadImage);
router.post('/backfill-embeddings', requireAdmin, backfillEmbeddings);

module.exports = router;
