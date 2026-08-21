const express = require('express');

const router = express.Router();

const authRoutes = require('./auth.route');
const userRoutes = require('./user.route');
const bookingRoutes = require('./booking.route');
const paymentRoutes = require('./payment.route');
const messageRoutes = require('./message.route');
const notificationRoutes = require('./notification.route');
const reviewRoutes = require('./review.route');
const serviceRoutes = require('./service.route');
const walletRoutes = require('./wallet.route');
const adminRoutes = require('./admin.route');
const uploadRoutes = require('./upload.route');
const errandRoutes = require('./errand.route');
const verificationRoutes = require('./verification.route');
const commissionRoutes = require('./commission.route');
const qrRoutes = require('./qrCode.route');
const chatRoutes = require('./chat.route');
const chatbotRoutes = require('./chatbot.route');
const subscriptionRoutes = require('./subscription.route');
const subscriptionPlanRoutes = require('./subscription.plan.route');
const settingsRoutes = require('./setting.route');
const seedRoutes = require('./seed.route');
const connectionRoutes = require('./connection.route');

// Routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/messages', messageRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reviews', reviewRoutes);
router.use('/wallet', walletRoutes);
router.use('/admin', adminRoutes);
router.use('/upload', uploadRoutes);
router.use('/errands', errandRoutes);
router.use('/services', serviceRoutes);
router.use('/verifications', verificationRoutes);
router.use('/commissions', commissionRoutes);
router.use('/qr', qrRoutes);
router.use('/chats', chatRoutes);
router.use('/chatbot', chatbotRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/subscription-plans', subscriptionPlanRoutes);
router.use('/settings', settingsRoutes);
router.use('/connections', connectionRoutes);
router.use('/seed', seedRoutes);

module.exports = router;