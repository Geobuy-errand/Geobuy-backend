const Chat = require('../models/Chat.model');
const Message = require('../models/Message.model');
const User = require('../models/User.model');
const Errand = require('../models/Errand.model');
const Notification = require('../models/Notification.model');
const createNotification = require('../utils/create-notification');

// Get or create a chat
exports.getOrCreateChat = async (req, res) => {
  try {
    const { userId, errandId, bookingId, isSupport } = req.body;
    const currentUserId = req.user._id;

    // For support chat
    if (isSupport) {
      let chat = await Chat.findOne({
        isSupportChat: true,
        participants: { $elemMatch: { userId: currentUserId } },
        isActive: true,
        supportStatus: { $ne: 'closed' },
      });

      if (!chat) {
        chat = new Chat({
          participants: [
            { userId: currentUserId },

          ],
          isSupportChat: true,
          supportStatus: 'open',
        });
        await chat.save();
      }

      return res.json(chat);
    }

    // For errand/booking chat
    let chat = await Chat.findOne({
      errandId: errandId || null,
      bookingId: bookingId || null,
      participants: { $all: [
        { $elemMatch: { userId: currentUserId } },
        { $elemMatch: { userId: userId } },
      ]},
      isActive: true,
    });

    if (!chat) {
      chat = new Chat({
        participants: [
          { userId: currentUserId },
          { userId: userId },
        ],
        errandId: errandId || null,
        bookingId: bookingId || null,
      });
      await chat.save();
    }

    res.json(chat);
  } catch (error) {
    console.error('Get or create chat error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get user's chats
exports.getMyChats = async (req, res) => {
  try {
    const userId = req.user._id;

    const chats = await Chat.find({
      participants: { $elemMatch: { userId: userId } },
      isActive: true,
    })
      .populate('participants.userId', 'fullName email phoneNumber avatar')
      .populate('errandId', 'errandId serviceType status')
      .populate('bookingId', 'bookingId serviceType status')
      .sort({ updatedAt: -1 });

    // Get unread count for each chat
    const chatsWithUnread = await Promise.all(chats.map(async (chat) => {
      const unreadCount = await Message.countDocuments({
        chatId: chat._id,
        receiverId: userId,
        isRead: false,
      });
      return { ...chat.toObject(), unreadCount };
    }));

    res.json(chatsWithUnread);
  } catch (error) {
    console.error('Get my chats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get chat messages
exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if user is participant
    const isParticipant = chat.participants.some(p => p.userId.toString() === userId.toString());
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get messages
    const messages = await Message.find({ chatId })
      .populate('senderId', 'fullName email avatar')
      .populate('receiverId', 'fullName email avatar')
      .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      {
        chatId,
        receiverId: userId,
        isRead: false,
      },
      { isRead: true, readAt: new Date() }
    );

    // Update participant's last read
    const participant = chat.participants.find(p => p.userId.toString() === userId.toString());
    if (participant) {
      participant.lastReadAt = new Date();
      await chat.save();
    }

    res.json(messages);
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const { chatId, content, messageType, fileUrl } = req.body;
    const senderId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if user is participant
    const isParticipant = chat.participants.some(p => p.userId.toString() === senderId.toString());
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Find receiver
    const receiver = chat.participants.find(p => p.userId.toString() !== senderId.toString());


    // Create message
    const message = new Message({
      chatId,
      senderId,
      receiverId: receiver?.userId || null,
      content,
      messageType: messageType || 'text',
      fileUrl: fileUrl || null,
    });

    await message.save();

    // Update chat last message
    chat.lastMessage = {
      content: content,
      senderId: senderId,
      sentAt: new Date(),
    };
    await chat.save();

    // Populate sender info
    await message.populate('senderId', 'fullName email avatar');
    await message.populate('receiverId', 'fullName email avatar');

    // Create notification for receiver
    if (receiver) {
      const notification = new Notification({
        userId: receiver.userId,
        type: 'new_message',
        title: 'New Message',
        message: `${req.user.fullName} sent you a message`,
        data: { chatId, messageId: message._id },
      });
      await notification.save();
    }

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      // Send to all participants
      for (const participant of chat.participants) {
        io.to(`user_${participant.userId}`).emit('new-message', {
          chatId,
          message,
          senderId,
        });
      }

      // Send to admin if support chat
      if (chat.isSupportChat) {
        io.to('admin_room').emit('new-support-message', {
          chatId,
          message,
          userId: senderId,
        });
      }

      // Send to errand room if exists
      if (chat.errandId) {
        io.to(`errand_${chat.errandId}`).emit('new-message', {
          chatId,
          message,
        });
      }
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Mark message as read
exports.markMessageRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.receiverId.toString() !== userId.toString()) {
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

// Mark all messages as read in a chat
exports.markAllAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    await Message.updateMany(
      {
        chatId,
        receiverId: userId,
        isRead: false,
      },
      { isRead: true, readAt: new Date() }
    );

    // Update participant's last read
    const chat = await Chat.findById(chatId);
    if (chat) {
      const participant = chat.participants.find(p => p.userId.toString() === userId.toString());
      if (participant) {
        participant.lastReadAt = new Date();
        await chat.save();
      }
    }

    res.json({ message: 'All messages marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get unread message count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const count = await Message.countDocuments({
      receiverId: userId,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get unread count by chat
exports.getUnreadByChat = async (req, res) => {
  try {
    const userId = req.user._id;

    const chats = await Chat.find({
      participants: { $elemMatch: { userId: userId } },
      isActive: true,
    });

    const unreadCounts = await Promise.all(chats.map(async (chat) => ({
      chatId: chat._id,
      count: await Message.countDocuments({
        chatId: chat._id,
        receiverId: userId,
        isRead: false,
      }),
    })));

    res.json(unreadCounts);
  } catch (error) {
    console.error('Get unread by chat error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get support chats (Admin only)
exports.getSupportChats = async (req, res) => {
  try {
    const { status } = req.query;
    const query = { isSupportChat: true };

    if (status && status !== 'all') {
      query.supportStatus = status;
    }

    const chats = await Chat.find(query)
      .populate('participants.userId', 'fullName email phoneNumber')
      .populate('supportAgentId', 'fullName email')
      .sort({ updatedAt: -1 });

    // Get last message for each chat
    const chatsWithLast = await Promise.all(chats.map(async (chat) => {
      const lastMessage = await Message.findOne({ chatId: chat._id })
        .sort({ createdAt: -1 })
        .populate('senderId', 'fullName');

      const unreadCount = await Message.countDocuments({
        chatId: chat._id,
        isRead: false,
      });

      return { ...chat.toObject(), lastMessage, unreadCount };
    }));

    res.json(chatsWithLast);
  } catch (error) {
    console.error('Get support chats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Assign support agent (Admin only)
exports.assignSupportAgent = async (req, res) => {
  try {
    const { chatId, agentId } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    chat.supportAgentId = agentId;
    chat.supportStatus = 'assigned';
    await chat.save();

    // Notify agent
    const notification = new Notification({
      userId: agentId,
      type: 'support_assigned',
      title: 'Support Chat Assigned',
      message: 'A new support chat has been assigned to you',
      data: { chatId },
    });
    await notification.save();

    // Notify user
    const customer = chat.participants.find(p => p.userId.toString() !== agentId);
    if (customer) {
      const notification2 = new Notification({
        userId: customer.userId,
        type: 'support_assigned',
        title: 'Support Agent Assigned',
        message: 'A support agent has been assigned to help you',
        data: { chatId },
      });
      await notification2.save();
    }

    // Emit socket
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${agentId}`).emit('support-assigned', { chatId });
      io.to('admin_room').emit('support-assigned', { chatId });
    }

    res.json({ message: 'Support agent assigned successfully', chat });
  } catch (error) {
    console.error('Assign support agent error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Close support chat (Admin only)
exports.closeSupportChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { resolution } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    chat.supportStatus = 'closed';
    chat.isActive = false;
    await chat.save();

    // Notify user
    const notification = new Notification({
      userId: chat.participants[0]?.userId,
      type: 'support_closed',
      title: 'Support Chat Closed',
      message: `Your support chat has been resolved${resolution ? `: ${resolution}` : ''}`,
      data: { chatId },
    });
    await notification.save();

    // Emit socket
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${chat.participants[0]?.userId}`).emit('support-closed', { chatId });
      io.to('admin_room').emit('support-closed', { chatId });
    }

    res.json({ message: 'Support chat closed', chat });
  } catch (error) {
    console.error('Close support chat error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Create chat for errand (auto-created when provider accepts)
exports.createErrandChat = async (req, res) => {
    try {
      const { errandId } = req.params;
      const userId = req.user._id;
  
      const errand = await Errand.findById(errandId);
      if (!errand) {
        return res.status(404).json({ message: 'Errand not found' });
      }
  
      // Check if user is part of the errand
      const isCustomer = errand.customerId.toString() === userId.toString();
      const isProvider = errand.providerId && errand.providerId.toString() === userId.toString();
  
      if (!isCustomer && !isProvider && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied' });
      }
  
      // Check if chat already exists
      let chat = await Chat.findOne({
        errandId: errandId,
        isActive: true,
      });
  
      if (!chat) {
        // Create new chat with both participants
        chat = new Chat({
          participants: [
            { userId: errand.customerId },
            { userId: errand.providerId },
          ],
          errandId: errandId,
          isSupportChat: false,
        });
        await chat.save();
  
        // Notify both parties
        await createNotification(
          errand.customerId,
          'chat_created',
          'Chat Available 💬',
          `You can now chat with ${errand.providerId ? 'your errand runner' : 'the provider'}`,
          { chatId: chat._id, errandId }
        );
        
        if (errand.providerId) {
          await createNotification(
            errand.providerId,
            'chat_created',
            'Chat Available 💬',
            'You can now chat with the customer about this errand',
            { chatId: chat._id, errandId }
          );
        }
      }
  
      res.json(chat);
    } catch (error) {
      console.error('Create errand chat error:', error);
      res.status(500).json({ message: error.message });
    }
  };
  
  // Create support chat (Customer or Provider to Admin)
  exports.createSupportChat = async (req, res) => {
    try {
      const userId = req.user._id;
      const { category, subject, priority } = req.body;
  
      // Check if user already has an open support chat
      let existingChat = await Chat.findOne({
        participants: { $elemMatch: { userId: userId } },
        isSupportChat: true,
        supportStatus: { $in: ['open', 'assigned'] },
        isActive: true,
      });
  
      if (existingChat) {
        return res.json({
          chat: existingChat,
          message: 'You already have an open support chat',
        });
      }
  
      // Create new support chat
      const botUser = await User.findOne({ role: 'admin', isActive: true }).sort({ createdAt: 1 });

      const chat = new Chat({
        participants: [
          { userId: userId },
          { userId: botUser._id },
        ],
        isSupportChat: true,
        supportStatus: 'open',
        priority: priority || 'medium',
        category: category || 'general',
        isActive: true,
      });
  
      await chat.save();
  
      // Notify admins
      const admins = await User.find({ role: 'admin', isActive: true });
      for (const admin of admins) {
        await createNotification(
          admin._id,
          'new_support_request',
          'New Support Request 🆘',
          `Customer ${req.user.fullName} needs support`,
          { chatId: chat._id, userId: userId }
        );
      }
  
      // Emit socket to admin room
      const io = req.app.get('io');
      if (io) {
        io.to('admin_room').emit('new-support-request', {
          chatId: chat._id,
          userId: userId,
          user: req.user.fullName,
          category: category || 'general',
          priority: priority || 'medium',
          timestamp: new Date(),
        });
      }
  
      res.status(201).json({
        message: 'Support chat created successfully',
        chat,
      });
    } catch (error) {
      console.error('Create support chat error:', error);
      res.status(500).json({ message: error.message });
    }
  };
  
  // Initiate chat from errand tracking page
  exports.initiateErrandChat = async (req, res) => {
    try {
      const { errandId } = req.params;
      const userId = req.user._id;
  
      const errand = await Errand.findById(errandId)
        .populate('customerId', 'fullName email')
        .populate('providerId', 'fullName email');
  
      if (!errand) {
        return res.status(404).json({ message: 'Errand not found' });
      }
  
      // Check if user is part of the errand
      const isCustomer = errand.customerId._id.toString() === userId.toString();
      const isProvider = errand.providerId && errand.providerId._id.toString() === userId.toString();
  
      if (!isCustomer && !isProvider && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied' });
      }
  
      // Find or create chat
      let chat = await Chat.findOne({
        errandId: errandId,
        isActive: true,
      });
  
      if (!chat) {
        // Only create if provider is assigned
        if (!errand.providerId) {
          return res.status(400).json({ 
            message: 'Chat can only be initiated after a provider is assigned' 
          });
        }
  
        chat = new Chat({
          participants: [
            { userId: errand.customerId._id },
            { userId: errand.providerId._id },
          ],
          errandId: errandId,
          isSupportChat: false,
        });
        await chat.save();
  
        // Create notifications
        const participant = isCustomer ? errand.providerId : errand.customerId;
        if (participant) {
          await createNotification(
            participant._id,
            'chat_created',
            'New Chat 💬',
            `${req.user.fullName} wants to chat about the errand`,
            { chatId: chat._id, errandId }
          );
        }
      }
  
      res.json({
        chat,
        chatId: chat._id,
        participants: chat.participants,
      });
    } catch (error) {
      console.error('Initiate errand chat error:', error);
      res.status(500).json({ message: error.message });
    }
  };