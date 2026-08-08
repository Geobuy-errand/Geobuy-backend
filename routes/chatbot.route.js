const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const ChatbotController = require('../controllers/chatbot.controller');

// Chatbot routes
router.post('/response', authMiddleware, ChatbotController.chatbotResponse);

// Admin routes for escalated chats
router.get('/escalated', authMiddleware, requireRole('admin'), ChatbotController.getEscalatedChats);

module.exports = router;