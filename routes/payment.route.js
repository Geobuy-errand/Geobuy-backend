const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const PaymentController = require('../controllers/payment.controller');

// Customer payment routes
router.post('/create-payment-intent', authMiddleware, requireRole('customer'), PaymentController.createPaymentIntent);
router.post('/confirm-payment', authMiddleware, requireRole('customer'), PaymentController.confirmPayment);
router.post('/release-funds', authMiddleware, requireRole('customer'), PaymentController.releaseFundsToProvider);
router.get('/payment-status/:paymentId', authMiddleware, PaymentController.getPaymentStatus);
router.get('/my-payments', authMiddleware, PaymentController.getMyPayments);

// Admin payment routes
router.post('/admin/confirm-payment', authMiddleware, requireRole('admin'), PaymentController.confirmPayment);
router.post('/admin/release-funds', authMiddleware, requireRole('admin'), PaymentController.releaseFundsToProvider);
router.post('/refund', authMiddleware, requireRole('admin'), PaymentController.refundPayment);
router.get('/admin/all', authMiddleware, requireRole('admin'), PaymentController.getAllPayments);
router.get('/admin/stats', authMiddleware, requireRole('admin'), PaymentController.getPaymentStats);

// Get payment by booking/errand
router.get('/booking/:bookingId', authMiddleware, PaymentController.getPaymentByBooking);
router.get('/errand/:errandId', authMiddleware, PaymentController.getPaymentByErrand);

module.exports = router;