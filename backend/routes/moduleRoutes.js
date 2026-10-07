const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { getModules, getModuleById, createModule, updateModule, deleteModule, uploadImage, backfillEmbeddings, importPdf } = require('../controllers/moduleController');
const { requireAuth, requireAdmin, requireSubAdmin } = require('../middleware/auth');

// Each import is one Gemini request, so keep a cap on how often it can run
const pdfImportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many PDF imports. Please wait a few minutes and try again.' }
});

router.get('/', requireAuth, getModules);
router.get('/:id', requireAuth, getModuleById);
router.post('/', requireSubAdmin, createModule);
router.put('/:id', requireSubAdmin, updateModule);
router.delete('/:id', requireSubAdmin, deleteModule);

router.post('/upload', requireSubAdmin, uploadImage);
// The PDF is sent as the raw request body (Content-Type: application/pdf), up to 10 MB
router.post('/import-pdf', requireSubAdmin, pdfImportLimiter, express.raw({ type: 'application/pdf', limit: '10mb' }), importPdf);
router.post('/backfill-embeddings', requireAdmin, backfillEmbeddings);

module.exports = router;
