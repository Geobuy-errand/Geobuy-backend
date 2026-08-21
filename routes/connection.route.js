const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const connectionController = require('../controllers/connection.controller');
const paymentController = require('../controllers/payment.controller');

// ============================================================
// CONNECTION FEE PAYMENT ROUTES (Backend Only - No Frontend Stripe.js)
// ============================================================
router.get('/check-payment-status', authMiddleware, paymentController.checkConnectionFeeStatus);
router.post('/create-checkout-session', authMiddleware, paymentController.createConnectionCheckoutSession);
router.get('/verify-payment', authMiddleware, paymentController.verifyConnectionPayment);

// ============================================================
// USER CONNECTION ROUTES
// ============================================================
router.post('/', authMiddleware, connectionController.createConnection);
router.get('/my-connections', authMiddleware, connectionController.getMyConnections);
router.get('/:id', authMiddleware, connectionController.getConnectionById);
router.put('/:id', authMiddleware, connectionController.updateConnection);
router.post('/:id/cancel', authMiddleware, connectionController.cancelConnection);
router.post('/:id/rate', authMiddleware, connectionController.rateConnection);

// ============================================================
// ADMIN ROUTES
// ============================================================
router.get('/admin/all', authMiddleware, requireRole('admin'), connectionController.adminGetAllConnections);
router.put('/admin/:id', authMiddleware, requireRole('admin'), connectionController.adminUpdateConnection);

module.exports = router;