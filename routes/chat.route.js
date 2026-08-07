const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const ChatController = require('../controllers/chat.controller');

// Chat management
router.get('/', authMiddleware, ChatController.getMyChats);
router.post('/get-or-create', authMiddleware, ChatController.getOrCreateChat);
router.get('/:chatId/messages', authMiddleware, ChatController.getChatMessages);

// Message actions
router.post('/send', authMiddleware, ChatController.sendMessage);
router.put('/message/:messageId/read', authMiddleware, ChatController.markMessageRead);
router.put('/:chatId/read-all', authMiddleware, ChatController.markAllAsRead);

// Unread counts
router.get('/unread/count', authMiddleware, ChatController.getUnreadCount);
router.get('/unread/by-chat', authMiddleware, ChatController.getUnreadByChat);

router.post('/errand/:errandId/initiate', authMiddleware, ChatController.initiateErrandChat);
router.post('/errand/:errandId/create', authMiddleware, ChatController.createErrandChat);

// NEW: Support chat routes
router.post('/support/create', authMiddleware, ChatController.createSupportChat);

// Admin support routes
router.get('/support', authMiddleware, requireRole('admin'), ChatController.getSupportChats);
router.post('/support/assign', authMiddleware, requireRole('admin'), ChatController.assignSupportAgent);
router.put('/support/:chatId/close', authMiddleware, requireRole('admin'), ChatController.closeSupportChat);

module.exports = router;