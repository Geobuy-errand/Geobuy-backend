// backend/routes/negotiation.routes.js

const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const NegotiationController = require('../controllers/negotiation.controller');

// Provider routes
router.post('/offer', authMiddleware, requireRole('provider'), NegotiationController.submitOffer);

// Customer routes
router.post('/offer/accept', authMiddleware, requireRole('customer'), NegotiationController.acceptOffer);
router.post('/offer/reject', authMiddleware, requireRole('customer'), NegotiationController.rejectOffer);
router.post('/offer/counter', authMiddleware, NegotiationController.counterOffer);

// Both customer and provider can view offers
router.get('/offers/:errandId', authMiddleware, NegotiationController.getOffers);

module.exports = router;