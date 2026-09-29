const Announcement = require('../models/Announcement');
const User = require('../models/User');
const { logActivity } = require('../utils/activityLog');

// Announcements carry no author column, so this log row is the only record of
// who posted, edited, or removed one.
const logAnnouncementAction = async (req, action, details) => {
    const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
    logActivity({
        userId: req.user.id, userName: actor?.name, userRole: actor?.role,
        action, category: 'admin', details, req
    });
};

const getAnnouncements = async (req, res) => {
    try {
        const announcements = await Announcement.findAll({ order: [['createdAt', 'DESC']] });
        res.status(200).json(announcements);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving announcements', error: error.message });
    }
};

// The image itself is uploaded separately via the existing modules upload endpoint
// (Cloudinary-backed) — this just records the resulting URL alongside the text.
const createAnnouncement = async (req, res) => {
    try {
        const { title, body, imageUrl } = req.body;
        if (!title || !body) {
            return res.status(400).json({ message: 'Missing title or body' });
        }

        const announcement = await Announcement.create({ title, body, imageUrl: imageUrl || null });
        await logAnnouncementAction(req, 'announcement_created', `"${title}" posted`);
        res.status(201).json({ message: 'Announcement created successfully', announcement });
    } catch (error) {
        res.status(500).json({ message: 'Error creating announcement', error: error.message });
    }
};

const updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, body, imageUrl } = req.body;

        const announcement = await Announcement.findByPk(id);
        if (!announcement) {
            return res.status(404).json({ message: 'Announcement not found' });
        }

        if (title) announcement.title = title;
        if (body) announcement.body = body;
        if (imageUrl !== undefined) announcement.imageUrl = imageUrl || null;
        await announcement.save();
        await logAnnouncementAction(req, 'announcement_updated', `"${announcement.title}" updated`);

        res.status(200).json({ message: 'Announcement updated successfully', announcement });
    } catch (error) {
        res.status(500).json({ message: 'Error updating announcement', error: error.message });
    }
};

const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const announcement = await Announcement.findByPk(id);
        if (!announcement) {
            return res.status(404).json({ message: 'Announcement not found' });
        }

        await announcement.destroy();
        await logAnnouncementAction(req, 'announcement_deleted', `"${announcement.title}" deleted`);
        res.status(200).json({ message: 'Announcement removed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error removing announcement', error: error.message });
    }
};

module.exports = { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement };
