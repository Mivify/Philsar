const express = require('express');
const router = express.Router();
const { getLandingImages, addLandingImage, deleteLandingImage } = require('../controllers/landingController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/', requireAuth, getLandingImages);
router.post('/', requireAdmin, addLandingImage);
router.delete('/:id', requireAdmin, deleteLandingImage);

module.exports = router;
