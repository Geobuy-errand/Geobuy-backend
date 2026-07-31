const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const NotificationController = require('../controllers/notification.controller');

// Get user notifications
router.get('/', authMiddleware, NotificationController.getNotifications);

// Mark notification as read
router.put('/:id/read', authMiddleware, NotificationController.markNotificationRead);

// Mark all notifications as read
router.put('/read-all', authMiddleware, NotificationController.markAllNotificationsRead);

// Get unread notification count
router.get('/unread/count', authMiddleware, NotificationController.getUnreadNotificationCount);

module.exports = router;