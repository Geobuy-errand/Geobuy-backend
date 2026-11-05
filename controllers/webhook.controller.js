const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const SubscriptionPlan = require("../models/SubscriptionPlan.model");
const { formatMoney, fromMinorUnits } = require("../utils/money");

// Lazily required to avoid a circular import with payment.controller
const paymentController = () => require("./payment.controller");
const Subscription = require("../models/Subscription.model");
const Payment = require("../models/Payment.model");
const Transaction = require("../models/Transaction.model");
const Errand = require("../models/Errand.model");
const User = require("../models/User.model");
const Wallet = require("../models/Wallet.model");
const createNotification = require("../utils/create-notification");
const ConnectionModel = require("../models/Connection.model");
const { sendTemplateEmail, paymentTemplates } = require('../utils/email-templates');

/**
 * Unified Stripe Webhook Handler
 * Handles all Stripe events in one place
 */

exports.handleWebhook = async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not set");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("📦 Received Stripe webhook:", event.type);
    console.log("📦 Event ID:", event.id);

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await handleCheckoutSessionCompleted(session);
        break;
      }
      case "customer.subscription.created": {
        const subscription = event.data.object;
        await handleSubscriptionCreated(subscription);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        await handlePaymentIntentFailed(paymentIntent);
        break;
      }
      case "charge.refunded": {
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
    console.error("Webhook error:", error);
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

  const startSeconds =
    subscription.current_period_start ||
    subscription.start_date ||
    subscription.created;
  const endSeconds = subscription.current_period_end || subscription.trial_end;

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
    console.log(
      "⚠️ Subscription record not found for Stripe ID:",
      subscription.id
    );
    return;
  }

  const startSeconds = subscription.current_period_start;
  const endSeconds = subscription.current_period_end;

  if (
    startSeconds &&
    typeof startSeconds === "number" &&
    !isNaN(startSeconds)
  ) {
    subscriptionRecord.currentPeriodStart = new Date(startSeconds * 1000);
  }

  if (endSeconds && typeof endSeconds === "number" && !isNaN(endSeconds)) {
    subscriptionRecord.currentPeriodEnd = new Date(endSeconds * 1000);
  }

  const previousStatus = subscriptionRecord.status;

  subscriptionRecord.status = subscription.status;
  subscriptionRecord.cancelAtPeriodEnd = !!subscription.cancel_at_period_end;

  await subscriptionRecord.save();
  console.log("✅ Subscription status sync complete:", subscriptionRecord._id);

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
    console.log(
      "⚠️ Subscription record not found for Stripe ID:",
      subscription.id
    );
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
    console.log(
      "⚠️ Subscription record not found for Stripe ID:",
      invoice.subscription
    );
    return;
  }

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
    console.log(
      "⚠️ Subscription record not found for Stripe ID:",
      invoice.subscription
    );
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
// PAYMENT HANDLERS - UPDATED FOR ERRAND PAYMENTS
// ============================================================

