const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking.model');
const User = require('../models/User.model');
const Service = require('../models/Service.model');
const Notification = require('../models/Notification.model');
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const { validate, userValidationRules } = require('../middleware/validation');

// Get all bookings (customer sees their bookings, provider sees their accepted bookings)
router.get('/', authMiddleware, async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'provider') {
      query.providerId = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admins can see all bookings
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    const bookings = await Booking.find(query)
      .populate('customerId', 'fullName email phoneNumber')
      .populate('providerId', 'fullName email phoneNumber')
      .populate('serviceId', 'name category basePrice')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get booking by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('providerId', 'fullName email phoneNumber address')
      .populate('serviceId', 'name category basePrice description');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && 
        booking.customerId._id.toString() !== req.user._id.toString() &&
        booking.providerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create booking
router.post(
  '/',
  authMiddleware,
  requireRole('customer'),
  validate(userValidationRules.booking),
  async (req, res) => {
    try {
      const {
        serviceId,
        serviceType,
        customRequest,
        pickup,
        destination,
        date,
        time,
        description,
        photos,
        estimatedPrice,
      } = req.body;

      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }

      const booking = new Booking({
        customerId: req.user._id,
        serviceId,
        serviceType: customRequest ? 'custom' : serviceType,
        customRequest,
        pickup,
        destination,
        date,
        time,
        description,
        photos: photos || [],
        estimatedPrice,
        status: 'pending',
        paymentStatus: 'pending',
      });

      await booking.save();

      // Create notification for provider
      const notification = new Notification({
        userId: null, // Will be sent to all providers
        type: 'booking_created',
        title: 'New Booking Available',
        message: `New booking for ${service.name}`,
        data: { bookingId: booking._id },
      });

      await notification.save();

      // Emit socket event for all providers
      const io = req.app.get('io');
      io.emit('new-booking', {
        bookingId: booking._id,
        serviceType: serviceType,
        pickup: pickup.address,
        estimatedPrice,
      });

      res.status(201).json({
        message: 'Booking created successfully',
        booking,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Accept booking
router.put('/:id/accept', authMiddleware, requireRole('provider'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({ message: 'Booking is not pending' });
    }

    booking.providerId = req.user._id;
    booking.status = 'accepted';

    await booking.save();

    // Notify customer
    const notification = new Notification({
      userId: booking.customerId,
      type: 'booking_accepted',
      title: 'Booking Accepted',
      message: `${req.user.fullName} has accepted your booking`,
      data: { bookingId: booking._id },
    });

    await notification.save();

    // Emit socket event
    const io = req.app.get('io');
    io.to(`booking_${booking._id}`).emit('booking-updated', {
      bookingId: booking._id,
      status: 'accepted',
      provider: {
        id: req.user._id,
        name: req.user.fullName,
        phone: req.user.phoneNumber,
      },
    });

    res.json({
      message: 'Booking accepted successfully',
      booking,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update booking status
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check authorization
    const isCustomer = booking.customerId.toString() === req.user._id.toString();
    const isProvider = booking.providerId && booking.providerId.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Validate status transitions
    const validTransitions = {
      pending: ['accepted', 'cancelled'],
      accepted: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[booking.status]?.includes(status)) {
      return res.status(400).json({ message: 'Invalid status transition' });
    }

    // Additional checks
    if (status === 'completed' && !isCustomer) {
      return res.status(403).json({ message: 'Only customer can mark as completed' });
    }

    booking.status = status;
    if (status === 'in_progress') {
      booking.startedAt = new Date();
    } else if (status === 'completed') {
      booking.completedAt = new Date();
    } else if (status === 'cancelled') {
      booking.cancelledAt = new Date();
      booking.cancelledBy = req.user.role;
    }

    await booking.save();

    // Notify other party
    const recipientId = isCustomer ? booking.providerId : booking.customerId;
    if (recipientId) {
      const notification = new Notification({
        userId: recipientId,
        type: `booking_${status}`,
        title: `Booking ${status}`,
        message: `Booking #${booking.bookingId} is now ${status}`,
        data: { bookingId: booking._id },
      });

      await notification.save();
    }

    // Emit socket event
    const io = req.app.get('io');
    io.to(`booking_${booking._id}`).emit('booking-updated', {
      bookingId: booking._id,
      status,
    });

    res.json({
      message: 'Booking status updated',
      booking,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get available bookings for providers
router.get('/available', authMiddleware, requireRole('provider'), async (req, res) => {
  try {
    // Get bookings that are pending and not assigned to any provider
    const bookings = await Booking.find({
      status: 'pending',
      providerId: null,
    })
      .populate('customerId', 'fullName phoneNumber address')
      .populate('serviceId', 'name category basePrice')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get bookings by status
router.get('/status/:status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.params;
    let query = { status };

    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'provider') {
      query.providerId = req.user._id;
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const bookings = await Booking.find(query)
      .populate('customerId', 'fullName email phoneNumber')
      .populate('providerId', 'fullName email phoneNumber')
      .populate('serviceId', 'name category basePrice')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;