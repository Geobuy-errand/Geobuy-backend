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
    // Use the model's own enum so the two lists can never drift apart.
    const validTypes = Notification.schema.path('type').enumValues;

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