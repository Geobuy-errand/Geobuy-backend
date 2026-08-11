const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const SubscriptionPlanController = require('../controllers/subscription.plan.controller');

// Public routes
router.get('/active', SubscriptionPlanController.getActivePlans);

// Admin routes
router.get('/', authMiddleware, requireRole('admin'), SubscriptionPlanController.getAllPlans);
router.get('/:id', authMiddleware, requireRole('admin'), SubscriptionPlanController.getPlanById);
router.post('/', authMiddleware, requireRole('admin'), SubscriptionPlanController.createPlan);
router.put('/:id', authMiddleware, requireRole('admin'), SubscriptionPlanController.updatePlan);
router.delete('/:id', authMiddleware, requireRole('admin'), SubscriptionPlanController.deletePlan);
router.put('/:id/toggle', authMiddleware, requireRole('admin'), SubscriptionPlanController.togglePlanStatus);
router.post('/seed', authMiddleware, requireRole('admin'), SubscriptionPlanController.seedDefaultPlans);

module.exports = router;