const express = require('express');
const router = express.Router();
const {
    getMeetings,
    rsvpMeeting,
    createMeeting,
    updateMeeting,
    updateMeetingMinutes,
    deleteMeeting,
    pingAttendance,
    getMyAttendance,
    getMeetingAttendance,
    grantCertificate,
    revokeCertificate,
    getJaasToken
} = require('../controllers/meetingController');
const { requireAuth, requireSubAdmin, requireMinutesAccess } = require('../middleware/auth');

// Any logged-in user acting on their own behalf
router.get('/', requireAuth, getMeetings);
router.get('/attendance/:userId', requireAuth, getMyAttendance);
router.post('/:id/rsvp', requireAuth, rsvpMeeting);
router.post('/:id/attendance/ping', requireAuth, pingAttendance);
router.get('/:id/jaas-token', requireAuth, getJaasToken);

// Admin or Secretary: writing/editing minutes only — nothing else about the
// meeting. Kept as its own route (rather than folding into the general
// updateMeeting below) specifically so Secretary can't reach any other field
// on this resource through it.
router.put('/:id/minutes', requireMinutesAccess, updateMeetingMinutes);

// Admin or Sub Admin: global-resource writes, or acting on another user's data
router.get('/:id/attendance', requireSubAdmin, getMeetingAttendance);
router.post('/:id/attendance/grant', requireSubAdmin, grantCertificate);
router.post('/:id/attendance/revoke', requireSubAdmin, revokeCertificate);
router.post('/', requireSubAdmin, createMeeting);
router.put('/:id', requireSubAdmin, updateMeeting);
router.delete('/:id', requireSubAdmin, deleteMeeting);

module.exports = router;
