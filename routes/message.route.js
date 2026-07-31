const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate, userValidationRules } = require('../middleware/validation');
const MessageController = require('../controllers/message.controller');

// Get messages for a booking
router.get('/booking/:bookingId', authMiddleware, MessageController.getMessages);

// Send message
router.post('/', authMiddleware, validate(userValidationRules.message), MessageController.sendMessage);

// Mark message as read
router.put('/:id/read', authMiddleware, MessageController.markMessageRead);

// Get unread message count
router.get('/unread/count', authMiddleware, MessageController.getUnreadCount);

module.exports = router;