const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const PaymentController = require('../controllers/payment.controller');

// Customer: hosted checkout (Stripe for UK, Paystack for Nigeria)
router.post('/errand/checkout', authMiddleware, requireRole('customer'), PaymentController.createErrandCheckout);
router.get('/verify', authMiddleware, PaymentController.verifyPayment);

// Backwards-compatible names
router.post('/create-payment-intent', authMiddleware, requireRole('customer'), PaymentController.createPaymentIntent);
router.post('/confirm-payment', authMiddleware, requireRole('customer'), PaymentController.confirmPayment);
router.post('/release-funds', authMiddleware, requireRole('customer', 'admin'), PaymentController.releaseFundsToProvider);

router.get('/payment-status/:paymentId', authMiddleware, PaymentController.getPaymentStatus);
router.get('/my-payments', authMiddleware, PaymentController.getMyPayments);

// Admin
router.post('/admin/confirm-payment', authMiddleware, requireRole('admin'), PaymentController.confirmPayment);
router.post('/admin/release-funds', authMiddleware, requireRole('admin'), PaymentController.releaseFundsToProvider);
router.post('/refund', authMiddleware, requireRole('admin'), PaymentController.refundPayment);
router.get('/admin/all', authMiddleware, requireRole('admin'), PaymentController.getAllPayments);
router.get('/admin/stats', authMiddleware, requireRole('admin'), PaymentController.getPaymentStats);

router.get('/booking/:bookingId', authMiddleware, PaymentController.getPaymentByBooking);
router.get('/errand/:errandId', authMiddleware, PaymentController.getPaymentByErrand);

module.exports = router;