/**
 * Handle payment_intent.succeeded - NOW HANDLES BOTH CONNECTION FEE AND ERRAND PAYMENTS
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log("💰 Payment intent succeeded:", paymentIntent.id);

  const metadata = paymentIntent.metadata || {};
  const { paymentId, type, errandId } = metadata;

  if (!paymentId) {
    console.log("⚠️ No paymentId in metadata");
    return;
  }

  // Find the payment record
  let payment = await Payment.findById(paymentId);
  if (!payment) {
    console.log("⚠️ Payment record not found for intent:", paymentIntent.id);
    return;
  }

  // Errand and connection-fee payments are handled by the same idempotent
  // code path as the browser "verify" call and checkout.session.completed.
  if (["errand", "connection_fee"].includes(payment.type) || type === "errand" || type === "connection_fee") {
    await paymentController().applyVerifiedPayment(payment, {
      paid: true,
      amount: fromMinorUnits(paymentIntent.amount_received ?? paymentIntent.amount, paymentIntent.currency),
      currency: String(paymentIntent.currency || "gbp").toUpperCase(),
      paymentIntentId: paymentIntent.id,
      reference: paymentIntent.id,
    });
    return;
  }

  // Check if already processed
  if (payment.status === "succeeded") {
    console.log("✅ Payment already processed:", paymentId);
    return;
  }

  // Update payment status
  payment.status = "succeeded";
  payment.stripePaymentIntentId = paymentIntent.id;
  payment.paymentDate = new Date();
  await payment.save();

  // ============================================================
  // HANDLE CONNECTION FEE PAYMENT
  // ============================================================
  if (type === "connection_fee") {
    // Update user
    await User.findByIdAndUpdate(payment.customerId, {
      hasPaidConnectionFee: true,
      connectionFeePaidAt: new Date(),
      connectionFeePaymentId: payment._id,
    });

    const connection = await ConnectionModel.findOne({
      userId: payment.customerId,
    });

    // Send notification
    await createNotification(
      payment.customerId,
      "connection_fee_paid",
      "✅ Connection Fee Paid",
      `You have successfully paid the one-time connection fee of ${formatMoney(payment.amount, payment.currency)}.`,
      {
        paymentId: payment._id,
        connectionId: connection?._id,
        amount: payment.amount,
      }
    );

    console.log("✅ Connection fee payment processed via webhook:", paymentId);
    return;
  }

  // ============================================================
  // HANDLE ERRAND PAYMENT
  // ============================================================
  if (type === "errand" || errandId) {
    const errand = await Errand.findById(errandId || payment.errandId);
    if (errand) {
      // Update errand payment status
      errand.paymentStatus = "paid";
      errand.paymentId = payment._id;
      errand.paymentIntentId = paymentIntent.id;
      await errand.save();

      // Create transaction record
      const transaction = new Transaction({
        userId: payment.customerId,
        type: "payment",
        amount: -payment.amount,
        status: "completed",
        description: `Payment for errand #${errand.errandId}`,
        reference: paymentIntent.id,
        stripeTransactionId: paymentIntent.id,
        metadata: {
          paymentId: payment._id,
          errandId: errand._id,
        },
        completedAt: new Date(),
      });
      await transaction.save();

      // Send email to customer
      const customer = await User.findById(payment.customerId);
      if (customer) {
        await sendTemplateEmail(
          customer.email,
          paymentTemplates.paymentSuccessful(
            customer.fullName,
            payment.amount,
            "Errand runs",
            paymentIntent.id
          ).subject,
          paymentTemplates.paymentSuccessful(
            customer.fullName,
            payment.amount,
            "Errand runs",
            paymentIntent.id
          ).title,
          paymentTemplates.paymentSuccessful(
            customer.fullName,
            payment.amount,
            "Errand runs",
            paymentIntent.id
          ).content,
          paymentTemplates.paymentSuccessful(
            customer.fullName,
            payment.amount,
            "Errand runs",
            paymentIntent.id
          ).button
        );
      }

      // Notify customer
      await createNotification(
        payment.customerId,
        "payment_successful",
        "💰 Payment Successful",
        `Your payment of ${formatMoney(payment.amount, payment?.currency || "GBP")} for errand #${errand.errandId} has been confirmed.`,
        {
          paymentId: payment._id,
          errandId: errand._id,
          amount: payment.amount,
        }
      );

      // Find and notify nearby providers that payment is now confirmed
      const providers = await User.find({
        role: "provider",
        isActive: true,
        isAvailable: true,
        verificationStatus: "approved",
      }).limit(20);

      // Notify providers via socket
      const io = null; // no request object inside a webhook handler (was a ReferenceError)
      if (io) {
        for (const provider of providers) {
          // Check if this provider was matched to this errand
          const isMatched = errand.matchedProviders?.some(
            mp => mp.providerId.toString() === provider._id.toString()
          );
          
          if (isMatched) {
            io.to(`user_${provider._id}`).emit('payment-confirmed', {
              errandId: errand._id,
              errandId: errand.errandId,
              amount: payment.amount,
            });
          }
        }
      }

      // Notify providers via notification
      for (const provider of providers) {
        const isMatched = errand.matchedProviders?.some(
          mp => mp.providerId.toString() === provider._id.toString()
        );
        
        if (isMatched) {
          await createNotification(
            provider._id,
            "payment_confirmed",
            "💰 Payment Confirmed",
            `Payment confirmed for errand #${errand.errandId}. You can now accept this job.`,
            {
              errandId: errand._id,
              amount: payment.amount,
            }
          );
        }
      }

      console.log("✅ Errand payment processed via webhook:", paymentId);
    }
  }
}

/**
 * Handle payment_intent.payment_failed - UPDATED FOR ERRAND PAYMENTS
 */
