const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Subscription = require('../models/Subscription.model');
const SubscriptionPlan = require('../models/SubscriptionPlan.model');
const Payment = require('../models/Payment.model');
const Transaction = require('../models/Transaction.model');
const Errand = require('../models/Errand.model');
const Booking = require('../models/Booking.model');
const Wallet = require('../models/Wallet.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');

/**
 * Unified Stripe Webhook Handler
 * Handles all Stripe events in one place
 */
exports.handleWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('📦 Received Stripe webhook:', event.type);
    console.log('📦 Event ID:', event.id);

    // Route to appropriate handler based on event type
    switch (event.type) {
      // ========== SUBSCRIPTION EVENTS ==========
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      // ========== INVOICE EVENTS ==========
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      
      // ========== PAYMENT EVENTS ==========
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      
      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// SUBSCRIPTION HANDLERS
// ============================================================

async function handleCheckoutSessionCompleted(session) {
  console.log('💰 Checkout session completed:', session.id);
  
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  if (!userId || !planId) {
    console.error('❌ Missing userId or planId in session metadata');
    console.log('📦 Metadata:', session.metadata);
    return;
  }

  // Get plan from database
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) {
    console.error('❌ Plan not found:', planId);
    return;
  }

  // Find or create subscription record
  let subscription = await Subscription.findOne({ userId });

  if (!subscription) {
    subscription = new Subscription({
      userId,
      plan: planId,
    });
  }

  // Update subscription with Stripe data
  subscription.stripeCustomerId = session.customer;
  subscription.stripeSubscriptionId = session.subscription;
  subscription.stripePriceId = session.line_items?.data[0]?.price?.id || plan.stripePriceId;
  subscription.status = 'trialing';
  subscription.currentPeriodStart = new Date();
  subscription.currentPeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  subscription.trialStart = new Date();
  subscription.trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  subscription.features = plan.features || {};
  subscription.metadata = {
    stripeSessionId: session.id,
    ...session.metadata,
  };

  await subscription.save();
  console.log('✅ Subscription saved:', subscription._id);

  // Update user
  await User.findByIdAndUpdate(userId, {
    'subscription.isSubscribed': true,
    'subscription.subscriptionStatus': 'trialing',
    'subscription.subscriptionPlan': plan.name,
    'subscription.subscriptionId': subscription._id,
    'subscription.stripeCustomerId': session.customer,
  });

  // Create notification
  await createNotification(
    userId,
    'subscription_started',
    '🎉 Subscription Started',
    `Your ${plan.name} plan trial has started! You have 7 days free.`,
    { planId, subscriptionId: subscription._id }
  );

  console.log('✅ Subscription activated for user:', userId);
}

async function handleSubscriptionCreated(subscription) {
  console.log('📋 Subscription created:', subscription.id);
  
  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (!subscriptionRecord) {
    console.log('⚠️ Subscription record not found for Stripe ID:', subscription.id);
    return;
  }

  subscriptionRecord.status = subscription.status;
  subscriptionRecord.currentPeriodStart = new Date(subscription.current_period_start * 1000);
  subscriptionRecord.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  subscriptionRecord.cancelAtPeriodEnd = subscription.cancel_at_period_end;

  await subscriptionRecord.save();
  console.log('✅ Subscription updated:', subscriptionRecord._id);
}

async function handleSubscriptionUpdated(subscription) {
  console.log('📋 Subscription updated:', subscription.id);
  
  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (!subscriptionRecord) {
    console.log('⚠️ Subscription record not found for Stripe ID:', subscription.id);
    return;
  }

  const previousStatus = subscriptionRecord.status;
  
  subscriptionRecord.status = subscription.status;
  subscriptionRecord.currentPeriodStart = new Date(subscription.current_period_start * 1000);
  subscriptionRecord.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  subscriptionRecord.cancelAtPeriodEnd = subscription.cancel_at_period_end;

  await subscriptionRecord.save();

  // If status changed to canceled, update user
  if (subscription.status === 'canceled' && previousStatus !== 'canceled') {
    await User.findByIdAndUpdate(subscriptionRecord.userId, {
      'subscription.isSubscribed': false,
      'subscription.subscriptionStatus': 'canceled',
    });
    
    await createNotification(
      subscriptionRecord.userId,
      'subscription_canceled',
      '❌ Subscription Canceled',
      'Your subscription has been canceled.',
      { subscriptionId: subscriptionRecord._id }
    );
  }

  console.log('✅ Subscription updated:', subscriptionRecord._id);
}

async function handleSubscriptionDeleted(subscription) {
  console.log('🗑️ Subscription deleted:', subscription.id);
  
  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (!subscriptionRecord) {
    console.log('⚠️ Subscription record not found for Stripe ID:', subscription.id);
    return;
  }

  subscriptionRecord.status = 'canceled';
  subscriptionRecord.canceledAt = new Date();
  await subscriptionRecord.save();

  await User.findByIdAndUpdate(subscriptionRecord.userId, {
    'subscription.isSubscribed': false,
    'subscription.subscriptionStatus': 'canceled',
  });

  console.log('✅ Subscription marked as canceled:', subscriptionRecord._id);
}

// ============================================================
// INVOICE HANDLERS
// ============================================================

