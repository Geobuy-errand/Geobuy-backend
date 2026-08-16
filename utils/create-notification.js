const Notification = require('../models/Notification.model');

/**
 * Create a notification for a user
 * @param {string} userId - The user ID to notify
 * @param {string} type - Notification type (must be in the enum)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data to store
 * @returns {Promise<Object>} The created notification
 */
const createNotification = async (userId, type, title, message, data = {}) => {
  try {
    // Validate that type is in the enum
    const validTypes = [
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
      'subscription_started',
      'subscription_active',
      'subscription_canceled',
      'subscription_expired',
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
      'commission_paid',
      'errand_cancelled'
    ];

    // If type is not in validTypes, use 'system' as fallback
    if (!validTypes.includes(type)) {
      console.warn(`⚠️ Unknown notification type: ${type}, using 'system' instead`);
      type = 'system';
    }

    const notification = new Notification({
      userId,
      type,
      title,
      message,
      data,
      isRead: false,
    });

    await notification.save();
    console.log('✅ Notification created:', notification._id);
    return notification;
  } catch (error) {
    console.error('❌ Create notification error:', error);
    // Don't throw - we don't want to fail the main operation
    return null;
  }
};

module.exports = createNotification;