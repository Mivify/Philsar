const express = require('express');
const router = express.Router();
const { getMeetings, rsvpMeeting, createMeeting, updateMeeting, deleteMeeting } = require('../controllers/meetingController');

router.get('/', getMeetings);
router.post('/:id/rsvp', rsvpMeeting);
router.post('/', createMeeting);
router.put('/:id', updateMeeting);
router.delete('/:id', deleteMeeting);

module.exports = router;
