const express = require('express');
const router = express.Router();
const { validate, userValidationRules } = require('../middleware/validation');
const { authMiddleware } = require('../middleware/auth.middleware');
const AuthController = require('../controllers/auth.controller');

// Register Customer
router.post(
  '/register/customer',
  validate(userValidationRules.registerCustomer),
  AuthController.registerCustomer
);

// Register Provider
router.post(
  '/register/provider',
  validate(userValidationRules.registerProvider),
  AuthController.registerProvider
);

// Login
router.post('/login', validate(userValidationRules.login), AuthController.login);

// Logout
router.post('/logout', AuthController.logout);

// Get current user
router.get('/me', authMiddleware, AuthController.getCurrentUser);

module.exports = router;