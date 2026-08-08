const Chat = require('../models/Chat.model');
const Message = require('../models/Message.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');

// Chatbot responses
const CHATBOT_RESPONSES = {
  // Greetings
  'hello': 'Hello! 👋 How can I help you today?',
  'hi': 'Hi there! 👋 What can I assist you with?',
  'hey': 'Hey! 👋 How can I help you?',
  'good morning': 'Good morning! ☀️ How can I assist you today?',
  'good afternoon': 'Good afternoon! 🌤️ How can I help you?',
  'good evening': 'Good evening! 🌙 How can I assist you?',
  
  // General help
  'help': 'I\'m here to help! You can ask me about:\n• Booking errands 🛒\n• Finding providers 🔍\n• Payment issues 💳\n• Account questions 👤\n• Delivery status 📦\n\nIf I can\'t help, I\'ll connect you to a real agent!',
  'what can you do': 'I can help you with:\n• Errand bookings\n• Provider matching\n• Payment questions\n• Account issues\n• Delivery tracking\n• And more!',
  
  // Booking
  'book errand': 'To book an errand:\n1. Go to "Book Errand" in the menu\n2. Select your service type\n3. Enter pickup and dropoff locations\n4. Choose date and time\n5. Review and confirm!\n\nNeed help? Type "help" for more options!',
  'how to book': 'Booking is easy! 📝\n1. Click "Book Errand"\n2. Fill in the details\n3. Get a price estimate\n4. Confirm your booking\n\nWant me to guide you through it?',
  'booking': 'I can help you with bookings! 📋\n• To book: Go to "Book Errand"\n• To track: Go to "My Errands"\n• To cancel: Go to errand details\n\nNeed specific help? Ask me!',
  
  // Provider
  'find provider': 'To find a provider:\n1. Go to "Find Services"\n2. Select a category\n3. Filter by DBS/Insurance\n4. View provider profiles\n5. Request a service!',
  'provider': 'I can help you find providers! 🔍\n• Browse categories\n• Check verification badges\n• View ratings and reviews\n• Request quotes\n\nWhat type of provider are you looking for?',
  
  // Payment
  'payment': '💰 Payment Questions:\n• We accept card payments\n• Payment is held in escrow\n• Released when errand is complete\n• 20% platform fee, 80% to provider\n• Secure Stripe processing',
  'pay': 'You can pay securely with your card 💳\n• Payment is held until completion\n• Full refund if errand not completed\n• Check your payment status in "My Payments"',
  'refund': '🔄 Refunds:\n• If errand is cancelled, you get full refund\n• Refunds process in 3-5 business days\n• Contact support for refund help',
  
  // Account
  'account': '👤 Account Help:\n• Update profile in Settings\n• Change password in Security\n• View your bookings in Dashboard\n• Check your wallet balance',
  'password': '🔑 Password:\n• Go to Settings > Change Password\n• Enter current and new password\n• Save changes\n\nNeed to reset? Contact support!',
  'profile': '📋 Profile:\n• Update name, phone, address\n• Add profile picture\n• Set preferences\n\nGo to Profile in your dashboard!',
  
  // Delivery
  'track': '📍 Tracking your errand:\n1. Go to "My Errands"\n2. Click on the errand\n3. See real-time status\n4. View progress timeline\n\nYou\'ll get updates at each step!',
  'status': '📦 Errand Statuses:\n• Pending - Waiting for provider\n• Accepted - Provider confirmed\n• En Route - On the way\n• Collected - Picked up\n• Delivered - Completed!\n\nCheck your errand details for updates!',
  
  // Support
  'agent': 'I\'ll connect you to a real agent! 🎧\nThey\'ll be with you shortly. Please describe your issue.',
  'human': 'I\'ll connect you to a real agent! 🎧\nThey\'ll be with you shortly.',
  'real person': 'I\'ll connect you to a real agent! 🎧\nThey\'ll be with you shortly.',
  'talk to agent': 'I\'ll connect you to a real agent! 🎧\nThey\'ll be with you shortly.',
  
  // Fallback
  'default': 'I\'m not sure I understand 🤔. Let me connect you to a real agent who can help!\n\nWhile you wait, you can:\n• Type "help" for options\n• Check our FAQ\n• Visit our Help Center\n\nAn agent will join shortly!',
};

