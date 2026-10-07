const crypto = require('crypto');
const { Op } = require('sequelize');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const MeetingAttendance = require('../models/MeetingAttendance');
const Certificate = require('../models/Certificate');
const Setting = require('../models/Setting');
const { generateJaasToken } = require('../utils/jaasToken');
const { logActivity } = require('../utils/activityLog');

const HEARTBEAT_SECONDS = 30;
const MAX_ELAPSED_PER_PING_SECONDS = 5 * 60;
const DEFAULT_CERTIFICATE_THRESHOLD_MINUTES = 30;

// Admin-configurable via the Settings tab
const getCertificateThresholdSeconds = async () => {
    const setting = await Setting.findByPk('certAttendanceThresholdMinutes');
    const minutes = Number(setting?.value);
    return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_CERTIFICATE_THRESHOLD_MINUTES) * 60;
};

// Automatic eligibility is Seminar-only — a Regular
// Meeting never auto-qualifies for a certificate
const isEligible = (record, thresholdSeconds, meetingType) =>
    !record.revokedAt && ((meetingType === 'Seminar' && record.secondsAttended >= thresholdSeconds) || record.granted);

// 12 random characters from Crockford's base32 (no I, L, O or U, so nothing is
// misread when typed from paper), shown as XXXX-XXXX-XXXX: about 60 bits,
// far too many to guess.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newCertificateCode = () => {
    const chars = [...crypto.randomBytes(12)].map(b => CODE_ALPHABET[b % 32]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
};

// A Regular Meeting can be limited to specific roles via `allowedRoles`.

const canViewMeeting = (meeting, role) => {
    if (role === 'Admin' || role === 'Sub Admin') return true;
    if (meeting.meetingType !== 'Regular Meeting') return true;
    if (meeting.allowedRoles === null || meeting.allowedRoles === undefined) return true;
    return meeting.allowedRoles.split(',').map(r => r.trim()).filter(Boolean).includes(role);
};

const getMeetings = async (req, res) => {
    try {
        const meetings = await Meeting.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.status(200).json(meetings.filter(m => canViewMeeting(m, req.user.role)));
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
        if (!canViewMeeting(meeting, req.user.role)) {
            return res.status(403).json({ message: 'This meeting is not open to your role.' });
        }


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
        const { title, host, dateTime, status, videoLink, recordingUrl, meetingType, allowedRoles } = req.body;
        if (!title || !host || !dateTime) {
            return res.status(400).json({ message: 'Missing required meeting details' });
        }

        const meeting = await Meeting.create({
            title,
            host,
            dateTime,
            status,
            videoLink: videoLink && videoLink.trim() ? videoLink.trim() : undefined,
            recordingUrl: recordingUrl && recordingUrl.trim() ? recordingUrl.trim() : undefined,
            meetingType: meetingType || undefined,
            // Only a Regular Meeting carries a role restriction; a Seminar is
            // always open, so it's stored as NULL rather than a stale list.
            allowedRoles: meetingType === 'Regular Meeting' && allowedRoles !== undefined ? allowedRoles : null
        });

        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'meeting_created', category: 'admin', details: `"${title}" scheduled`, req
        });

        res.status(201).json({ message: 'Meeting created successfully', meeting });
    } catch (error) {
        res.status(500).json({ message: 'Error creating meeting', error: error.message });
    }
};

const updateMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, host, dateTime, status, videoLink, registrants, minutes, recordingUrl, meetingType, allowedRoles } = req.body;

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
        if (meetingType) meeting.meetingType = meetingType;

        if (allowedRoles !== undefined) meeting.allowedRoles = allowedRoles;
        if (meeting.meetingType === 'Seminar') meeting.allowedRoles = null;

        await meeting.save();

        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'meeting_updated', category: 'admin', details: `"${meeting.title}" updated`, req
        });

        res.status(200).json({ message: 'Meeting updated successfully', meeting });
    } catch (error) {
        res.status(500).json({ message: 'Error updating meeting', error: error.message });
    }
};

