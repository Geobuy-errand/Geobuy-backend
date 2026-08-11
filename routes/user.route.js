const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const UserController = require('../controllers/user.controller');

router.put('/profile', authMiddleware, UserController.updateProfile);
router.get('/provider-profile', authMiddleware, UserController.getProviderProfile);
router.put('/availability', authMiddleware, UserController.updateAvailability);
router.get('/available-providers', UserController.getAvailableProviders);
router.get('/:id', UserController.getUserById);
router.put('/change-password', authMiddleware, UserController.changePassword);

router.get('/errand-runner/profile', authMiddleware, UserController.getErrandRunnerProfile);
router.put('/errand-runner/availability', authMiddleware, UserController.updateErrandRunnerAvailability);
router.get('/errand-runners/available', UserController.getAvailableErrandRunners);
router.get('/errand-runner/:id', UserController.getErrandRunnerById);


module.exports = router;