const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment.model');
const Booking = require('../models/Booking.model');
const User = require('../models/User.model');
const Wallet = require('../models/Wallet.model');
const Notification = require('../models/Notification.model');
const createNotification = require('../utils/create-notification');

// Create payment intent
exports.createPaymentIntent = async (req, res) => {
  try {
    const { errandId, bookingId } = req.body;
    
    let errand, booking, amount, providerId, customerId, serviceType;

    if (errandId) {
      errand = await Errand.findById(errandId);
      if (!errand) {
        return res.status(404).json({ message: 'Errand not found' });
      }
      amount = errand.total;
      providerId = errand.providerId;
      customerId = errand.customerId;
      serviceType = errand.serviceType;
    } else if (bookingId) {
      booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }
      amount = booking.estimatedPrice;
      providerId = booking.providerId;
      customerId = booking.customerId;
      serviceType = booking.serviceType;
    } else {
      return res.status(400).json({ message: 'Either errandId or bookingId is required' });
    }

    if (customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      errandId: errandId || null,
      bookingId: bookingId || null,
      status: { $in: ['pending', 'processing', 'succeeded'] },
    });

    if (existingPayment) {
      return res.status(400).json({ message: 'Payment already in progress' });
    }

    // Get provider's wallet for stripe account
    const providerWallet = await Wallet.findOne({ userId: providerId });
    const providerStripeAccount = providerWallet?.stripeAccountId;

    // Calculate fees
    const platformFee = Math.round(amount * 0.20 * 100) / 100; // 20%
    const providerAmount = Math.round(amount * 0.80 * 100) / 100; // 80%

    // Create payment record
    const payment = new Payment({
      errandId: errandId || null,
      bookingId: bookingId || null,
      customerId: req.user._id,
      providerId: providerId,
      amount: amount,
      platformFee: platformFee,
      providerAmount: providerAmount,
      status: 'pending',
      isEscrow: true,
      metadata: {
        serviceType: serviceType,
        errandDetails: errand ? {
          pickup: errand.pickup?.address,
          dropoff: errand.dropoff?.address,
          distance: errand.distance,
        } : null,
      },
    });

    await payment.save();

    // Create Stripe payment intent with destination payment
    const paymentIntentConfig = {
      amount: Math.round(amount * 100), // Convert to pence
      currency: 'gbp',
      metadata: {
        paymentId: payment._id.toString(),
        errandId: errandId || '',
        bookingId: bookingId || '',
        customerId: req.user._id.toString(),
        providerId: providerId.toString(),
        platformFee: platformFee.toString(),
        providerAmount: providerAmount.toString(),
      },
      capture_method: 'manual', // Hold funds in escrow
    };

    // If provider has a Stripe account, use destination payment
    if (providerStripeAccount) {
      paymentIntentConfig.transfer_data = {
        destination: providerStripeAccount,
        amount: Math.round(providerAmount * 100),
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentConfig);

    // Update payment with intent ID
    payment.paymentIntentId = paymentIntent.id;
    await payment.save();

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentId: payment._id,
      amount: amount,
      platformFee: platformFee,
      providerAmount: providerAmount,
    });

  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Confirm payment (release funds)
exports.releaseFunds = async (req, res) => {
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
};

