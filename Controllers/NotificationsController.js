const express = require('express');
const router = express.Router();
const db = require('../config/database');
const Notification = db.Notification;

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id; // Assuming user ID is available in req.user
        const notifications = await Notification.findAll({
            where: { UserID: userId },
            order: [['CreatedAt', 'DESC']]
        });
        res.status(200).json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        const updated = await Notification.update(
            { IsRead: true },
            { where: { ID: notificationId, UserID: userId } }
        );

        if (updated[0] === 0) {
            return res.status(404).json({ message: 'Notification not found or already read' });
        }

        res.status(200).json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        await Notification.update(
            { IsRead: true },
            { where: { UserID: userId, IsRead: false } }
        );

        res.status(200).json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const requireAuth = require('../middleware/requireAuth');

router.get('/', requireAuth, exports.getNotifications);
router.put('/:id/read', requireAuth, exports.markAsRead);
router.put('/read-all', requireAuth, exports.markAllAsRead);

module.exports = router;