// Chatbot Controller
exports.chatbotResponse = async (req, res) => {
  try {
    const { message, chatId, userId } = req.body;
    const user = req.user || await User.findById(userId);

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Find or create chat
    let chat = chatId ? await Chat.findById(chatId) : null;
    
    if (!chat) {
      // Check if user already has an open support chat
      chat = await Chat.findOne({
        participants: { $elemMatch: { userId: user._id } },
        isSupportChat: true,
        supportStatus: { $in: ['open', 'assigned'] },
        isActive: true,
      });

      if (!chat) {
        chat = new Chat({
          participants: [{ userId: user._id }],
          isSupportChat: true,
          supportStatus: 'open',
          category: 'chatbot',
          isActive: true,
        });
        await chat.save();
      }
    }

    // Process message and get bot response
    const lowerMessage = message.toLowerCase().trim();
    let botResponse = CHATBOT_RESPONSES.default;
    let shouldEscalate = false;

    // Check for escalation keywords
    const escalationKeywords = ['agent', 'human', 'real person', 'talk to agent', 'speak to agent', 'live person'];
    if (escalationKeywords.some(keyword => lowerMessage.includes(keyword))) {
      shouldEscalate = true;
      botResponse = CHATBOT_RESPONSES['agent'];
    } else {
      // Find matching response
      let bestMatch = null;
      let bestScore = 0;
      
      for (const [key, response] of Object.entries(CHATBOT_RESPONSES)) {
        if (key === 'default') continue;
        if (lowerMessage.includes(key)) {
          const score = key.length / lowerMessage.length;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = response;
          }
        }
      }
      
      if (bestMatch) {
        botResponse = bestMatch;
      } else {
        // Check if message is complex (needs human)
        const words = lowerMessage.split(' ').length;
        if (words > 8) {
          shouldEscalate = true;
          botResponse = 'That\'s a complex question 🤔. Let me connect you to a real agent who can give you the best answer!\n\nAn agent will join shortly.';
        } else {
          botResponse = CHATBOT_RESPONSES.default;
        }
      }
    }

    // Save bot message
    const systemBot = await User.findOne({ role: 'bot' });
    const botMessage = new Message({
      chatId: chat._id,
      senderId: systemBot._id || 'system-bot', // System/bot
      receiverId: user._id,
      content: botResponse,
      messageType: 'system',
      isRead: true,
    });
    await botMessage.save();

    // Save user message
    const userMessage = new Message({
      chatId: chat._id,
      senderId: user._id,
      receiverId: systemBot._id || 'system-bot',
      content: message,
      messageType: 'text',
      isRead: true,
    });
    await userMessage.save();

    // Update chat last message
    chat.lastMessage = {
      content: botResponse,
      sentAt: new Date(),
    };

    // If should escalate, update chat status and notify agents
    if (shouldEscalate) {
      chat.supportStatus = 'assigned';
      chat.category = 'escalated';
      chat.priority = 'high';
      
      // Notify all online agents
      const agents = await User.find({
        role: 'admin',
        isActive: true,
        'isOnline': true,
      });

      for (const agent of agents) {
        const notification = new Notification({
          userId: agent._id,
          type: 'chat_escalated',
          title: '🚨 Chat Escalated',
          message: `${user.fullName} needs agent assistance`,
          data: { chatId: chat._id, userId: user._id },
        });
        await notification.save();

        // Emit socket
        const io = req.app.get('io');
        if (io) {
          io.to(`user_${agent._id}`).emit('chat-escalated', {
            chatId: chat._id,
            userId: user._id,
            userName: user.fullName,
            timestamp: new Date(),
          });
        }
      }

      io.to('admin_room').emit('new-escalation', {
        chatId: chat._id,
        userId: user._id,
        userName: user.fullName,
        message: message,
        priority: 'high',
        timestamp: new Date(),
      });    
    }

    await chat.save();

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      // Send response to user
      io.to(`user_${user._id}`).emit('chatbot-response', {
        chatId: chat._id,
        message: botMessage,
        shouldEscalate,
      });

      // If escalated, notify admin room
      if (shouldEscalate) {
        io.to('admin_room').emit('new-escalated-chat', {
          chatId: chat._id,
          userId: user._id,
          userName: user.fullName,
          message: message,
          timestamp: new Date(),
        });
      }
    }

    res.json({
      success: true,
      chatId: chat._id,
      botMessage,
      userMessage,
      shouldEscalate,
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all escalated chats (Admin only)
exports.getEscalatedChats = async (req, res) => {
  try {
    const chats = await Chat.find({
      isSupportChat: true,
      supportStatus: { $in: ['open', 'assigned'] },
      category: 'escalated',
      isActive: true,
    })
      .populate('participants.userId', 'fullName email phoneNumber')
      .populate('supportAgentId', 'fullName email')
      .sort({ updatedAt: -1 });

    const chatsWithDetails = await Promise.all(chats.map(async (chat) => {
      const lastMessage = await Message.findOne({ chatId: chat._id })
        .sort({ createdAt: -1 })
        .populate('senderId', 'fullName');

      const unreadCount = await Message.countDocuments({
        chatId: chat._id,
        isRead: false,
      });

      const customer = chat.participants.find(p => p.userId.role !== 'admin');

      return {
        ...chat.toObject(),
        lastMessage,
        unreadCount,
        customer: customer?.userId || null,
      };
    }));

    res.json(chatsWithDetails);
  } catch (error) {
    console.error('Get escalated chats error:', error);
    res.status(500).json({ message: error.message });
  }
};