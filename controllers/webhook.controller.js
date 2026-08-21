const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Subscription = require("../models/Subscription.model");
const Payment = require("../models/Payment.model");
const Transaction = require("../models/Transaction.model");
const Errand = require("../models/Errand.model");
const User = require("../models/User.model");
const createNotification = require("../utils/create-notification");
const ConnectionModel = require("../models/Connection.model");

/**
 * Unified Stripe Webhook Handler
 * Handles all Stripe events in one place
 */

exports.handleWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('📦 Received Stripe webhook:', event.type);
    console.log('📦 Event ID:', event.id);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutSessionCompleted(session);
        break;
      }
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        await handleSubscriptionCreated(subscription);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        await handlePaymentIntentFailed(paymentIntent);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        await handleChargeRefunded(charge);
        break;
      }
      default: {
        console.log(`⚠️ Unhandled event type: ${event.type}`);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// SUBSCRIPTION HANDLERS
// ============================================================

async function handleSubscriptionCreated(subscription) {
  console.log("📋 Subscription created:", subscription.id);
  
  const stripeSubscriptionId = subscription.id;
  const customerId = subscription.customer;

  let subscriptionRecord = await Subscription.findOne({ stripeSubscriptionId });
  if (!subscriptionRecord) {
    subscriptionRecord = await Subscription.findOne({
      stripeCustomerId: customerId,
    });
  }

  if (!subscriptionRecord) {
    console.log("⚠️ No local subscription found for Customer:", customerId);
    return;
  }

  // ✅ FIX: Safely extract date values with fallbacks
  const startSeconds = subscription.current_period_start || subscription.start_date || subscription.created;
  const endSeconds = subscription.current_period_end || subscription.trial_end;

  // ✅ FIX: Only set dates if values exist
  if (startSeconds) {
    subscriptionRecord.currentPeriodStart = new Date(startSeconds * 1000);
  }
  if (endSeconds) {
    subscriptionRecord.currentPeriodEnd = new Date(endSeconds * 1000);
  }

  subscriptionRecord.stripeSubscriptionId = stripeSubscriptionId;
  subscriptionRecord.status = subscription.status;
  subscriptionRecord.cancelAtPeriodEnd = !!subscription.cancel_at_period_end;

  await subscriptionRecord.save();
  console.log("✅ Subscription handled cleanly:", subscriptionRecord._id);
}

async function handleSubscriptionUpdated(subscription) {
  console.log("📋 Subscription updated:", subscription.id);

  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (!subscriptionRecord) {
    console.log("⚠️ Subscription record not found for Stripe ID:", subscription.id);
    return;
  }

  // ✅ FIX: Safely extract and validate date values
  const startSeconds = subscription.current_period_start;
  const endSeconds = subscription.current_period_end;
  
  // ✅ FIX: Only update dates if they exist and are valid numbers
  if (startSeconds && typeof startSeconds === 'number' && !isNaN(startSeconds)) {
    subscriptionRecord.currentPeriodStart = new Date(startSeconds * 1000);
  }
  
  if (endSeconds && typeof endSeconds === 'number' && !isNaN(endSeconds)) {
    subscriptionRecord.currentPeriodEnd = new Date(endSeconds * 1000);
  }

  const previousStatus = subscriptionRecord.status;
  
  // Update status and other fields
  subscriptionRecord.status = subscription.status;
  subscriptionRecord.cancelAtPeriodEnd = !!subscription.cancel_at_period_end;

  await subscriptionRecord.save();
  console.log("✅ Subscription status sync complete:", subscriptionRecord._id);

  // If status changed to canceled, update user
  if (subscription.status === "canceled" && previousStatus !== "canceled") {
    await User.findByIdAndUpdate(subscriptionRecord.userId, {
      "subscription.isSubscribed": false,
      "subscription.subscriptionStatus": "canceled",
    });

    await createNotification(
      subscriptionRecord.userId,
      "subscription_canceled",
      "❌ Subscription Canceled",
      "Your subscription has been canceled.",
      { subscriptionId: subscriptionRecord._id }
    );
  }

  console.log("✅ Subscription updated:", subscriptionRecord._id);
}

async function handleSubscriptionDeleted(subscription) {
  console.log("🗑️ Subscription deleted:", subscription.id);

  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (!subscriptionRecord) {
    console.log("⚠️ Subscription record not found for Stripe ID:", subscription.id);
    return;
  }

  subscriptionRecord.status = "canceled";
  subscriptionRecord.canceledAt = new Date();
  await subscriptionRecord.save();

  await User.findByIdAndUpdate(subscriptionRecord.userId, {
    "subscription.isSubscribed": false,
    "subscription.subscriptionStatus": "canceled",
  });

  console.log("✅ Subscription marked as canceled:", subscriptionRecord._id);
}

// ============================================================
// INVOICE HANDLERS
// ============================================================

async function handleInvoicePaymentSucceeded(invoice) {
  console.log("💰 Invoice payment succeeded:", invoice.id);

  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription,
  });

  if (!subscriptionRecord) {
    console.log("⚠️ Subscription record not found for Stripe ID:", invoice.subscription);
    return;
  }

  // If status was trialing, activate it
  if (subscriptionRecord.status === "trialing") {
    subscriptionRecord.status = "active";
    await subscriptionRecord.save();

    await User.findByIdAndUpdate(subscriptionRecord.userId, {
      "subscription.subscriptionStatus": "active",
    });

    await createNotification(
      subscriptionRecord.userId,
      "subscription_active",
      "✅ Subscription Active",
      "Your subscription is now active! Enjoy the benefits.",
      { subscriptionId: subscriptionRecord._id }
    );

    console.log("✅ Subscription activated:", subscriptionRecord._id);
  }
}

