const express = require('express');
const router = express.Router();
const { createAssessment, getAssessments, getHerdStats } = require('../controllers/assessmentController');

router.post('/', createAssessment);
router.get('/', getAssessments);
router.get('/stats', getHerdStats);

module.exports = router;
