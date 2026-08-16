const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'booking_created',
        'booking_accepted',
        'booking_in_progress',
        'booking_completed',
        'booking_cancelled',
        'payment_successful',
        'payment_released',
        'payment_failed',
        'new_message',
        'new_offer',
        'provider_verified',
        'provider_rejected',
        'review_received',
        'withdrawal_processed',
        'system',
        // ✅ ADD SUBSCRIPTION TYPES
        'subscription_started',
        'subscription_active',
        'subscription_canceled',
        'subscription_expired',
        'payment_failed',
        'quote_countered',
        'quote_accepted',
        'new_support_request',
        'chat_created',
        'chat_escalated',
        'support_assigned',
        'support_closed',
        'document_uploaded',
        'errand_status_updated',
        'pickup_verified',
        'delivery_verified',
        'qr_code_scanned',
        'request_completed',
        'request_cancelled',
        'funds_released',
        'commission_generated',
        'new_service_request',
        'commission_paid',
        'service_request_created',
        'service_request_quote',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: Date,
    isEmailSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notification', notificationSchema);