async function handleInvoicePaymentFailed(invoice) {
  console.log("❌ Invoice payment failed:", invoice.id);

  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription,
  });

  if (!subscriptionRecord) {
    console.log("⚠️ Subscription record not found for Stripe ID:", invoice.subscription);
    return;
  }

  subscriptionRecord.status = "past_due";
  await subscriptionRecord.save();

  await createNotification(
    subscriptionRecord.userId,
    "payment_failed",
    "⚠️ Payment Failed",
    "We couldn't process your subscription payment. Please update your payment method.",
    { subscriptionId: subscriptionRecord._id }
  );

  console.log("⚠️ Subscription marked as past_due:", subscriptionRecord._id);
}

// ============================================================
// PAYMENT HANDLERS
// ============================================================

async function handleChargeRefunded(charge) {
  console.log("🔄 Charge refunded:", charge.id);

  const payment = await Payment.findOne({ paymentIntentId: charge.payment_intent });
  if (!payment) {
    console.log("⚠️ Payment record not found for charge:", charge.id);
    return;
  }

  payment.status = "refunded";
  payment.refundedAt = new Date();
  payment.refundAmount = charge.amount_refunded / 100;
  await payment.save();

  // Update errand
  if (payment.errandId) {
    await Errand.findByIdAndUpdate(payment.errandId, {
      paymentStatus: "refunded",
    });
  }

  // Create refund transaction
  const refundTransaction = new Transaction({
    userId: payment.customerId,
    type: "refund",
    amount: payment.amount,
    status: "completed",
    description: `Refund for errand #${payment.errandId || payment.bookingId}`,
    reference: charge.id,
    stripeTransactionId: charge.id,
    completedAt: new Date(),
  });
  await refundTransaction.save();

  await createNotification(
    payment.customerId,
    "payment_refunded",
    "💰 Payment Refunded",
    `Your payment of £${payment.amount.toFixed(2)} has been refunded`,
    { paymentId: payment._id, amount: payment.amount }
  );

  console.log("✅ Refund processed:", payment._id);
}

// dkjfkdafd


async function handleCheckoutSessionCompleted(session) {
  console.log('💰 Checkout session completed:', session.id);
  
  const metadata = session.metadata || {};
  const { paymentId, userId, type } = metadata;

  // Only process connection fee payments
  // if (type !== 'connection_fee') {
  //   console.log('📦 Not a connection fee payment, skipping...');
  //   return;
  // }

  if (!paymentId || !userId) {
    console.error('❌ Missing paymentId or userId in metadata');
    return;
  }

  // Find the payment record
  let payment = await Payment.findById(paymentId);
  if (!payment) {
    console.error('❌ Payment record not found:', paymentId);
    return;
  }

  // Check if already processed
  if (payment.status === 'succeeded') {
    console.log('✅ Payment already processed:', paymentId);
    return;
  }

  // Verify session payment status
  if (session.payment_status !== 'paid') {
    console.log('⚠️ Session payment status not paid:', session.payment_status);
    return;
  }

  // Update payment
  payment.status = 'succeeded';
  payment.stripePaymentIntentId = session.payment_intent;
  payment.paymentDate = new Date();
  await payment.save();

  // Create virtual connection record
  const connection = new ConnectionModel({
    userId: userId,
    fullName: metadata.userName || 'User',
    email: metadata.userEmail || '',
    phoneNumber: '',
    location: {
      type: 'Point',
      coordinates: [0, 0],
      address: '',
      town: '',
      postcode: '',
    },
    purpose: 'payment_only',
    status: 'completed',
    fee: {
      amount: payment.amount,
      currency: 'GBP',
      paid: true,
      paymentId: payment._id,
      paidAt: new Date(),
    },
    userHasPaidConnectionFee: true,
    userPaymentId: payment._id,
    userPaymentDate: new Date(),
    isActive: false,
    expiresAt: new Date(),
  });
  await connection.save();

  // Update user
  await User.findByIdAndUpdate(userId, {
    hasPaidConnectionFee: true,
    connectionFeePaidAt: new Date(),
    connectionFeePaymentId: payment._id,
  });

  // Send notification to user
  await createNotification(
    userId,
    'connection_fee_paid',
    '✅ Connection Fee Paid',
    `You have successfully paid the one-time connection fee of £${payment.amount.toFixed(2)}. You can now create unlimited connections.`,
    {
      paymentId: payment._id,
      connectionId: connection._id,
      amount: payment.amount,
    }
  );

  console.log('✅ Connection fee payment processed:', paymentId);
}

