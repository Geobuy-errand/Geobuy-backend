const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const SettingsController = require('../controllers/settings.controller');

// Public routes (no auth required)
router.get('/public', SettingsController.getSettings);

// Admin routes
router.get('/', authMiddleware, requireRole('admin'), SettingsController.getAllSettings);
router.put('/', authMiddleware, requireRole('admin'), SettingsController.updateSettings);
router.post('/reset', authMiddleware, requireRole('admin'), SettingsController.resetSettings);

module.exports = router;