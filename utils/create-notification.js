
const createNotification = async (userId, type, title, message, data) => {
    try {
      const Notification = require('../models/Notification.model');
      const notification = new Notification({
        userId,
        type,
        title,
        message,
        data,
      });
      await notification.save();
      return notification;
    } catch (error) {
      console.error('Create notification error:', error);
    }
  };

  module.exports = createNotification;