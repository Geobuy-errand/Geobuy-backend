const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Subscription = require("../models/Subscription.model");
const User = require("../models/User.model");
const SubscriptionPlan = require("../models/SubscriptionPlan.model");
const createNotification = require("../utils/create-notification");
const Payment = require("../models/Payment.model");
const paystack = require("../services/payments/paystack");
const { frontendUrl } = require("../services/payments");
const { countryOfUser } = require("../config/countries");
const { formatMoney } = require("../utils/money");

/** Plans a user's country can buy, with the price in their currency. */
function plansForCountry(plans, country) {
  return plans
    .filter((p) => {
      const countries = p.countries?.length ? p.countries : ["GB"];
      if (!countries.includes(country)) return false;
      return country === "NG" ? p.priceNGN > 0 : Boolean(p.stripePriceId);
    })
    .map((p) => {
      const obj = p.toObject ? p.toObject() : p;
      const price = country === "NG" ? obj.priceNGN : obj.price;
      const currency = country === "NG" ? "NGN" : "GBP";
      return { ...obj, localPrice: price, currency, formattedPrice: formatMoney(price, currency) };
    });
}
exports.plansForCountry = plansForCountry;

// Subscription Plans

exports.getPlans = async (req, res) => {
  try {
    const country = countryOfUser(req.user);
    const plans = plansForCountry(
      await SubscriptionPlan.find({ isActive: true }).sort({ displayOrder: 1, price: 1 }),
      country
    );

    const currentSubscription = await Subscription.findOne({
      userId: req.user._id,
      status: { $in: ["active", "trialing"] },
    });

    const plansWithStatus = plans.map((plan) => ({
      ...plan,
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

    const existingSubscription = await Subscription.findOne({
      userId: user._id,
      status: { $in: ['active', 'trialing'] },
    });

    if (existingSubscription) {
      return res.status(400).json({
        message: 'You already have an active subscription',
        existingPlan: existingSubscription.plan,
        status: existingSubscription.status,
        currentPeriodEnd: existingSubscription.currentPeriodEnd,
      });
    }

    // cancelled subscription that can be resumed
    const canceledSubscription = await Subscription.findOne({
      userId: user._id,
      status: 'canceled',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { $gt: new Date() }, // Still within grace period
    });

    if (canceledSubscription) {
      return res.status(400).json({
        message: 'You have a canceled subscription that can be resumed',
        canResume: true,
        subscriptionId: canceledSubscription._id,
        currentPeriodEnd: canceledSubscription.currentPeriodEnd,
      });
    }

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

    // ---------------- Nigeria: Paystack subscription ----------------
    if (countryOfUser(user) === "NG") {
      if (!(plan.countries || ["GB"]).includes("NG") || !(plan.priceNGN > 0)) {
        return res.status(400).json({ message: "This plan is not available in Nigeria" });
      }
      if (!plan.paystackPlanCode) {
        const created = await paystack.createPlan({
          name: plan.name,
          amount: plan.priceNGN,
          interval: plan.interval,
          description: plan.description,
        });
        plan.paystackPlanCode = created.planCode;
        await plan.save();
      }

      const reference = paystack.makeReference("SUB");
      await Payment.create({
        type: "subscription",
        customerId: user._id,
        amount: plan.priceNGN,
        platformFee: plan.priceNGN,
        providerAmount: 0,
        currency: "NGN",
        country: "NG",
        gateway: "paystack",
        reference,
        status: "pending",
        isEscrow: false,
        disbursementStatus: "not_applicable",
        metadata: { planId: String(plan._id), userId: String(user._id) },
      });

      const checkout = await paystack.createCheckout({
        amount: plan.priceNGN,
        currency: "NGN",
        email: user.email,
        reference,
        plan: plan.paystackPlanCode,
        callbackUrl: frontendUrl(`/${user.role}/subscriptions/success?gateway=paystack`),
        metadata: { type: "subscription", planId: String(plan._id), userId: String(user._id) },
      });

      return res.json({ sessionId: checkout.reference, sessionUrl: checkout.url, url: checkout.url, gateway: "paystack" });
    }

    if (!plan.stripePriceId) {
      return res.status(400).json({ message: "This plan is not available in the UK" });
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
            : frontendUrl(`/${user?.role}/subscriptions/success?session_id={CHECKOUT_SESSION_ID}`),
          cancel_url: cancelUrl || frontendUrl(`/${user.role}/subscriptions/cancel`),
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

    // Cancel at the gateway (stays active until the end of the paid period)
    if (subscription.gateway === "paystack" && subscription.paystackSubscriptionCode) {
      let token = subscription.paystackEmailToken;
      if (!token) {
        const remote = await paystack.fetchSubscription(subscription.paystackSubscriptionCode);
        token = remote?.email_token;
      }
      await paystack.disableSubscription(subscription.paystackSubscriptionCode, token);
    } else if (subscription.stripeSubscriptionId) {
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

    // Resume at the gateway
    if (subscription.gateway === "paystack" && subscription.paystackSubscriptionCode) {
      let token = subscription.paystackEmailToken;
      if (!token) {
        const remote = await paystack.fetchSubscription(subscription.paystackSubscriptionCode);
        token = remote?.email_token;
      }
      await paystack.enableSubscription(subscription.paystackSubscriptionCode, token);
    } else if (subscription.stripeSubscriptionId) {
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
      .populate("plan")
      .sort({ createdAt: -1 });
    

    const stats = {
      total: subscriptions.length,
      active: subscriptions.filter((s) => s.status === "active").length,
      trialing: subscriptions.filter((s) => s.status === "trialing").length,
      canceled: subscriptions.filter((s) => s.status === "canceled").length,
      pastDue: subscriptions.filter((s) => s.status === "past_due").length,
      // Revenue per currency (GBP and NGN can't be added together).
      // `PLANS` was undefined here, which crashed this endpoint.
      revenueByCurrency: subscriptions
        .filter((s) => ["active", "trialing"].includes(s.status))
        .reduce((acc, s) => {
          const cur = s.currency || "GBP";
          const amount = s.amount ?? (cur === "NGN" ? s.plan?.priceNGN : s.plan?.price) ?? 0;
          acc[cur] = (acc[cur] || 0) + amount;
          return acc;
        }, {}),
    };

    stats.revenue = stats.revenueByCurrency.GBP || 0;
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
    }).populate("plan", "name description interval price priceNGN features");

    const status = {
      isSubscribed: false,
      plan: null,
      status: "inactive",
      features: {},
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };

    if (subscription && ["active", "trialing"].includes(subscription.status)) {
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

// Verify subscription session - ADD THIS METHOD
exports.verifySubscriptionSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID required' });
    }

    // Paystack references (Nigeria)
    if (req.query.gateway === "paystack" || /^SUB_/.test(sessionId)) {
      const payment = await Payment.findOne({ reference: sessionId, type: "subscription" });
      if (!payment) return res.status(404).json({ success: false, message: "Subscription payment not found" });
      const verified = await paystack.verify(sessionId);
      if (verified.paid) await activatePaystackSubscriptionFromPayment(payment, verified.raw);
      const local = await Subscription.findOne({ userId: payment.customerId }).populate("plan", "name");
      return res.json({
        success: verified.paid,
        session: { id: sessionId, status: verified.status },
        localRecord: local ? { id: local._id, status: local.status, plan: local.plan?._id } : null,
        planName: local?.plan?.name || null,
        isSubscribed: Boolean(local && ["active", "trialing"].includes(local.status)),
      });
    }

    console.log('🔍 Verifying session:', sessionId);

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    console.log('📦 Session retrieved:', session.id, 'Status:', session.status);

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

    // Get plan name if exists
    let planName = null;
    if (localSubscription?.plan) {
      const plan = await SubscriptionPlan.findById(localSubscription.plan);
      planName = plan?.name || null;
    }

    const isSubscribed = localSubscription?.status === 'active' || 
                         localSubscription?.status === 'trialing' ||
                         subscriptionData?.status === 'active' ||
                         subscriptionData?.status === 'trialing';

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
      planName: planName,
      isSubscribed: isSubscribed,
    });
  } catch (error) {
    console.error('❌ Verify session error:', error);
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

  // ✅ Create notification with try-catch
  try {
    await createNotification(
      userId,
      'subscription_started',
      '🎉 Subscription Started',
      `Your ${plan.name} plan trial has started! You have 7 days free.`,
      { planId, subscriptionId: subscription._id }
    );
    console.log('✅ Notification sent');
  } catch (notifError) {
    console.error('❌ Notification error:', notifError.message);
    // Don't fail the webhook if notification fails
  }

  console.log('✅ User updated');
}
  
  async function handleSubscriptionCreated(subscription) {
    const stripeSubscriptionId = subscription.id;
    const customerId = subscription.customer;
  
    let subscriptionRecord = await Subscription.findOne({ stripeSubscriptionId });
    if (!subscriptionRecord) {
      subscriptionRecord = await Subscription.findOne({ stripeCustomerId: customerId });
    }
  
    if (!subscriptionRecord) {
      console.log('⚠️ No local subscription tracking draft exists for Customer:', customerId);
      return;
    }
  
    // ✅ DEFENSIVE PARSING: Extract values with fallback variables
    const startSeconds = subscription.current_period_start || subscription.start_date || subscription.created;
    const endSeconds = subscription.current_period_end || subscription.trial_end;
  
    subscriptionRecord.currentPeriodStart = startSeconds ? new Date(startSeconds * 1000) : new Date();
    subscriptionRecord.currentPeriodEnd = endSeconds 
      ? new Date(endSeconds * 1000) 
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days default
  
    subscriptionRecord.stripeSubscriptionId = stripeSubscriptionId;
    subscriptionRecord.status = subscription.status; // Now safely accepts 'incomplete'
    subscriptionRecord.cancelAtPeriodEnd = !!subscription.cancel_at_period_end;
  
    await subscriptionRecord.save();
    console.log('✅ Subscription handled cleanly:', subscriptionRecord._id);
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

    const startSeconds = subscription.current_period_start;
  const endSeconds = subscription.current_period_end;

  if (startSeconds) subscriptionRecord.currentPeriodStart = new Date(startSeconds * 1000);
  if (endSeconds) subscriptionRecord.currentPeriodEnd = new Date(endSeconds * 1000);

  subscriptionRecord.status = subscription.status;
  subscriptionRecord.cancelAtPeriodEnd = !!subscription.cancel_at_period_end;




  
    const previousStatus = subscriptionRecord.status;
    
    // subscriptionRecord.status = subscription.status;
    // subscriptionRecord.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    subscriptionRecord.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    subscriptionRecord.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  
    await subscriptionRecord.save();
  console.log('✅ Subscription status sync complete:', subscriptionRecord._id);

  
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

// ============================================================
// PAYSTACK (Nigeria) subscription lifecycle
// ============================================================

function addInterval(date, interval) {
  const d = new Date(date);
  if (interval === "year") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/** First charge of a Paystack subscription succeeded. Idempotent. */
async function activatePaystackSubscriptionFromPayment(payment, data = {}) {
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ["pending", "processing", "failed", "cancelled"] } },
    { $set: { status: "succeeded", paymentDate: new Date() } },
    { new: true }
  );
  if (!claimed) return { alreadyProcessed: true };

  const planId = claimed.metadata?.planId;
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) return { error: "plan_not_found" };

  const now = new Date();
  const record = await Subscription.findOneAndUpdate(
    { userId: claimed.customerId },
    {
      $set: {
        userId: claimed.customerId,
        plan: plan._id,
        gateway: "paystack",
        country: "NG",
        currency: "NGN",
        amount: plan.priceNGN,
        paystackCustomerCode: data.customer?.customer_code,
        paystackPlanCode: plan.paystackPlanCode,
        lastReference: claimed.reference,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: addInterval(now, plan.interval),
        cancelAtPeriodEnd: false,
        features: plan.features || {},
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.findByIdAndUpdate(claimed.customerId, {
    "subscription.isSubscribed": true,
    "subscription.subscriptionStatus": "active",
    "subscription.subscriptionPlan": plan.name,
    "subscription.subscriptionId": String(record._id),
    "subscription.paystackCustomerCode": data.customer?.customer_code,
    "subscription.gateway": "paystack",
    "subscription.subscribedAt": now,
    "subscription.subscriptionExpiresAt": record.currentPeriodEnd,
  });

  await createNotification(claimed.customerId, "subscription_started", "Subscription started", `Your ${plan.name} plan is now active.`, {
    planId: plan._id,
    subscriptionId: record._id,
  });
  return { subscription: record };
}

/** Paystack sends subscription.create with the code + email token we need to cancel later. */
async function onPaystackSubscriptionCreated(data) {
  const customerCode = data.customer?.customer_code;
  const email = data.customer?.email;
  let sub = customerCode ? await Subscription.findOne({ paystackCustomerCode: customerCode }) : null;
  if (!sub && email) {
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (user) sub = await Subscription.findOne({ userId: user._id });
  }
  if (!sub) return;
  sub.paystackSubscriptionCode = data.subscription_code;
  sub.paystackEmailToken = data.email_token;
  if (data.next_payment_date) sub.currentPeriodEnd = new Date(data.next_payment_date);
  sub.paystackCustomerCode = customerCode || sub.paystackCustomerCode;
  await sub.save();
}

/** Monthly / yearly renewal charge. */
async function onPaystackRenewal(data) {
  const customerCode = data.customer?.customer_code;
  const sub = customerCode ? await Subscription.findOne({ paystackCustomerCode: customerCode }).populate("plan") : null;
  if (!sub || sub.lastReference === data.reference) return;
  const start = new Date();
  sub.status = "active";
  sub.lastReference = data.reference;
  sub.currentPeriodStart = start;
  sub.currentPeriodEnd = addInterval(start, sub.plan?.interval || "month");
  await sub.save();
  await User.findByIdAndUpdate(sub.userId, {
    "subscription.isSubscribed": true,
    "subscription.subscriptionStatus": "active",
    "subscription.subscriptionExpiresAt": sub.currentPeriodEnd,
  });
}

exports.activatePaystackSubscriptionFromPayment = activatePaystackSubscriptionFromPayment;
exports.onPaystackSubscriptionCreated = onPaystackSubscriptionCreated;
exports.onPaystackRenewal = onPaystackRenewal;
