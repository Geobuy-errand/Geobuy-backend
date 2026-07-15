const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment.model');
const Booking = require('../models/Booking.model');
const User = require('../models/User.model');
const Wallet = require('../models/wallet.model');
const Notification = require('../models/Notification.model');
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');

// Create payment intent
router.post('/create-payment-intent', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Booking already paid' });
    }

    // Calculate fees (platform fee 10%)
    const platformFee = Math.round(booking.estimatedPrice * 0.1);
    const providerAmount = booking.estimatedPrice - platformFee;

    // Create payment record
    const payment = new Payment({
      bookingId: booking._id,
      customerId: req.user._id,
      providerId: booking.providerId,
      amount: booking.estimatedPrice,
      platformFee,
      providerAmount,
      status: 'pending',
      isEscrow: true,
    });

    await payment.save();

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.estimatedPrice * 100), // Convert to cents/pence
      currency: 'gbp',
      metadata: {
        bookingId: booking._id.toString(),
        paymentId: payment._id.toString(),
        customerId: req.user._id.toString(),
      },
      capture_method: 'manual', // Use manual capture for escrow
    });

    // Update payment with intent ID
    payment.paymentIntentId = paymentIntent.id;
    await payment.save();

    // Update booking with payment intent
    booking.paymentIntentId = paymentIntent.id;
    await booking.save();

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentId: payment._id,
      amount: booking.estimatedPrice,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Confirm payment (release funds)
router.post('/release-funds', authMiddleware, requireRole('customer'), async (req, res) => {
  try {
    const { paymentId } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (payment.status !== 'processing') {
      return res.status(400).json({ message: 'Payment is not in processing state' });
    }

    // Capture the payment
    const paymentIntent = await stripe.paymentIntents.capture(payment.paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ message: 'Payment capture failed' });
    }

    // Update payment status
    payment.status = 'succeeded';
    payment.releasedAt = new Date();
    await payment.save();

    // Update booking payment status
    const booking = await Booking.findById(payment.bookingId);
    booking.paymentStatus = 'paid';
    await booking.save();

    // Credit provider's wallet
    const wallet = await Wallet.findOne({ userId: payment.providerId });
    if (wallet) {
      wallet.balance += payment.providerAmount;
      wallet.totalEarned += payment.providerAmount;
      await wallet.save();
    }

    // Create notification for provider
    const notification = new Notification({
      userId: payment.providerId,
      type: 'payment_released',
      title: 'Payment Released',
      message: `£${payment.providerAmount.toFixed(2)} has been added to your wallet`,
      data: { paymentId: payment._id, amount: payment.providerAmount },
    });
    await notification.save();

    // Notify customer
    const customerNotification = new Notification({
      userId: payment.customerId,
      type: 'payment_successful',
      title: 'Payment Successful',
      message: `Payment of £${payment.amount.toFixed(2)} has been processed`,
      data: { paymentId: payment._id, amount: payment.amount },
    });
    await customerNotification.save();

    res.json({
      message: 'Payment released successfully',
      payment,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Confirm payment (by admin)
router.post('/admin/confirm-payment', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { paymentId } = req.body;
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({ message: 'Payment is not pending' });
    }

    payment.status = 'succeeded';
    payment.releasedAt = new Date();
    await payment.save();

    const booking = await Booking.findById(payment.bookingId);
    booking.paymentStatus = 'paid';
    await booking.save();

    // Credit provider's wallet
    const wallet = await Wallet.findOne({ userId: payment.providerId });
    if (wallet) {
      wallet.balance += payment.providerAmount;
      wallet.totalEarned += payment.providerAmount;
      await wallet.save();
    }

    res.json({
      message: 'Payment confirmed and released',
      payment,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Refund payment
router.post('/refund', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { paymentId, reason } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status !== 'succeeded' && payment.status !== 'processing') {
      return res.status(400).json({ message: 'Payment cannot be refunded' });
    }

    // Create refund
    const refund = await stripe.refunds.create({
      payment_intent: payment.paymentIntentId,
    });

    payment.status = 'refunded';
    payment.refundedAt = new Date();
    payment.refundAmount = payment.amount;
    payment.refundReason = reason;
    await payment.save();

    // Update booking
    const booking = await Booking.findById(payment.bookingId);
    booking.paymentStatus = 'refunded';
    await booking.save();

    // Deduct from provider's wallet if already paid
    const wallet = await Wallet.findOne({ userId: payment.providerId });
    if (wallet && wallet.balance >= payment.providerAmount) {
      wallet.balance -= payment.providerAmount;
      await wallet.save();
    }

    res.json({
      message: 'Payment refunded successfully',
      payment,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get payment by booking
router.get('/booking/:bookingId', authMiddleware, async (req, res) => {
  try {
    const payment = await Payment.findOne({ bookingId: req.params.bookingId });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check authorization
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (req.user.role !== 'admin' &&
        booking.customerId.toString() !== req.user._id.toString() &&
        booking.providerId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get payments for user
router.get('/my-payments', authMiddleware, async (req, res) => {
  try {
    const query = req.user.role === 'customer'
      ? { customerId: req.user._id }
      : { providerId: req.user._id };

    const payments = await Payment.find(query)
      .populate('bookingId', 'bookingId serviceType date status')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;