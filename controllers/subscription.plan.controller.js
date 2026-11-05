const SubscriptionPlan = require('../models/SubscriptionPlan.model');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paystack = require('../services/payments/paystack');

const parseCountries = (countries, priceNGN, stripePriceId) => {
  if (Array.isArray(countries) && countries.length) {
    return [...new Set(countries.map((c) => String(c).toUpperCase()).filter((c) => ['GB', 'NG'].includes(c)))];
  }
  const out = [];
  if (stripePriceId) out.push('GB');
  if (Number(priceNGN) > 0) out.push('NG');
  return out.length ? out : ['GB'];
};

/** Create or update the matching Paystack plan for the NGN price. */
async function syncPaystackPlan(plan) {
  if (!(plan.priceNGN > 0) || !paystack.isConfigured()) return;
  if (plan.paystackPlanCode) {
    await paystack.updatePlan(plan.paystackPlanCode, {
      name: plan.name,
      amount: plan.priceNGN,
      interval: plan.interval,
      description: plan.description,
    });
  } else {
    const created = await paystack.createPlan({
      name: plan.name,
      amount: plan.priceNGN,
      interval: plan.interval,
      description: plan.description,
    });
    plan.paystackPlanCode = created.planCode;
  }
}

// Get all active plans (public)
exports.getActivePlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true })
      .sort({ displayOrder: 1, price: 1 });

    // ?country=NG returns Nigeria plans with NGN prices
    if (req.query.country) {
      const { plansForCountry } = require('./subscription.controller');
      return res.json(plansForCountry(plans, String(req.query.country).toUpperCase()));
    }
    res.json(plans);
  } catch (error) {
    console.error('Get active plans error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all plans (admin)
exports.getAllPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find()
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(plans);
  } catch (error) {
    console.error('Get all plans error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get plan by ID
exports.getPlanById = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email');

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.json(plan);
  } catch (error) {
    console.error('Get plan by ID error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Create subscription plan (admin)
exports.createPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      interval,
      price,
      stripePriceId,
      priceNGN,
      countries,
      features,
      isActive,
      isPopular,
      displayOrder,
      metadata,
    } = req.body;

    // A plan needs a UK price (Stripe), a Nigeria price (NGN), or both.
    const hasUK = Boolean(stripePriceId && Number(price) > 0);
    const hasNG = Number(priceNGN) > 0;
    if (!name || !interval || (!hasUK && !hasNG)) {
      return res.status(400).json({
        message: 'Name and interval are required, plus a UK price with Stripe price ID and/or a Nigeria price (NGN)',
      });
    }

    // Validate interval
    if (!['month', 'year'].includes(interval)) {
      return res.status(400).json({ message: 'Interval must be either "month" or "year"' });
    }

    // Check if Stripe price ID exists
    try {
      if (stripePriceId) await stripe.prices.retrieve(stripePriceId);
    } catch (stripeError) {
      return res.status(400).json({ 
        message: 'Invalid Stripe price ID. Please verify the price exists in Stripe.',
        stripeError: stripeError.message,
      });
    }

    const plan = new SubscriptionPlan({
      name,
      description,
      interval,
      price: Number(price) || 0,
      stripePriceId: stripePriceId || undefined,
      priceNGN: hasNG ? Number(priceNGN) : undefined,
      countries: parseCountries(countries, priceNGN, stripePriceId),
      features: features || {},
      isActive: isActive !== undefined ? isActive : true,
      isPopular: isPopular || false,
      displayOrder: displayOrder || 0,
      metadata: metadata || {},
      createdBy: req.user._id,
    });

    try {
      await syncPaystackPlan(plan);
    } catch (e) {
      return res.status(400).json({ message: `Could not create Paystack plan: ${e.message}` });
    }

    await plan.save();

    res.status(201).json({
      message: 'Subscription plan created successfully',
      plan,
    });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Update subscription plan (admin)
exports.updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      interval,
      price,
      stripePriceId,
      priceNGN,
      countries,
      features,
      isActive,
      isPopular,
      displayOrder,
      metadata,
    } = req.body;

    const plan = await SubscriptionPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    // Update fields
    if (name) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (interval) {
      if (!['month', 'year'].includes(interval)) {
        return res.status(400).json({ message: 'Interval must be either "month" or "year"' });
      }
      plan.interval = interval;
    }
    if (price) plan.price = price;
    if (stripePriceId) {
      // Verify Stripe price ID exists
      try {
        await stripe.prices.retrieve(stripePriceId);
        plan.stripePriceId = stripePriceId;
      } catch (stripeError) {
        return res.status(400).json({ 
          message: 'Invalid Stripe price ID. Please verify the price exists in Stripe.',
          stripeError: stripeError.message,
        });
      }
    }
    let ngnChanged = false;
    if (priceNGN !== undefined && Number(priceNGN) !== plan.priceNGN) {
      plan.priceNGN = Number(priceNGN) || undefined;
      ngnChanged = true;
    }
    if (countries) plan.countries = parseCountries(countries, plan.priceNGN, plan.stripePriceId);
    if (features) plan.features = { ...(plan.features?.toObject?.() || plan.features), ...features };
    if (isActive !== undefined) plan.isActive = isActive;
    if (isPopular !== undefined) plan.isPopular = isPopular;
    if (displayOrder !== undefined) plan.displayOrder = displayOrder;
    if (metadata) plan.metadata = { ...plan.metadata, ...metadata };
    plan.updatedBy = req.user._id;

    if (ngnChanged || (name && plan.paystackPlanCode)) {
      try {
        await syncPaystackPlan(plan);
      } catch (e) {
        return res.status(400).json({ message: `Could not update Paystack plan: ${e.message}` });
      }
    }

    await plan.save();

    res.json({
      message: 'Subscription plan updated successfully',
      plan,
    });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Delete subscription plan (admin)
exports.deletePlan = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await SubscriptionPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    // Check if any users are subscribed to this plan
    const Subscription = require('../models/Subscription.model');
    const activeSubscriptions = await Subscription.countDocuments({
      plan: plan._id,
      status: { $in: ['active', 'trialing'] },
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({ 
        message: `Cannot delete plan. ${activeSubscriptions} user(s) are currently subscribed to this plan.`,
        activeSubscriptions,
      });
    }

    await plan.deleteOne();

    res.json({
      message: 'Subscription plan deleted successfully',
    });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Toggle plan active status (admin)
exports.togglePlanStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await SubscriptionPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    plan.isActive = !plan.isActive;
    plan.updatedBy = req.user._id;
    await plan.save();

    res.json({
      message: `Plan ${plan.isActive ? 'activated' : 'deactivated'} successfully`,
      plan,
    });
  } catch (error) {
    console.error('Toggle plan status error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Seed default plans (optional - run once)
exports.seedDefaultPlans = async (req, res) => {
  try {
    // Check if plans already exist
    const count = await SubscriptionPlan.countDocuments();
    if (count > 0) {
      return res.status(400).json({ message: 'Plans already exist' });
    }

    const defaultPlans = [
      {
        name: 'Monthly',
        description: 'Perfect for occasional users - Pay as you go',
        interval: 'month',
        price: 12.99,
        stripePriceId: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly_default',
        features: {
          unlimited_errands: true,
          priority_support: false,
          discount: 10,
          advanced_tracking: true,
          basic_analytics: true,
        },
        isActive: true,
        isPopular: false,
        displayOrder: 1,
      },
      {
        name: '6 Months',
        description: 'Great value - Save 23% compared to monthly',
        interval: 'month', // We'll handle the 6-month billing via Stripe
        price: 29.99,
        stripePriceId: process.env.STRIPE_SIX_MONTH_PRICE_ID || 'price_six_month_default',
        features: {
          unlimited_errands: true,
          priority_support: true,
          discount: 15,
          advanced_tracking: true,
          basic_analytics: true,
          priority_matching: true,
        },
        isActive: true,
        isPopular: false,
        displayOrder: 2,
        metadata: {
          billingPeriod: '6_months',
          savings: '23%',
        },
      },
      {
        name: 'Yearly',
        description: 'Best value - Save 38% compared to monthly',
        interval: 'year',
        price: 49.99,
        stripePriceId: process.env.STRIPE_YEARLY_PRICE_ID || 'price_yearly_default',
        features: {
          unlimited_errands: true,
          priority_support: true,
          discount: 20,
          advanced_tracking: true,
          premium_analytics: true,
          priority_matching: true,
          dedicated_account_manager: true,
        },
        isActive: true,
        isPopular: true,
        displayOrder: 3,
        metadata: {
          savings: '38%',
        },
      },
    ];

    const plans = await SubscriptionPlan.insertMany(defaultPlans);

    res.status(201).json({
      message: 'Default plans seeded successfully',
      plans,
      pricing: {
        monthly: '£12.99/month',
        sixMonths: '£29.99/6 months',
        yearly: '£49.99/year',
      },
    });
  } catch (error) {
    console.error('Seed default plans error:', error);
    res.status(500).json({ message: error.message });
  }
};