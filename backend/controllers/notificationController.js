const Notification = require('../models/Notification');

// The signed-in user's latest notifications (newest first) and how many are unread
const getMyNotifications = async (req, res) => {
    try {
        const [notifications, unreadCount] = await Promise.all([
            Notification.findAll({
                where: { userId: req.user.id },
                order: [['createdAt', 'DESC']],
                limit: 20,
                attributes: ['id', 'type', 'data', 'isRead', 'createdAt']
            }),
            Notification.count({ where: { userId: req.user.id, isRead: false } })
        ]);
        res.status(200).json({ notifications, unreadCount });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving notifications', error: error.message });
    }
};

// Opening the bell marks everything as read
const markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.update({ isRead: true }, { where: { userId: req.user.id, isRead: false } });
        res.status(200).json({ message: 'Notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating notifications', error: error.message });
    }
};

module.exports = { getMyNotifications, markAllNotificationsRead };