// Deliberately narrow — only touches minutes, unlike updateMeeting above.
// This is the one Secretary is allowed to call
// so it must not accept any other field on the meeting.
const updateMeetingMinutes = async (req, res) => {
    try {
        const { id } = req.params;
        const { minutes } = req.body;

        const meeting = await Meeting.findByPk(id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        meeting.minutes = minutes ?? '';
        await meeting.save();
        res.status(200).json({ message: 'Minutes updated successfully', meeting });
    } catch (error) {
        res.status(500).json({ message: 'Error updating minutes', error: error.message });
    }
};

const deleteMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const meeting = await Meeting.findByPk(id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'meeting_deleted', category: 'admin', details: `"${meeting.title}" deleted`, req
        });

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

        // reports real wall-clock time for the certificate
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

        const thresholdSeconds = await getCertificateThresholdSeconds();
        res.status(200).json({
            secondsAttended: record.secondsAttended,
            eligible: isEligible(record, thresholdSeconds, meeting.meetingType),
            status: meeting.status,
            rsvped: record.rsvped
        });
    } catch (error) {
        res.status(500).json({ message: 'Error recording attendance', error: error.message });
    }
};

const getMyAttendance = async (req, res) => {
    try {

        const userId = req.user.id;
        const rows = await MeetingAttendance.findAll({ where: { userId } });
        const thresholdSeconds = await getCertificateThresholdSeconds();

        const meetings = await Meeting.findAll({
            where: { id: rows.map(r => r.meetingId) },
            attributes: ['id', 'meetingType']
        });
        const typeById = Object.fromEntries(meetings.map(m => [m.id, m.meetingType]));

        const map = {};
        for (const row of rows) {
            map[row.meetingId] = {
                secondsAttended: row.secondsAttended,
                eligible: isEligible(row, thresholdSeconds, typeById[row.meetingId]),
                revoked: !!row.revokedAt,
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
        const meeting = await Meeting.findByPk(id, { attributes: ['meetingType'] });
        const rows = await MeetingAttendance.findAll({ where: { meetingId: id } });
        const thresholdSeconds = await getCertificateThresholdSeconds();

        res.status(200).json(rows.map(row => ({
            userId: row.userId,
            secondsAttended: row.secondsAttended,
            granted: row.granted,
            eligible: isEligible(row, thresholdSeconds, meeting?.meetingType),
            revoked: !!row.revokedAt,
            rsvped: row.rsvped
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
        record.revokedAt = null;
        await record.save();
        // Granting after a revoke makes the same certificate valid again, so the
        // copy the user already downloaded (same code / QR) checks as valid
        await Certificate.update(
            { revokedAt: null, revokedByName: null },
            { where: { userId, meetingId: id, revokedAt: { [Op.ne]: null } } }
        );

        const [actor, target, meeting] = await Promise.all([
            User.findByPk(req.user.id, { attributes: ['name', 'role'] }),
            User.findByPk(userId, { attributes: ['name'] }),
            Meeting.findByPk(id, { attributes: ['title'] })
        ]);
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'certificate_granted', category: 'admin',
            details: `Certificate granted to ${target?.name || `user #${userId}`} for "${meeting?.title || `seminar #${id}`}"`, req
        });

        const thresholdSeconds = await getCertificateThresholdSeconds();
        res.status(200).json({
            secondsAttended: record.secondsAttended,
            granted: record.granted,
            eligible: isEligible(record, thresholdSeconds),
            revoked: false
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
        // Revoking blocks the certificate even when it was earned by attendance
        record.granted = false;
        record.revokedAt = new Date();
        await record.save();

        const [actor, target, meeting] = await Promise.all([
            User.findByPk(req.user.id, { attributes: ['name', 'role'] }),
            User.findByPk(userId, { attributes: ['name'] }),
            Meeting.findByPk(id, { attributes: ['title'] })
        ]);
        // Copies already downloaded now show "Revoked" when their QR code is scanned
        await Certificate.update(
            { revokedAt: record.revokedAt, revokedByName: actor?.name || `admin #${req.user.id}` },
            { where: { userId, meetingId: id, revokedAt: null } }
        );
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'certificate_revoked', category: 'admin',
            details: `Certificate revoked from ${target?.name || `user #${userId}`} for "${meeting?.title || `seminar #${id}`}"`, req
        });

        const thresholdSeconds = await getCertificateThresholdSeconds();
        res.status(200).json({
            secondsAttended: record.secondsAttended,
            granted: record.granted,
            eligible: isEligible(record, thresholdSeconds),
            revoked: true
        });
    } catch (error) {
        res.status(500).json({ message: 'Error revoking certificate', error: error.message });
    }
};

// The certificate to print for this seminar: the signed-in user's own, or (for
// an Admin / Sub Admin downloading on someone's behalf) that user's. Issued on
// the first download and returned unchanged afterwards, so every copy carries
// the same code and issue date.
const issueCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const isStaff = req.user.role === 'Admin' || req.user.role === 'Sub Admin';
        const userId = isStaff && req.body?.userId ? Number(req.body.userId) : req.user.id;

        const [meeting, user, record] = await Promise.all([
            Meeting.findByPk(id),
            User.findByPk(userId, { attributes: ['id', 'name'] }),
            MeetingAttendance.findOne({ where: { userId, meetingId: id } })
        ]);
        if (!meeting || !user) {
            return res.status(404).json({ message: 'Seminar or user not found' });
        }
        const thresholdSeconds = await getCertificateThresholdSeconds();
        if (!record || !isEligible(record, thresholdSeconds, meeting.meetingType)) {
            return res.status(403).json({ message: 'No certificate is available for this seminar.' });
        }

        let certificate = await Certificate.findOne({
            where: { userId, meetingId: meeting.id, revokedAt: null },
            order: [['createdAt', 'DESC']]
        });
        if (!certificate) {
            certificate = await Certificate.create({
                code: newCertificateCode(),
                userId,
                meetingId: meeting.id,
                recipientName: user.name,
                meetingTitle: meeting.title,
                meetingHost: meeting.host,
                meetingDate: meeting.dateTime
            });
            // Re-read so issuedAt matches what later downloads get (MySQL keeps whole seconds)
            await certificate.reload();
        }
        res.status(200).json({ code: certificate.code, recipientName: certificate.recipientName, issuedAt: certificate.createdAt });
    } catch (error) {
        res.status(500).json({ message: 'Error issuing certificate', error: error.message });
    }
};

const getJaasToken = async (req, res) => {
    try {
        const { id } = req.params;
        const meeting = await Meeting.findByPk(id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!canViewMeeting(meeting, user.role)) {
            return res.status(403).json({ message: 'This meeting is not open to your role.' });
        }

        if (!process.env.JAAS_PRIVATE_KEY) {
            return res.status(503).json({ message: 'Video call authentication is not configured' });
        }


        const sanitizedRoomName = `${(meeting.title.replace(/[^a-zA-Z0-9]/g, '') || 'Seminar').toLowerCase()}-${meeting.id}`;

        const token = generateJaasToken({
            userId: user.id,
            name: user.name,
            email: user.email,
            moderator: user.role === 'Admin' || user.role === 'Sub Admin',
            room: sanitizedRoomName
        });

        res.status(200).json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Error generating video call token', error: error.message });
    }
};

// this is for the admin log page to see the attendance
const logMeetingJoin = async (req, res) => {
    try {
        const { id } = req.params;
        const [meeting, user] = await Promise.all([
            Meeting.findByPk(id, { attributes: ['title'] }),
            User.findByPk(req.user.id, { attributes: ['name', 'role'] })
        ]);
        logActivity({
            userId: req.user.id, userName: user?.name, userRole: user?.role,
            action: 'meeting_joined', category: 'meeting',
            details: `Joined "${meeting?.title || `seminar #${id}`}"`, req
        });
        res.status(204).end();
    } catch (error) {
        res.status(500).json({ message: 'Error logging meeting join', error: error.message });
    }
};

const logMeetingLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const [meeting, user] = await Promise.all([
            Meeting.findByPk(id, { attributes: ['title'] }),
            User.findByPk(req.user.id, { attributes: ['name', 'role'] })
        ]);
        logActivity({
            userId: req.user.id, userName: user?.name, userRole: user?.role,
            action: 'meeting_left', category: 'meeting',
            details: `Left "${meeting?.title || `seminar #${id}`}"`, req
        });
        res.status(204).end();
    } catch (error) {
        res.status(500).json({ message: 'Error logging meeting leave', error: error.message });
    }
};

// "End Meeting for All" in the call (Admins and Sub Admins): marks the meeting
// Ended without a trip to the Admin Panel. The host's call then disconnects
// everyone in the video room, and each attendee's portal sees the Ended status
// when it checks in (attendance ping) and closes their call.
const endMeeting = async (req, res) => {
    try {
        const meeting = await Meeting.findByPk(req.params.id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        if (meeting.status !== 'Ended') {
            meeting.status = 'Ended';
            await meeting.save();

            const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
            logActivity({
                userId: req.user.id, userName: actor?.name, userRole: actor?.role,
                action: 'meeting_ended', category: 'admin', details: `"${meeting.title}" ended for everyone from the call`, req
            });
        }

        res.status(200).json({ message: 'Meeting ended', meeting });
    } catch (error) {
        res.status(500).json({ message: 'Error ending meeting', error: error.message });
    }
};

module.exports = {
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
    endMeeting
};
