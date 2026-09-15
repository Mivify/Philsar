const express = require('express');
const router = express.Router();
const { getModules, getModuleById, createModule, updateModule, deleteModule, uploadImage, backfillEmbeddings } = require('../controllers/moduleController');
const { requireAuth, requireAdmin, requireSubAdmin } = require('../middleware/auth');

router.get('/', requireAuth, getModules);
router.get('/:id', requireAuth, getModuleById);
router.post('/', requireSubAdmin, createModule);
router.put('/:id', requireSubAdmin, updateModule);
router.delete('/:id', requireSubAdmin, deleteModule);
// Sub Admin (or Admin) only — the frontend only ever calls this from admin-only
// surfaces (module cover/content images, Home Page banner, certificate
// background, announcements), but the route itself previously accepted any
// logged-in account, letting a regular user upload arbitrary images to the
// Cloudinary account directly, bypassing the UI entirely.
router.post('/upload', requireSubAdmin, uploadImage);
router.post('/backfill-embeddings', requireAdmin, backfillEmbeddings);

module.exports = router;
