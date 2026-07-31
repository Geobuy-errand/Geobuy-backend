const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const CommissionController = require('../controllers/commission.controller');

// Provider routes
router.get('/my', authMiddleware, requireRole('provider'), CommissionController.getMyCommissions);
router.get('/stats/my', authMiddleware, requireRole('provider'), CommissionController.getCommissionStats);

// Provider and admin routes
router.get('/:id', authMiddleware, CommissionController.getCommissionById);
router.get('/:id/invoice', authMiddleware, CommissionController.getInvoice);

// Admin only routes
router.post('/generate', authMiddleware, requireRole('admin'), CommissionController.generateCommission);
router.post('/auto-generate', authMiddleware, requireRole('admin'), CommissionController.autoGenerateCommission);
router.put('/:id/pay', authMiddleware, requireRole('admin'), CommissionController.markCommissionPaid);
router.put('/:id/cancel', authMiddleware, requireRole('admin'), CommissionController.cancelCommission);

// Admin routes
router.get('/admin/all', authMiddleware, requireRole('admin'), CommissionController.getAllCommissions);
router.get('/admin/summary', authMiddleware, requireRole('admin'), CommissionController.getCommissionSummary);

module.exports = router;