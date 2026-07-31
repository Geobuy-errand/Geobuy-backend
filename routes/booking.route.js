const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const { validate, userValidationRules } = require('../middleware/validation');
const BookingController = require('../controllers/booking.controller');

// Get all bookings
router.get('/', authMiddleware, BookingController.getBookings);

// Get available bookings for providers
router.get('/available', authMiddleware, requireRole('provider'), BookingController.getAvailableBookings);

// Get bookings by status
router.get('/status/:status', authMiddleware, BookingController.getBookingsByStatus);

// Get booking by ID
router.get('/:id', authMiddleware, BookingController.getBookingById);

// Create booking
router.post(
  '/',
  authMiddleware,
  requireRole('customer'),
  validate(userValidationRules.booking),
  BookingController.createBooking
);

// Accept booking
router.put('/:id/accept', authMiddleware, requireRole('provider'), BookingController.acceptBooking);

// Update booking status
router.put('/:id/status', authMiddleware, BookingController.updateBookingStatus);

module.exports = router;