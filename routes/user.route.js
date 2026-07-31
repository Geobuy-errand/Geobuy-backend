const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const UserController = require('../controllers/user.controller');

// Update profile
router.put('/profile', authMiddleware, UserController.updateProfile);

// Get provider profile
router.get('/provider-profile', authMiddleware, UserController.getProviderProfile);

// Update provider availability
router.put('/availability', authMiddleware, UserController.updateAvailability);

// Get available providers
router.get('/available-providers', UserController.getAvailableProviders);

// Get user by ID
router.get('/:id', UserController.getUserById);

// Update password
router.put('/change-password', authMiddleware, UserController.changePassword);

module.exports = router;