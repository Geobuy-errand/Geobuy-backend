const express = require('express');
const router = express.Router();
const Message = require('../models/Message.model');
const Booking = require('../models/Booking.model');
const Notification = require('../models/Notification.model');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate, userValidationRules } = require('../middleware/validation');

// Get messages for a booking
router.get('/booking/:bookingId', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' &&
        booking.customerId.toString() !== req.user._id.toString() &&
        booking.providerId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({ bookingId })
      .populate('senderId', 'fullName role')
      .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      {
        bookingId,
        receiverId: req.user._id,
        isRead: false,
      },
      { isRead: true, readAt: new Date() }
    );

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Send message
router.post(
  '/',
  authMiddleware,
  validate(userValidationRules.message),
  async (req, res) => {
    try {
      const { bookingId, content, receiverId } = req.body;

      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      // Check authorization
      if (req.user.role !== 'admin' &&
          booking.customerId.toString() !== req.user._id.toString() &&
          booking.providerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Determine receiver if not specified
      let finalReceiverId = receiverId;
      if (!finalReceiverId) {
        finalReceiverId = req.user._id.toString() === booking.customerId.toString()
          ? booking.providerId
          : booking.customerId;
      }

      const message = new Message({
        bookingId,
        senderId: req.user._id,
        receiverId: finalReceiverId,
        content,
      });

      await message.save();

      // Create notification for receiver
      const notification = new Notification({
        userId: finalReceiverId,
        type: 'new_message',
        title: 'New Message',
        message: `${req.user.fullName} sent you a message`,
        data: { bookingId, messageId: message._id },
      });
      await notification.save();

      // Emit socket event
      const io = req.app.get('io');
      io.to(`booking_${bookingId}`).emit('new-message', {
        message,
        bookingId,
      });
      io.to(`user_${finalReceiverId}`).emit('new-message-notification', {
        bookingId,
        message: content,
        sender: req.user.fullName,
      });

      res.status(201).json({
        message: 'Message sent successfully',
        data: message,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Mark message as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.receiverId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    message.isRead = true;
    message.readAt = new Date();
    await message.save();

    res.json({ message: 'Message marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get unread message count
router.get('/unread/count', authMiddleware, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiverId: req.user._id,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;