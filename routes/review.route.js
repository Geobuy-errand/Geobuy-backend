const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate, userValidationRules } = require('../middleware/validation');
const ReviewController = require('../controllers/review.controller');

// Get reviews for a user
router.get('/user/:userId', ReviewController.getUserReviews);

// Get reviews by booking
router.get('/booking/:bookingId', authMiddleware, ReviewController.getBookingReviews);

// Create review
router.post('/', authMiddleware, validate(userValidationRules.review), ReviewController.createReview);

// Respond to review
router.put('/:id/respond', authMiddleware, ReviewController.respondToReview);

module.exports = router;