async function handleInvoicePaymentSucceeded(invoice) {
  console.log('💰 Invoice payment succeeded:', invoice.id);
  
  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription,
  });

  if (!subscriptionRecord) {
    console.log('⚠️ Subscription record not found for Stripe ID:', invoice.subscription);
    return;
  }

  // If status was trialing, activate it
  if (subscriptionRecord.status === 'trialing') {
    subscriptionRecord.status = 'active';
    await subscriptionRecord.save();

    await User.findByIdAndUpdate(subscriptionRecord.userId, {
      'subscription.subscriptionStatus': 'active',
    });

    await createNotification(
      subscriptionRecord.userId,
      'subscription_active',
      '✅ Subscription Active',
      'Your subscription is now active! Enjoy the benefits.',
      { subscriptionId: subscriptionRecord._id }
    );

    console.log('✅ Subscription activated:', subscriptionRecord._id);
  }
}

async function handleInvoicePaymentFailed(invoice) {
  console.log('❌ Invoice payment failed:', invoice.id);
  
  const subscriptionRecord = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription,
  });

  if (!subscriptionRecord) {
    console.log('⚠️ Subscription record not found for Stripe ID:', invoice.subscription);
    return;
  }

  subscriptionRecord.status = 'past_due';
  await subscriptionRecord.save();

  await createNotification(
    subscriptionRecord.userId,
    'payment_failed',
    '⚠️ Payment Failed',
    'We couldn\'t process your subscription payment. Please update your payment method.',
    { subscriptionId: subscriptionRecord._id }
  );

  console.log('⚠️ Subscription marked as past_due:', subscriptionRecord._id);
}

// ============================================================
// PAYMENT HANDLERS
// ============================================================

async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log('💰 Payment succeeded:', paymentIntent.id);
  
  const metadata = paymentIntent.metadata || {};
  const { errandId, bookingId, paymentId, providerId, customerId } = metadata;

  // Find the payment record
  let payment = await Payment.findById(paymentId);
  if (!payment) {
    payment = await Payment.findOne({ paymentIntentId: paymentIntent.id });
  }

  if (!payment) {
    console.log('⚠️ Payment record not found for intent:', paymentIntent.id);
    return;
  }

  // Update payment status
  payment.status = 'succeeded';
  payment.releasedAt = new Date();
  payment.stripePaymentIntentId = paymentIntent.id;
  await payment.save();

  // Create transaction record
  const transaction = new Transaction({
    userId: payment.customerId,
    type: 'payment',
    amount: -payment.amount,
    status: 'completed',
    description: `Payment for errand #${payment.errandId || payment.bookingId}`,
    reference: paymentIntent.id,
    stripeTransactionId: paymentIntent.id,
    metadata: {
      paymentId: payment._id,
      errandId: payment.errandId,
      bookingId: payment.bookingId,
    },
    completedAt: new Date(),
  });
  await transaction.save();

  // Update errand payment status
  if (payment.errandId) {
    await Errand.findByIdAndUpdate(payment.errandId, {
      paymentStatus: 'paid',
      paymentId: payment._id,
      paymentIntentId: paymentIntent.id,
    });
  }

  // Notify customer
  await createNotification(
    payment.customerId,
    'payment_successful',
    '💳 Payment Successful',
    `Your payment of £${payment.amount.toFixed(2)} has been confirmed`,
    { paymentId: payment._id, errandId: payment.errandId }
  );

  // Notify provider that funds are in escrow
  if (payment.providerId) {
    await createNotification(
      payment.providerId,
      'payment_escrow',
      '🔒 Funds in Escrow',
      `£${payment.providerAmount.toFixed(2)} is held in escrow for your service`,
      { paymentId: payment._id, amount: payment.providerAmount }
    );
  }

  console.log('✅ Payment processed:', payment._id);
}

async function handlePaymentIntentFailed(paymentIntent) {
  console.log('❌ Payment failed:', paymentIntent.id);
  
  const payment = await Payment.findOne({ paymentIntentId: paymentIntent.id });
  if (!payment) {
    console.log('⚠️ Payment record not found for intent:', paymentIntent.id);
    return;
  }

  payment.status = 'failed';
  await payment.save();

  await createNotification(
    payment.customerId,
    'payment_failed',
    '❌ Payment Failed',
    `Your payment of £${payment.amount.toFixed(2)} could not be processed. Please try again.`,
    { paymentId: payment._id, error: paymentIntent.last_payment_error?.message }
  );

  console.log('⚠️ Payment marked as failed:', payment._id);
}

async function handleChargeRefunded(charge) {
  console.log('🔄 Charge refunded:', charge.id);
  
  const payment = await Payment.findOne({ paymentIntentId: charge.payment_intent });
  if (!payment) {
    console.log('⚠️ Payment record not found for charge:', charge.id);
    return;
  }

  payment.status = 'refunded';
  payment.refundedAt = new Date();
  payment.refundAmount = charge.amount_refunded / 100;
  await payment.save();

  // Update errand
  if (payment.errandId) {
    await Errand.findByIdAndUpdate(payment.errandId, {
      paymentStatus: 'refunded',
    });
  }

  // Create refund transaction
  const refundTransaction = new Transaction({
    userId: payment.customerId,
    type: 'refund',
    amount: payment.amount,
    status: 'completed',
    description: `Refund for errand #${payment.errandId || payment.bookingId}`,
    reference: charge.id,
    stripeTransactionId: charge.id,
    completedAt: new Date(),
  });
  await refundTransaction.save();

  await createNotification(
    payment.customerId,
    'payment_refunded',
    '💰 Payment Refunded',
    `Your payment of £${payment.amount.toFixed(2)} has been refunded`,
    { paymentId: payment._id, amount: payment.amount }
  );

  console.log('✅ Refund processed:', payment._id);
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function createNotification(userId, type, title, message, data) {
  try {
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      data,
    });
    await notification.save();
    console.log('📧 Notification created:', notification._id);
    return notification;
  } catch (error) {
    console.error('❌ Create notification error:', error);
    return null;
  }
}