async function handlePaymentIntentFailed(paymentIntent) {
  console.log("❌ Payment failed:", paymentIntent.id);

  const metadata = paymentIntent.metadata || {};
  const { paymentId, type } = metadata;

  if (!paymentId) {
    console.log("⚠️ No paymentId in metadata");
    return;
  }

  const payment = await Payment.findById(paymentId);
  if (!payment) {
    console.log("⚠️ Payment record not found for intent:", paymentIntent.id);
    return;
  }

  payment.status = "failed";
  payment.failedReason =
    paymentIntent.last_payment_error?.message || "Payment failed";
  await payment.save();

  // Notify user
  let notificationMessage = `Your payment of ${formatMoney(payment.amount, payment?.currency || "GBP")} failed. Please try again.`;
  
  if (payment.type === "connection_fee") {
    notificationMessage = `Your connection fee payment of ${formatMoney(payment.amount, payment?.currency || "GBP")} failed. Please try again.`;
  } else {
    notificationMessage = `Your payment of ${formatMoney(payment.amount, payment?.currency || "GBP")} for errand failed. Please try again.`;
  }

  await createNotification(
    payment.customerId,
    "payment_failed",
    "❌ Payment Failed",
    notificationMessage,
    {
      paymentId: payment._id,
      error: payment.failedReason,
    }
  );

  console.log("⚠️ Payment marked as failed:", paymentId);
}

async function handleChargeRefunded(charge) {
  console.log("🔄 Charge refunded:", charge.id);

  const payment = await Payment.findOne({
    paymentIntentId: charge.payment_intent,
  });
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
    `Your payment of ${formatMoney(payment.amount, payment?.currency || "GBP")} has been refunded`,
    { paymentId: payment._id, amount: payment.amount }
  );

  console.log("✅ Refund processed:", payment._id);
}

// ============================================================
// CHECKOUT SESSION HANDLER - For Connection Fee
// ============================================================

async function handleCheckoutSessionCompleted(session) {
  console.log("💰 Checkout session completed:", session.id);
  const metadata = session.metadata || {};

  // ---- Subscriptions (mode=subscription) ----
  if (session.mode === "subscription") {
    await activateStripeSubscription(session);
    return;
  }

  // ---- One-off payments (errands, connection fee) ----
  const { paymentId } = metadata;
  let payment = paymentId ? await Payment.findById(paymentId) : null;
  if (!payment) payment = await Payment.findOne({ $or: [{ reference: session.id }, { stripeSessionId: session.id }] });
  if (!payment) {
    console.error("❌ Payment record not found for session:", session.id);
    return;
  }

  if (session.payment_status !== "paid") {
    console.log("⚠️ Session payment status not paid:", session.payment_status);
    return;
  }

  await paymentController().applyVerifiedPayment(payment, {
    paid: true,
    amount: fromMinorUnits(session.amount_total, session.currency),
    currency: String(session.currency || "gbp").toUpperCase(),
    paymentIntentId: session.payment_intent,
    reference: session.id,
  });
}

/** Create/update the local subscription when a Stripe subscription checkout completes. */
async function activateStripeSubscription(session) {
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;
  if (!userId || !planId) {
    console.error("❌ Missing userId or planId in subscription session metadata");
    return;
  }
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) return console.error("❌ Plan not found:", planId);

  let periodStart = new Date();
  let periodEnd = new Date(Date.now() + (plan.interval === "year" ? 365 : 30) * 24 * 60 * 60 * 1000);
  let status = "active";
  if (session.subscription) {
    try {
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      status = sub.status === "trialing" ? "trialing" : sub.status === "active" ? "active" : sub.status;
      const start = sub.current_period_start || sub.items?.data?.[0]?.current_period_start;
      const end = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
      if (start) periodStart = new Date(start * 1000);
      if (end) periodEnd = new Date(end * 1000);
    } catch (e) {
      console.warn("Could not retrieve Stripe subscription:", e.message);
    }
  }

  const record = await Subscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        plan: planId,
        gateway: "stripe",
        country: "GB",
        currency: "GBP",
        amount: plan.price,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        stripePriceId: plan.stripePriceId,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        features: plan.features || {},
        metadata: { stripeSessionId: session.id },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.findByIdAndUpdate(userId, {
    "subscription.isSubscribed": true,
    "subscription.subscriptionStatus": status,
    "subscription.subscriptionPlan": plan.name,
    "subscription.subscriptionId": String(record._id),
    "subscription.stripeCustomerId": session.customer,
    "subscription.gateway": "stripe",
    "subscription.subscribedAt": new Date(),
    "subscription.subscriptionExpiresAt": periodEnd,
  });

  await createNotification(userId, "subscription_started", "Subscription started", `Your ${plan.name} plan is now active.`, {
    planId,
    subscriptionId: record._id,
  });
}