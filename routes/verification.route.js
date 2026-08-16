const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const VerificationController = require('../controllers/verification.controller');

// Submit verification document
router.post('/', authMiddleware, VerificationController.submitVerification);

// Get user's verifications
router.get('/my', authMiddleware, VerificationController.getMyVerifications);

// Admin: Get pending verifications
router.get('/pending', authMiddleware, requireRole('admin'), VerificationController.getPendingVerifications);

// Admin: Review verification
router.put('/:id/review', authMiddleware, requireRole('admin'), VerificationController.reviewVerification);
// Add this route

router.post('/request-review', authMiddleware, VerificationController.requestVerificationReview);

module.exports = router;