// Confirm payment (by admin)
exports.confirmPayment = async (req, res) => {
  try {
    const { paymentId } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (payment.status === 'succeeded') {
      return res.status(400).json({ message: 'Payment already confirmed' });
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

    // Update errand payment status if applicable
    if (payment.errandId) {
      await Errand.findByIdAndUpdate(payment.errandId, {
        paymentStatus: 'paid',
        paymentId: payment._id,
      });
    }

    // Create transaction record for customer
    const customerTransaction = new Transaction({
      userId: payment.customerId,
      type: 'payment',
      amount: -payment.amount,
      status: 'completed',
      description: `Payment for ${payment.metadata?.serviceType || 'service'}`,
      reference: payment.paymentIntentId,
      completedAt: new Date(),
    });
    await customerTransaction.save();

    // Create transaction record for platform fee
    const platformTransaction = new Transaction({
      userId: null, // GEOBUY system
      type: 'fee',
      amount: payment.platformFee,
      status: 'completed',
      description: 'Platform fee',
      reference: payment.paymentIntentId,
      completedAt: new Date(),
    });
    await platformTransaction.save();

    // Notify customer
    await createNotification(
      payment.customerId,
      'payment_successful',
      'Payment Successful',
      `Your payment of £${payment.amount.toFixed(2)} has been confirmed`,
      { paymentId: payment._id }
    );

    // Notify provider that funds are in escrow
    if (payment.providerId) {
      await createNotification(
        payment.providerId,
        'payment_escrow',
        'Funds in Escrow',
        `£${payment.providerAmount.toFixed(2)} is held in escrow for your service`,
        { paymentId: payment._id }
      );
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${payment.customerId}`).emit('payment-confirmed', {
        paymentId: payment._id,
        amount: payment.amount,
        status: 'succeeded',
      });
      if (payment.providerId) {
        io.to(`user_${payment.providerId}`).emit('payment-escrow', {
          paymentId: payment._id,
          amount: payment.providerAmount,
        });
      }
      // Admin notification
      io.to('admin_room').emit('payment-confirmed', {
        paymentId: payment._id,
        amount: payment.amount,
        customerId: payment.customerId,
        providerId: payment.providerId,
        timestamp: new Date(),
      });
    }

    res.json({
      message: 'Payment confirmed successfully',
      payment,
    });

  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.releaseFundsToProvider = async (req, res) => {
  try {
    const { paymentId } = req.body;
    const user = req.user;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check authorization - only customer or admin can release
    if (payment.customerId.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (payment.status !== 'succeeded') {
      return res.status(400).json({ message: 'Payment not in succeeded state' });
    }

    if (payment.disbursementStatus === 'completed') {
      return res.status(400).json({ message: 'Funds already released' });
    }

    // Update payment
    payment.disbursementStatus = 'processing';
    await payment.save();

    // Get provider's wallet
    const providerWallet = await Wallet.findOne({ userId: payment.providerId });
    
    // If provider has Stripe Connect account, transfer via Stripe
    let transferSuccess = false;
    let transferId = null;

    if (providerWallet?.stripeAccountId) {
      try {
        // Create a transfer to the provider's Stripe account
        const transfer = await stripe.transfers.create({
          amount: Math.round(payment.providerAmount * 100),
          currency: 'gbp',
          destination: providerWallet.stripeAccountId,
          transfer_group: payment.paymentIntentId,
          metadata: {
            paymentId: payment._id.toString(),
            errandId: payment.errandId || '',
          },
        });
        transferId = transfer.id;
        transferSuccess = true;
      } catch (stripeError) {
        console.error('Stripe transfer error:', stripeError);
        // Fallback: Add to wallet balance
        transferSuccess = false;
      }
    }

    if (transferSuccess) {
      // Update wallet with transferred amount
      await Wallet.findOneAndUpdate(
        { userId: payment.providerId },
        {
          $inc: {
            balance: payment.providerAmount,
            totalEarned: payment.providerAmount,
          },
        }
      );

      payment.disbursementStatus = 'completed';
      payment.disbursementDate = new Date();
      payment.disbursementReference = transferId;
      await payment.save();

      // Create transaction record for provider payout
      const providerTransaction = new Transaction({
        userId: payment.providerId,
        type: 'payout',
        amount: payment.providerAmount,
        status: 'completed',
        description: `Payout for errand ${payment.errandId || ''}`,
        reference: transferId,
        stripeTransactionId: transferId,
        completedAt: new Date(),
      });
      await providerTransaction.save();

      // Notify provider
      await createNotification(
        payment.providerId,
        'payment_released',
        'Funds Released! 💰',
        `£${payment.providerAmount.toFixed(2)} has been added to your wallet`,
        { paymentId: payment._id, amount: payment.providerAmount }
      );

    } else {
      // Fallback: Add to wallet balance directly
      await Wallet.findOneAndUpdate(
        { userId: payment.providerId },
        {
          $inc: {
            balance: payment.providerAmount,
            totalEarned: payment.providerAmount,
          },
        }
      );

      payment.disbursementStatus = 'completed';
      payment.disbursementDate = new Date();
      payment.disbursementReference = `wallet-${Date.now()}`;
      await payment.save();

      // Create transaction record
      const providerTransaction = new Transaction({
        userId: payment.providerId,
        type: 'payout',
        amount: payment.providerAmount,
        status: 'completed',
        description: `Wallet payout for errand ${payment.errandId || ''}`,
        reference: `wallet-${Date.now()}`,
        completedAt: new Date(),
      });
      await providerTransaction.save();

      // Notify provider
      await createNotification(
        payment.providerId,
        'payment_released',
        'Funds Released! 💰',
        `£${payment.providerAmount.toFixed(2)} has been added to your wallet`,
        { paymentId: payment._id, amount: payment.providerAmount }
      );
    }

    // Update errand status if exists
    if (payment.errandId) {
      await Errand.findByIdAndUpdate(payment.errandId, {
        paymentStatus: 'released',
        paymentReleasedAt: new Date(),
      });
    }

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${payment.providerId}`).emit('funds-released', {
        paymentId: payment._id,
        amount: payment.providerAmount,
        timestamp: new Date(),
      });
      io.to(`user_${payment.customerId}`).emit('funds-released', {
        paymentId: payment._id,
        amount: payment.amount,
        timestamp: new Date(),
      });
      io.to('admin_room').emit('funds-released', {
        paymentId: payment._id,
        providerId: payment.providerId,
        amount: payment.providerAmount,
        timestamp: new Date(),
      });
    }

    res.json({
      message: 'Funds released successfully',
      payment,
      providerAmount: payment.providerAmount,
    });

  } catch (error) {
    console.error('Release funds error:', error);
    payment.disbursementStatus = 'failed';
    await payment.save();
    res.status(500).json({ message: error.message });
  }
};

