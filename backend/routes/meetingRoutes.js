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
    revokeCertificate
} = require('../controllers/meetingController');

router.get('/', getMeetings);
router.get('/attendance/:userId', getMyAttendance);
router.get('/:id/attendance', getMeetingAttendance);
router.post('/:id/rsvp', rsvpMeeting);
router.post('/:id/attendance/ping', pingAttendance);
router.post('/:id/attendance/grant', grantCertificate);
router.post('/:id/attendance/revoke', revokeCertificate);
router.post('/', createMeeting);
router.put('/:id', updateMeeting);
router.delete('/:id', deleteMeeting);

module.exports = router;
