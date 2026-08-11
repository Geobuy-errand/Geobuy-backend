const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Subscription = require("../models/Subscription.model");
const User = require("../models/User.model");
SubscriptionPlan = require("../models/SubscriptionPlan.model");
const Notification = require("../models/Notification.model");
const createNotification = require("../utils/create-notification");

// Subscription Plans

exports.getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({
      displayOrder: 1,
      price: 1,
    });

    const currentSubscription = await Subscription.findOne({
      userId: req.user._id,
      status: "active",
    });

    const plansWithStatus = plans.map((plan) => ({
      ...plan.toObject(),
      isCurrent: currentSubscription?.plan?.toString() === plan._id.toString(),
      isActive: currentSubscription?.status === "active",
    }));

    res.json({
      plans: plansWithStatus,
      currentSubscription: currentSubscription || null,
    });
  } catch (error) {
    console.error("Get plans error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Create checkout session (updated to use dynamic plans)
exports.createCheckoutSession = async (req, res) => {
  try {
    const { planId, successUrl, cancelUrl } = req.body;
    const user = req.user;

    console.log("Creating checkout session for user:", user._id, "plan:", planId);

    // Get plan from database
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    if (!plan.isActive) {
      return res
        .status(400)
        .json({ message: "This plan is currently not available" });
    }

    // Get or create Stripe customer
    let subscription = await Subscription.findOne({ userId: user._id });
    let stripeCustomerId = subscription?.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName,
        metadata: {
          userId: user._id.toString(),
        },
      });
      stripeCustomerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url:
        successUrl ||
        `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/subscription`,
      metadata: {
        userId: user._id.toString(),
        planId: plan._id.toString(),
      },
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          userId: user._id.toString(),
          planId: plan._id.toString(),
        },
      },
    });

    res.json({
      sessionId: session.id,
      sessionUrl: session.url,
    });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Handle Stripe webhook