/**
 * Handle payment_intent.succeeded for connection fee
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log('💰 Payment succeeded:', paymentIntent.id);

  const metadata = paymentIntent.metadata || {};
  const { paymentId, type } = metadata;

  // Only process connection fee payments
  if (type !== 'connection_fee') {
    // Skip - this might be a regular booking payment
    // Your existing booking payment logic will handle it
    return;
  }

  if (!paymentId) {
    console.log('⚠️ No paymentId in metadata for connection fee');
    return;
  }

  // Find the payment record
  let payment = await Payment.findById(paymentId);
  if (!payment) {
    console.log('⚠️ Payment record not found for intent:', paymentIntent.id);
    return;
  }

  // Check if already processed
  if (payment.status === 'succeeded') {
    console.log('✅ Payment already processed:', paymentId);
    return;
  }

  // Update payment
  payment.status = 'succeeded';
  payment.stripePaymentIntentId = paymentIntent.id;
  payment.paymentDate = new Date();
  await payment.save();

  // Create virtual connection record
  const connection = new Connection({
    userId: payment.customerId,
    fullName: metadata.userName || 'User',
    email: metadata.userEmail || '',
    phoneNumber: '',
    location: {
      type: 'Point',
      coordinates: [0, 0],
      address: '',
      town: '',
      postcode: '',
    },
    purpose: 'payment_only',
    status: 'completed',
    fee: {
      amount: payment.amount,
      currency: 'GBP',
      paid: true,
      paymentId: payment._id,
      paidAt: new Date(),
    },
    userHasPaidConnectionFee: true,
    userPaymentId: payment._id,
    userPaymentDate: new Date(),
    isActive: false,
    expiresAt: new Date(),
  });
  await connection.save();

  // Update user
  await User.findByIdAndUpdate(payment.customerId, {
    hasPaidConnectionFee: true,
    connectionFeePaidAt: new Date(),
    connectionFeePaymentId: payment._id,
  });

  // Send notification
  await createNotification(
    payment.customerId,
    'connection_fee_paid',
    '✅ Connection Fee Paid',
    `You have successfully paid the one-time connection fee of £${payment.amount.toFixed(2)}.`,
    {
      paymentId: payment._id,
      connectionId: connection._id,
      amount: payment.amount,
    }
  );

  console.log('✅ Connection fee payment processed via webhook:', paymentId);
}

/**
 * Handle payment_intent.payment_failed for connection fee
 */
async function handlePaymentIntentFailed(paymentIntent) {
  console.log('❌ Payment failed:', paymentIntent.id);

  const metadata = paymentIntent.metadata || {};
  const { paymentId, type } = metadata;

  // Only process connection fee payments
  if (type !== 'connection_fee') {
    return;
  }

  if (!paymentId) {
    console.log('⚠️ No paymentId in metadata for connection fee');
    return;
  }

  const payment = await Payment.findById(paymentId);
  if (!payment) {
    console.log('⚠️ Payment record not found for intent:', paymentIntent.id);
    return;
  }

  payment.status = 'failed';
  payment.failedReason = paymentIntent.last_payment_error?.message || 'Payment failed';
  await payment.save();

  // Notify user
  await createNotification(
    payment.customerId,
    'payment_failed',
    '❌ Payment Failed',
    `Your connection fee payment of £${payment.amount.toFixed(2)} failed. Please try again.`,
    {
      paymentId: payment._id,
      error: payment.failedReason,
    }
  );

  console.log('⚠️ Connection fee payment marked as failed:', paymentId);
}