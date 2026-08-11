const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const SubscriptionController = require('../controllers/subscription.controller');

// Public webhook endpoint (no auth)
router.post('/webhook', express.raw({ type: 'application/json' }), SubscriptionController.handleStripeWebhook);

// User subscription routes
router.get('/plans', authMiddleware, SubscriptionController.getPlans);
router.post('/create-checkout', authMiddleware, SubscriptionController.createCheckoutSession);
router.post('/cancel', authMiddleware, SubscriptionController.cancelSubscription);
router.post('/resume', authMiddleware, SubscriptionController.resumeSubscription);
router.get('/status', authMiddleware, SubscriptionController.getSubscriptionStatus);

// Admin routes
router.get('/admin/history', authMiddleware, requireRole('admin'), SubscriptionController.getSubscriptionHistory);

module.exports = router;