exports.handleStripeWebhook = async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("Received Stripe webhook:", event.type);

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
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      userId: req.user._id,
      status: { $in: ["active", "trialing"] },
    });

    if (!subscription) {
      return res.status(404).json({ message: "No active subscription found" });
    }

    // Cancel at Stripe
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    subscription.cancelAtPeriodEnd = true;
    await subscription.save();

    res.json({
      message:
        "Subscription will be cancelled at the end of the billing period",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Resume subscription
exports.resumeSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      userId: req.user._id,
      cancelAtPeriodEnd: true,
    });

    if (!subscription) {
      return res
        .status(404)
        .json({ message: "No subscription found to resume" });
    }

    // Resume at Stripe
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    }

    subscription.cancelAtPeriodEnd = false;
    await subscription.save();

    res.json({
      message: "Subscription resumed successfully",
    });
  } catch (error) {
    console.error("Resume subscription error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get subscription history (admin)
exports.getSubscriptionHistory = async (req, res) => {
  try {
    const subscriptions = await Subscription.find()
      .populate("userId", "fullName email")
      .sort({ createdAt: -1 });

    const stats = {
      total: subscriptions.length,
      active: subscriptions.filter((s) => s.status === "active").length,
      trialing: subscriptions.filter((s) => s.status === "trialing").length,
      canceled: subscriptions.filter((s) => s.status === "canceled").length,
      pastDue: subscriptions.filter((s) => s.status === "past_due").length,
      revenue: subscriptions
        .filter((s) => s.status === "active")
        .reduce((sum, s) => sum + (PLANS[s.plan]?.price || 0), 0),
    };

    res.json({
      subscriptions,
      stats,
    });
  } catch (error) {
    console.error("Get subscription history error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptionStatus = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      userId: req.user._id,
    }).populate("plan", "name description interval price features");

    const status = {
      isSubscribed: false,
      plan: null,
      status: "inactive",
      features: {},
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };

    if (subscription && subscription.status === "active") {
      status.isSubscribed = true;
      status.plan = subscription.plan;
      status.status = subscription.status;
      status.features = subscription.features || {};
      status.currentPeriodEnd = subscription.currentPeriodEnd;
      status.cancelAtPeriodEnd = subscription.cancelAtPeriodEnd;
    }

    res.json(status);
  } catch (error) {
    console.error("Get subscription status error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Webhook handlers (updated to use dynamic plans)
async function handleCheckoutSessionCompleted(session) {
    const userId = session.metadata.userId;
    const planId = session.metadata.planId;
  
    if (!userId || !planId) {
      console.error("Missing userId or planId in session metadata");
      return;
    }
  
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      console.error("Plan not found:", planId);
      return;
    }
  
    // Update or create subscription record
    await Subscription.findOneAndUpdate(
      { userId: userId },
      {
        userId: userId,
        plan: planId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        stripePriceId: session.line_items?.data[0]?.price?.id,
        status: "trialing",
        trialStart: new Date(),
        trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        features: plan.features,
      },
      { upsert: true, new: true }
    );
  
    // Update user's subscription status
    await User.findByIdAndUpdate(userId, {
      "subscription.isSubscribed": true,
      "subscription.subscriptionStatus": "trialing",
      "subscription.subscriptionPlan": plan.name,
      "subscription.subscriptionId": planId,
    });
  
    // Notify user
    await createNotification(
      userId,
      "subscription_started",
      "🎉 Subscription Started",
      `Your ${plan.name} plan trial has started!`,
      { planId }
    );
  }

async function handleSubscriptionCreated(subscription) {
    const userId = subscription.metadata.userId;
    const planId = subscription.metadata.planId;
  
    if (!userId || !planId) return;
  
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }
    );
  }
  
  async function handleSubscriptionUpdated(subscription) {
    const subscriptionRecord = await Subscription.findOne({
      stripeSubscriptionId: subscription.id,
    });
  
    if (!subscriptionRecord) return;
  
    subscriptionRecord.status = subscription.status;
    subscriptionRecord.currentPeriodStart = new Date(
      subscription.current_period_start * 1000
    );
    subscriptionRecord.currentPeriodEnd = new Date(
      subscription.current_period_end * 1000
    );
    subscriptionRecord.cancelAtPeriodEnd = subscription.cancel_at_period_end;
  
    await subscriptionRecord.save();
  
    // Update user status if canceled
    if (subscription.status === "canceled") {
      await User.findByIdAndUpdate(subscriptionRecord.userId, {
        "subscription.isSubscribed": false,
        "subscription.subscriptionStatus": "canceled",
      });
    }
  }
  
  async function handleSubscriptionDeleted(subscription) {
    const subscriptionRecord = await Subscription.findOne({
      stripeSubscriptionId: subscription.id,
    });
  
    if (!subscriptionRecord) return;
  
    subscriptionRecord.status = "canceled";
    subscriptionRecord.canceledAt = new Date();
    await subscriptionRecord.save();
  
    // Update user
    await User.findByIdAndUpdate(subscriptionRecord.userId, {
      "subscription.isSubscribed": false,
      "subscription.subscriptionStatus": "canceled",
    });
  }
  
  async function handleInvoicePaymentSucceeded(invoice) {
    const subscriptionRecord = await Subscription.findOne({
      stripeSubscriptionId: invoice.subscription,
    });
  
    if (!subscriptionRecord) return;
  
    // Update status to active if it was trialing
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
        {}
      );
    }
  }
  
  async function handleInvoicePaymentFailed(invoice) {
    const subscriptionRecord = await Subscription.findOne({
      stripeSubscriptionId: invoice.subscription,
    });
  
    if (!subscriptionRecord) return;
  
    subscriptionRecord.status = "past_due";
    await subscriptionRecord.save();
  
    await createNotification(
      subscriptionRecord.userId,
      "payment_failed",
      "⚠️ Payment Failed",
      "We couldn't process your subscription payment. Please update your payment method.",
      {}
    );
  }