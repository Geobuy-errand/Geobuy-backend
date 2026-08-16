const Message = require('../models/Message.model');
const Booking = require('../models/Booking.model');
const Errand = require('../models/Errand.model');
const Chat = require('../models/Chat.model');
const Notification = require('../models/Notification.model');

// Get messages for a booking
exports.getMessages = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Try to find in Errand model first (new), then fallback to Booking (old)
    let booking = await Errand.findById(bookingId);
    if (!booking) {
      booking = await Booking.findById(bookingId);
    }
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check authorization
    const customerId = booking.customerId?.toString() || booking.customerId?._id?.toString();
    const providerId = booking.providerId?.toString() || booking.providerId?._id?.toString();

    if (req.user.role !== 'admin' &&
        customerId !== req.user._id.toString() &&
        providerId !== req.user._id.toString()) {
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
    console.error('Get messages error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const { bookingId, content, receiverId, chatId } = req.body;
    
    // Validate required fields
    if (!bookingId) {
      return res.status(400).json({ message: 'Booking ID is required' });
    }
    
    if (!content) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Try to find in Errand model first (new), then fallback to Booking (old)
    let booking = await Errand.findById(bookingId);
    if (!booking) {
      booking = await Booking.findById(bookingId);
    }
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Get customer and provider IDs
    const customerId = booking.customerId?.toString() || booking.customerId?._id?.toString();
    const providerId = booking.providerId?.toString() || booking.providerId?._id?.toString();

    // Check authorization
    if (req.user.role !== 'admin' &&
        customerId !== req.user._id.toString() &&
        providerId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Determine receiver if not specified
    let finalReceiverId = receiverId;
    if (!finalReceiverId) {
      finalReceiverId = req.user._id.toString() === customerId
        ? providerId
        : customerId;
    }

    // If chatId is not provided, try to find or create one
    let finalChatId = chatId;
    if (!finalChatId) {
      const chat = await Chat.findOne({
        errandId: bookingId,
        isActive: true,
      });
      
      if (chat) {
        finalChatId = chat._id;
      } else {
        // Create a new chat
        const newChat = new Chat({
          participants: [
            { userId: req.user._id },
            { userId: finalReceiverId },
          ],
          errandId: bookingId,
          bookingId: bookingId,
          isSupportChat: false,
        });
        await newChat.save();
        finalChatId = newChat._id;
      }
    }

    const message = new Message({
      chatId: finalChatId,
      bookingId,
      senderId: req.user._id,
      receiverId: finalReceiverId,
      content,
    });

    await message.save();

    // Populate sender info
    await message.populate('senderId', 'fullName');

    // Create notification for receiver
    const notification = new Notification({
      userId: finalReceiverId,
      type: 'new_message',
      title: 'New Message',
      message: `${req.user.fullName} sent you a message`,
      data: { bookingId, messageId: message._id, chatId: finalChatId },
    });
    await notification.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`booking_${bookingId}`).emit('new-message', {
        message,
        bookingId,
        chatId: finalChatId,
      });
      io.to(`user_${finalReceiverId}`).emit('new-message-notification', {
        bookingId,
        message: content,
        sender: req.user.fullName,
        chatId: finalChatId,
      });
      io.to(`chat_${finalChatId}`).emit('new-message', {
        message,
        bookingId,
        chatId: finalChatId,
      });
    }

    res.status(201).json({
      message: 'Message sent successfully',
      data: message,
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Mark message as read
exports.markMessageRead = async (req, res) => {
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
    console.error('Mark message read error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get unread message count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiverId: req.user._id,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: error.message });
  }
};