const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Subscription = require("../models/Subscription.model");
const User = require("../models/User.model");
const SubscriptionPlan = require("../models/SubscriptionPlan.model");
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

    console.log("Creating checkout session for user:", user._id);

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
    // const session = await stripe.checkout.sessions.create({
    //   customer: stripeCustomerId,
    //   payment_method_types: ["card"],
    //   line_items: [
    //     {
    //       price: plan.stripePriceId,
    //       quantity: 1,
    //     },
    //   ],
    //   mode: "subscription",
    //   // success_url:
    //   //   successUrl ||
    //   //   `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    //   success_url: successUrl 
    //     ? `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
    //     : `${process.env.FRONTEND_URL}/${user?.role}/subscriptions/success?session_id={CHECKOUT_SESSION_ID}`,
    //   cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/${user.role}/subscriptions/cancel`,
    //   metadata: {
    //     userId: user._id.toString(),
    //     planId: plan._id.toString(),
    //   },
    //   subscription_data: {
    //     trial_period_days: 7,
    //     metadata: {
    //       userId: user._id.toString(),
    //       planId: plan._id.toString(),
    //     },
    //   },
    // });

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
          success_url: successUrl 
            ? `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
            : `${process.env.FRONTEND_URL}/${user?.role}/subscriptions/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/${user.role}/subscriptions/cancel`,
          metadata: {
            userId: user._id.toString(),
            planId: plan._id.toString(),
          },
          // ✅ Removed trial_period_days from subscription_data
          subscription_data: {
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

    // console.log('📦 Received Stripe webhook:', event);
    console.log('📦 Event data: Received stripes webhook', JSON.stringify(event.data.object, null, 2));

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

exports.verifySubscriptionSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID required' });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // Get the subscription
    const subscriptionId = session.subscription;
    let subscriptionData = null;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      subscriptionData = {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      };
    }

    // Check if we have a local record
    const localSubscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        customer: session.customer,
      },
      subscription: subscriptionData,
      localRecord: localSubscription ? {
        id: localSubscription._id,
        status: localSubscription.status,
        plan: localSubscription.plan,
      } : null,
      planName: localSubscription?.plan ? (await SubscriptionPlan.findById(localSubscription.plan))?.name : null,
      isSubscribed: localSubscription?.status === 'active' || localSubscription?.status === 'trialing',
    });
  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

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
    let subscription = await Subscription.findOne({ userId: userId });
  
    if (!subscription) {
      subscription = new Subscription({
        userId: userId,
        plan: planId,
      });
    }
  
    // Update subscription with Stripe data
    subscription.stripeCustomerId = session.customer;
    subscription.stripeSubscriptionId = session.subscription;
    subscription.stripePriceId = session.line_items?.data[0]?.price?.id || plan.stripePriceId;
    subscription.status = 'trialing';
    subscription.currentPeriodStart = new Date();
    subscription.currentPeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day trial
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
  
    console.log('✅ User updated and notification sent');
  }
  
  async function handleSubscriptionCreated(subscription) {
    const stripeSubscriptionId = subscription.id;
    const customerId = subscription.customer;
  
    console.log('📋 Handling subscription creation for Stripe ID:', stripeSubscriptionId, {subscription});
  
    // 1. Try finding by Stripe Subscription ID first
    let subscriptionRecord = await Subscription.findOne({
      stripeSubscriptionId: stripeSubscriptionId,
    });
  
    // 2. FALLBACK: If not found, look up by Stripe Customer ID (since metadata links them)
    if (!subscriptionRecord) {
      console.log(`🔍 Subscription ID not tracked yet. Searching via Customer ID: ${customerId}`);
      subscriptionRecord = await Subscription.findOne({
        stripeCustomerId: customerId,
      });
    }
  
    // 3. Absolute Safeguard if no draft exists
    if (!subscriptionRecord) {
      console.log('⚠️ Critical: No local subscription tracking draft exists for Customer ID:', customerId);
      return;
    }
  
    // 4. Update the record cleanly with correct millisecond dates
    subscriptionRecord.stripeSubscriptionId = stripeSubscriptionId; // Link it now!
    subscriptionRecord.status = subscription.status;
    subscriptionRecord.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    subscriptionRecord.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    subscriptionRecord.cancelAtPeriodEnd = subscription.cancel_at_period_end;
  
    await subscriptionRecord.save();
    console.log('✅ Subscription successfully updated in DB:', subscriptionRecord._id);
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