// Get payment status with full details
exports.getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId)
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email phoneNumber');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check authorization
    if (payment.customerId._id.toString() !== req.user._id.toString() &&
        payment.providerId._id.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      paymentId: payment._id,
      amount: payment.amount,
      platformFee: payment.platformFee,
      providerAmount: payment.providerAmount,
      status: payment.status,
      disbursementStatus: payment.disbursementStatus,
      disbursementDate: payment.disbursementDate,
      createdAt: payment.createdAt,
      releasedAt: payment.releasedAt,
      customer: {
        id: payment.customerId._id,
        name: payment.customerId.fullName,
        email: payment.customerId.email,
      },
      provider: {
        id: payment.providerId._id,
        name: payment.providerId.fullName,
        email: payment.providerId.email,
        phone: payment.providerId.phoneNumber,
      },
      metadata: payment.metadata,
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Refund payment
exports.refundPayment = async (req, res) => {
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
};

// Get payment by booking
exports.getPaymentByBooking = async (req, res) => {
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
};

// Get payments for user
exports.getMyPayments = async (req, res) => {
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
};

// Get payment stats for admin
exports.getPaymentStats = async (req, res) => {
  try {
    const stats = await Payment.aggregate([
      {
        $facet: {
          totalRevenue: [
            { $match: { status: 'succeeded' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ],
          totalPlatformFee: [
            { $match: { status: 'succeeded' } },
            { $group: { _id: null, total: { $sum: '$platformFee' } } },
          ],
          totalProviderAmount: [
            { $match: { status: 'succeeded' } },
            { $group: { _id: null, total: { $sum: '$providerAmount' } } },
          ],
          pendingDisbursements: [
            { $match: { status: 'succeeded', disbursementStatus: 'pending' } },
            { $count: 'count' },
          ],
          todayRevenue: [
            {
              $match: {
                status: 'succeeded',
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ],
          thisMonthRevenue: [
            {
              $match: {
                status: 'succeeded',
                createdAt: {
                  $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ],
        },
      },
    ]);

    const result = stats[0];
    res.json({
      totalRevenue: result.totalRevenue[0]?.total || 0,
      totalPlatformFee: result.totalPlatformFee[0]?.total || 0,
      totalProviderAmount: result.totalProviderAmount[0]?.total || 0,
      pendingDisbursements: result.pendingDisbursements[0]?.count || 0,
      todayRevenue: result.todayRevenue[0]?.total || 0,
      thisMonthRevenue: result.thisMonthRevenue[0]?.total || 0,
    });

  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get payment by errand
exports.getPaymentByErrand = async (req, res) => {
  try {
    const payment = await Payment.findOne({ errandId: req.params.errandId })
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check authorization
    if (payment.customerId._id.toString() !== req.user._id.toString() &&
        payment.providerId._id.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all payments (admin)
exports.getAllPayments = async (req, res) => {
  try {
    const { status, disbursementStatus, startDate, endDate } = req.query;
    const query = {};

    if (status) query.status = status;
    if (disbursementStatus) query.disbursementStatus = disbursementStatus;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const payments = await Payment.find(query)
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};