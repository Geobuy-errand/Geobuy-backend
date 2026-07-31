const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const { validate, userValidationRules } = require('../middleware/validation');
const AdminController = require('../controllers/admin.controller');

// Admin Login
router.post('/login', validate(userValidationRules.login), AdminController.adminLogin);

// Dashboard
router.get('/dashboard/stats', authMiddleware, requireRole('admin'), AdminController.getDashboardStats);

// User Management
router.get('/users', authMiddleware, requireRole('admin'), AdminController.getUsers);
router.put('/users/:id/toggle-status', authMiddleware, requireRole('admin'), AdminController.toggleUserStatus);

// Provider Verification
router.get('/verification-queue', authMiddleware, requireRole('admin'), AdminController.getVerificationQueue);
router.put('/verify-provider/:id', authMiddleware, requireRole('admin'), AdminController.verifyProvider);

// Booking Management
router.get('/bookings', authMiddleware, requireRole('admin'), AdminController.getBookings);

// Payment Management
router.get('/payments', authMiddleware, requireRole('admin'), AdminController.getPayments);

// Review Management
router.get('/reviews', authMiddleware, requireRole('admin'), AdminController.getReviews);
router.delete('/reviews/:id', authMiddleware, requireRole('admin'), AdminController.deleteReview);

// Analytics
router.get('/analytics/revenue', authMiddleware, requireRole('admin'), AdminController.getRevenueAnalytics);
router.get('/analytics/bookings', authMiddleware, requireRole('admin'), AdminController.getBookingAnalytics);

module.exports = router;