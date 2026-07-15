const express = require('express');
const router = express.Router();
const Review = require('../models/Review.model');
const Booking = require('../models/Booking.model');
const User = require('../models/User.model');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate, userValidationRules } = require('../middleware/validation');

// Get reviews for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({
      revieweeId: req.params.userId,
      isPublic: true,
    })
      .populate('reviewerId', 'fullName')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get reviews by booking
router.get('/booking/:bookingId', authMiddleware, async (req, res) => {
  try {
    const reviews = await Review.find({ bookingId: req.params.bookingId })
      .populate('reviewerId', 'fullName')
      .populate('revieweeId', 'fullName');

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create review
router.post(
  '/',
  authMiddleware,
  validate(userValidationRules.review),
  async (req, res) => {
    try {
      const { bookingId, rating, comment, isPublic } = req.body;

      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      // Check if user is part of the booking
      if (req.user._id.toString() !== booking.customerId.toString() &&
          req.user._id.toString() !== booking.providerId?.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if review already exists
      const existingReview = await Review.findOne({ bookingId, reviewerId: req.user._id });
      if (existingReview) {
        return res.status(400).json({ message: 'You have already reviewed this booking' });
      }

      // Determine reviewee
      const revieweeId = req.user._id.toString() === booking.customerId.toString()
        ? booking.providerId
        : booking.customerId;

      if (!revieweeId) {
        return res.status(400).json({ message: 'Cannot review: other party not found' });
      }

      const review = new Review({
        bookingId,
        reviewerId: req.user._id,
        revieweeId,
        rating,
        comment,
        isPublic: isPublic !== undefined ? isPublic : true,
      });

      await review.save();

      // Update user's average rating
      const userReviews = await Review.find({ revieweeId });
      const averageRating = userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length;
      
      await User.findByIdAndUpdate(revieweeId, {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: userReviews.length,
      });

      res.status(201).json({
        message: 'Review created successfully',
        review,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Respond to review (provider can respond)
router.put('/:id/respond', authMiddleware, async (req, res) => {
  try {
    const { response } = req.body;
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Only reviewee can respond
    if (review.revieweeId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    review.response = response;
    review.respondedAt = new Date();
    await review.save();

    res.json({
      message: 'Response added to review',
      review,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;