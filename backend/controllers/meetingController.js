const Meeting = require('../models/Meeting');
const User = require('../models/User');

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
        const { userId } = req.body;

        const meeting = await Meeting.findByPk(id);
        if (!meeting) {
            return res.status(404).json({ message: 'Meeting not found' });
        }

        meeting.registrants += 1;
        await meeting.save();

        if (userId) {
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
        const { title, host, dateTime, status, videoLink } = req.body;
        if (!title || !host || !dateTime) {
            return res.status(400).json({ message: 'Missing required meeting details' });
        }

        const meeting = await Meeting.create({ title, host, dateTime, status, videoLink });
        res.status(201).json({ message: 'Meeting created successfully', meeting });
    } catch (error) {
        res.status(500).json({ message: 'Error creating meeting', error: error.message });
    }
};

const updateMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, host, dateTime, status, videoLink, registrants } = req.body;

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

module.exports = { getMeetings, rsvpMeeting, createMeeting, updateMeeting, deleteMeeting };
