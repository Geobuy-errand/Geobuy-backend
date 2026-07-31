const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const PaymentController = require('../controllers/payment.controller');

// Customer payment routes
router.post('/create-payment-intent', authMiddleware, requireRole('customer'), PaymentController.createPaymentIntent);
router.post('/release-funds', authMiddleware, requireRole('customer'), PaymentController.releaseFunds);
router.get('/my-payments', authMiddleware, PaymentController.getMyPayments);

// Admin payment routes
router.post('/admin/confirm-payment', authMiddleware, requireRole('admin'), PaymentController.confirmPayment);
router.post('/refund', authMiddleware, requireRole('admin'), PaymentController.refundPayment);

// Get payment by booking
router.get('/booking/:bookingId', authMiddleware, PaymentController.getPaymentByBooking);

module.exports = router;