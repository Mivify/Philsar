const express = require('express');
const router = express.Router();
const {
    getMeetings,
    rsvpMeeting,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    pingAttendance,
    getMyAttendance,
    getMeetingAttendance,
    grantCertificate,
    revokeCertificate,
    getJaasToken
} = require('../controllers/meetingController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { debugPrivateKeyShape } = require('../utils/jaasToken');

// Any logged-in user acting on their own behalf
router.get('/', requireAuth, getMeetings);
router.get('/attendance/:userId', requireAuth, getMyAttendance);
router.post('/:id/rsvp', requireAuth, rsvpMeeting);
router.post('/:id/attendance/ping', requireAuth, pingAttendance);
router.get('/:id/jaas-token', requireAuth, getJaasToken);
// TEMPORARY — diagnoses the JAAS_PRIVATE_KEY env-var formatting issue on
// Railway without ever exposing the key itself. Remove once confirmed fixed.
router.get('/debug/jaas-key-shape', requireAdmin, (req, res) => {
    res.status(200).json(debugPrivateKeyShape());
});

// Admin-only: global-resource writes, or acting on another user's data
router.get('/:id/attendance', requireAdmin, getMeetingAttendance);
router.post('/:id/attendance/grant', requireAdmin, grantCertificate);
router.post('/:id/attendance/revoke', requireAdmin, revokeCertificate);
router.post('/', requireAdmin, createMeeting);
router.put('/:id', requireAdmin, updateMeeting);
router.delete('/:id', requireAdmin, deleteMeeting);

module.exports = router;
