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
    issueCertificate,
    getJaasToken,
    logMeetingJoin,
    logMeetingLeave,
    endMeeting,
    startRecording,
    uploadRecordingPart,
    finishRecording,
    getMeetingRecordings,
    deleteRecording
} = require('../controllers/meetingController');
const { requireAuth, requireSubAdmin, requireMinutesAccess } = require('../middleware/auth');

// Any logged-in user acting on their own behalf
router.get('/', requireAuth, getMeetings);
router.get('/attendance/:userId', requireAuth, getMyAttendance);
router.post('/:id/rsvp', requireAuth, rsvpMeeting);
router.post('/:id/attendance/ping', requireAuth, pingAttendance);
router.get('/:id/jaas-token', requireAuth, getJaasToken);
router.post('/:id/attendance/join', requireAuth, logMeetingJoin);
router.post('/:id/attendance/leave', requireAuth, logMeetingLeave);
// Own certificate; an Admin / Sub Admin may pass { userId } to get someone else's
router.post('/:id/certificate', requireAuth, issueCertificate);

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
// "End Meeting for All" from inside the call
router.post('/:id/end', requireSubAdmin, endMeeting);

// Recordings made in a host's browser: uploaded in parts while recording (each
// part is the raw request body, 8 MB from the browser); attendees can list and
// watch them once the seminar has ended
router.get('/:id/recordings', requireAuth, getMeetingRecordings);
router.post('/:id/recordings', requireSubAdmin, startRecording);
router.put('/:id/recordings/:recordingId/parts/:partNumber', requireSubAdmin, express.raw({ type: '*/*', limit: '16mb' }), uploadRecordingPart);
router.post('/:id/recordings/:recordingId/finish', requireSubAdmin, finishRecording);
router.delete('/:id/recordings/:recordingId', requireSubAdmin, deleteRecording);

module.exports = router;
