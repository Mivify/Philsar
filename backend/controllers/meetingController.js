const Meeting = require('../models/Meeting');
const User = require('../models/User');
const MeetingAttendance = require('../models/MeetingAttendance');

const HEARTBEAT_SECONDS = 30;
const MAX_ELAPSED_PER_PING_SECONDS = 5 * 60;
const CERTIFICATE_THRESHOLD_SECONDS = 30 * 60;

const isEligible = (record) => record.secondsAttended >= CERTIFICATE_THRESHOLD_SECONDS || record.granted;

const getMeetings = async (req, res) => {
    try {
        const meetings = await Meeting.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.status(200).json(meetings);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving meetings', error: error.message });
    }
};

const rsvpMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const meeting = await Meeting.findByPk(id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        // Tracked per-user so re-calling this (double-click, revisit) doesn't keep
        // inflating registrants/seminarsAttended, and so joinability can be gated
        // on having actually RSVP'd (see requireAuth-gated Join Live flow).
        const [record, created] = await MeetingAttendance.findOrCreate({
            where: { userId, meetingId: id },
            defaults: { secondsAttended: 0, rsvped: true }
        });
        const isNewRsvp = created || !record.rsvped;
        if (!record.rsvped) {
            record.rsvped = true;
            await record.save();
        }

        if (isNewRsvp) {
            meeting.registrants += 1;
            await meeting.save();

            const user = await User.findByPk(userId);
            if (user) {
                user.seminarsAttended += 1;
                await user.save();
            }
        }

        res.status(200).json({ message: 'RSVP registered successfully', meeting });
    } catch (error) {
        res.status(500).json({ message: 'Error registering RSVP', error: error.message });
    }
};

const createMeeting = async (req, res) => {
    try {
        const { title, host, dateTime, status, videoLink, recordingUrl } = req.body;
        if (!title || !host || !dateTime) {
            return res.status(400).json({ message: 'Missing required meeting details' });
        }

        const meeting = await Meeting.create({
            title,
            host,
            dateTime,
            status,
            videoLink: videoLink && videoLink.trim() ? videoLink.trim() : undefined,
            recordingUrl: recordingUrl && recordingUrl.trim() ? recordingUrl.trim() : undefined
        });
        res.status(201).json({ message: 'Meeting created successfully', meeting });
    } catch (error) {
        res.status(500).json({ message: 'Error creating meeting', error: error.message });
    }
};

const updateMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, host, dateTime, status, videoLink, registrants, minutes, recordingUrl } = req.body;

        const meeting = await Meeting.findByPk(id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        if (title) meeting.title = title;
        if (host) meeting.host = host;
        if (dateTime) meeting.dateTime = dateTime;
        if (status) meeting.status = status;
        if (videoLink) meeting.videoLink = videoLink;
        if (registrants !== undefined) meeting.registrants = parseInt(registrants);
        if (minutes !== undefined) meeting.minutes = minutes;
        if (recordingUrl !== undefined) meeting.recordingUrl = recordingUrl;

        await meeting.save();
        res.status(200).json({ message: 'Meeting updated successfully', meeting });
    } catch (error) {
        res.status(500).json({ message: 'Error updating meeting', error: error.message });
    }
};

const deleteMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const meeting = await Meeting.findByPk(id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        await meeting.destroy();
        res.status(200).json({ message: 'Meeting deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting meeting', error: error.message });
    }
};

const pingAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { elapsedSeconds } = req.body;

        const meeting = await Meeting.findByPk(id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        // The client reports real wall-clock time since its last successful ping
        // (self-correcting for dropped pings, throttled timers, brief reconnects)
        // rather than us just assuming a fixed 30s always elapsed. Clamped so a
        // single ping can't claim an unreasonable amount of attendance.
        // (`|| HEARTBEAT_SECONDS` would silently treat a legitimate 0 — e.g. the
        // very first ping right after joining — as "missing" and fall back to 30,
        // so missing/invalid is detected explicitly instead.)
        const parsedElapsed = Number(elapsedSeconds);
        const safeElapsed = Number.isFinite(parsedElapsed)
            ? Math.min(Math.max(parsedElapsed, 1), MAX_ELAPSED_PER_PING_SECONDS)
            : HEARTBEAT_SECONDS;

        const [record] = await MeetingAttendance.findOrCreate({
            where: { userId, meetingId: id },
            defaults: { secondsAttended: 0 }
        });
        record.secondsAttended += safeElapsed;
        await record.save();

        res.status(200).json({
            secondsAttended: record.secondsAttended,
            eligible: isEligible(record)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error recording attendance', error: error.message });
    }
};

const getMyAttendance = async (req, res) => {
    try {
        // Route keeps a :userId param for URL-shape compatibility with existing
        // frontend calls, but it's ignored — always scoped to the caller's own id.
        const userId = req.user.id;
        const rows = await MeetingAttendance.findAll({ where: { userId } });

        const map = {};
        for (const row of rows) {
            map[row.meetingId] = {
                secondsAttended: row.secondsAttended,
                eligible: isEligible(row),
                rsvped: row.rsvped
            };
        }

        res.status(200).json(map);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving attendance', error: error.message });
    }
};

const getMeetingAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await MeetingAttendance.findAll({ where: { meetingId: id } });

        res.status(200).json(rows.map(row => ({
            userId: row.userId,
            secondsAttended: row.secondsAttended,
            granted: row.granted,
            eligible: isEligible(row)
        })));
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving meeting attendance', error: error.message });
    }
};

const grantCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: 'Missing userId' });
        }

        const [record] = await MeetingAttendance.findOrCreate({
            where: { userId, meetingId: id },
            defaults: { secondsAttended: 0 }
        });
        record.granted = true;
        await record.save();

        res.status(200).json({
            secondsAttended: record.secondsAttended,
            granted: record.granted,
            eligible: isEligible(record)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error granting certificate', error: error.message });
    }
};

const revokeCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: 'Missing userId' });
        }

        const [record] = await MeetingAttendance.findOrCreate({
            where: { userId, meetingId: id },
            defaults: { secondsAttended: 0 }
        });
        record.granted = false;
        await record.save();

        res.status(200).json({
            secondsAttended: record.secondsAttended,
            granted: record.granted,
            eligible: isEligible(record)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error revoking certificate', error: error.message });
    }
};

module.exports = {
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
};
