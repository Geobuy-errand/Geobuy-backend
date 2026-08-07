const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        lastReadAt: {
          type: Date,
          default: Date.now,
        },
        isTyping: {
          type: Boolean,
          default: false,
        },
      }
    ],
    lastMessage: {
      content: String,
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      sentAt: {
        type: Date,
        default: Date.now,
      },
    },
    // For errand/booking specific chats
    errandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Errand',
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    // For support chats
    isSupportChat: {
      type: Boolean,
      default: false,
    },
    supportAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    supportStatus: {
      type: String,
      enum: ['open', 'assigned', 'resolved', 'closed'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    category: {
      type: String,
      enum: ['general', 'payment', 'technical', 'dispute', 'other'],
      default: 'general',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
chatSchema.index({ participants: 1 });
chatSchema.index({ errandId: 1 });
chatSchema.index({ bookingId: 1 });
chatSchema.index({ isSupportChat: 1 });

module.exports = mongoose.model('Chat', chatSchema);