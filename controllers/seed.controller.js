const Settings = require('../models/Setting.model');
const ServiceCategory = require('../models/ServiceCategory.model');
const SubscriptionPlan = require('../models/SubscriptionPlan.model');
const User = require('../models/User.model');

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const log = (message, type = 'info') => {
  const emojis = {
    info: '📘',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    step: '📍',
    data: '📊',
  };
  console.log(`${emojis[type] || '📘'} ${message}`);
};

const createLog = (message, type = 'info') => {
  return { message, type, timestamp: new Date() };
};

// ============================================================
// SEEDER FUNCTIONS
// ============================================================

// 1. Seed Settings
const seedSettings = async () => {
  log('Seeding Settings...', 'step');
  
  try {
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = new Settings({
        pricing: {
          baseFee: 3.99,
          subscriptionDiscount: 20,
          heavyItemFee: 2.99,
          waitTimeFeePerMin: 0.30,
          waitTimeFreeMin: 5,
          peakUrgentFee: 1.99,
          extraStopFee: 1.50,
          platformFeePercentage: 20,
          distanceTiers: {
            tier1: { maxMiles: 3, ratePerMile: 0.80 },
            tier2: { maxMiles: 10, ratePerMile: 0.70 },
            tier3: { maxMiles: 20, ratePerMile: 0.60 },
            tier4: { ratePerMile: 0.50 },
          },
        },
        platform: {
          name: 'GEOBUY Errands',
          contactEmail: 'support@geobuy.com',
          contactPhone: '+44 20 1234 5678',
          currency: 'GBP',
          currencySymbol: '£',
        },
        features: {
          subscriptionsEnabled: true,
          liveTrackingEnabled: true,
          qrCodeEnabled: true,
          negotiationEnabled: true,
        },
      });
      
      await settings.save();
      log('Settings created successfully', 'success');
      return { success: true, message: 'Settings created' };
    } else {
      // Update existing settings with any missing fields
      let updated = false;
      
      if (!settings.pricing?.platformFeePercentage) {
        settings.pricing.platformFeePercentage = 20;
        updated = true;
      }
      
      if (!settings.features) {
        settings.features = {
          subscriptionsEnabled: true,
          liveTrackingEnabled: true,
          qrCodeEnabled: true,
          negotiationEnabled: true,
        };
        updated = true;
      }
      
      if (updated) {
        await settings.save();
        log('Settings updated with missing fields', 'success');
        return { success: true, message: 'Settings updated' };
      }
      
      log('Settings already exist', 'info');
      return { success: true, message: 'Settings already exist' };
    }
  } catch (error) {
    log(`Settings seeding failed: ${error.message}`, 'error');
    return { success: false, message: error.message };
  }
};

// 2. Seed Service Categories
const seedServiceCategories = async () => {
  log('Seeding Service Categories...', 'step');
  
  try {
    const count = await ServiceCategory.countDocuments();
    
    if (count > 0) {
      log(`Categories already exist (${count} found)`, 'info');
      return { success: true, message: `Categories already exist (${count})` };
    }
    
    const categories = [
      // ============================================================
      // SERVICE PROVIDER CATEGORIES
      // ============================================================
      {
        name: 'healthcare',
        label: 'Healthcare Services',
        icon: '🏥',
        description: 'Professional healthcare and medical services',
        subCategories: [
          'nursing',
          'caregiving',
          'physical_therapy',
          'occupational_therapy',
          'speech_therapy',
          'medical_transport',
          'home_health_aide',
          'hospice_care',
          'palliative_care',
          'wound_care',
          'medication_management',
          'health_monitoring',
        ],
        type: 'provider',
        displayOrder: 1,
        isActive: true,
      },
      {
        name: 'trades',
        label: 'Trades & Handyman',
        icon: '🔧',
        description: 'Skilled trade and home maintenance services',
        subCategories: [
          'plumbing',
          'electrical',
          'carpentry',
          'painting_decorating',
          'gardening_landscaping',
          'roofing',
          'carpet_cleaning',
          'tiling',
          'flooring',
          'window_cleaning',
          'gutter_cleaning',
          'pressure_washing',
          'general_handyman',
          'furniture_assembly',
          'tv_mounting',
        ],
        type: 'provider',
        displayOrder: 2,
        isActive: true,
      },
      {
        name: 'professional_services',
        label: 'Professional Services',
        icon: '💼',
        description: 'Legal, financial, and business consulting services',
        subCategories: [
          'legal_advice',
          'accounting',
          'consulting',
          'financial_advice',
          'tax_services',
          'business_planning',
          'hr_consulting',
          'marketing_consulting',
          'it_consulting',
        ],
        type: 'provider',
        displayOrder: 3,
        isActive: true,
      },
      {
        name: 'personal_services',
        label: 'Personal Services',
        icon: '👤',
        description: 'Personal wellness, beauty, and lifestyle services',
        subCategories: [
          'tutoring',
          'fitness_training',
          'beauty_services',
          'massage_therapy',
          'hairdressing',
          'nail_tech',
          'barbing',
          'yoga_instruction',
          'personal_chef',
          'event_planning',
          'pet_sitting',
          'house_sitting',
        ],
        type: 'provider',
        displayOrder: 4,
        isActive: true,
      },
      {
        name: 'cleaning',
        label: 'Cleaning Services',
        icon: '🧹',
        description: 'Professional cleaning and maintenance services',
        subCategories: [
          'residential_cleaning',
          'commercial_cleaning',
          'deep_cleaning',
          'carpet_cleaning',
          'window_cleaning',
          'move_in_cleaning',
          'move_out_cleaning',
          'post_construction_cleaning',
          'green_cleaning',
        ],
        type: 'provider',
        displayOrder: 5,
        isActive: true,
      },
      
      // ============================================================
      // ERRAND RUNNER CATEGORIES
      // ============================================================
      {
        name: 'delivery',
        label: 'Delivery Services',
        icon: '📦',
        description: 'Parcel, document, and item delivery services',
        subCategories: [
          'parcel_delivery',
          'document_delivery',
          'food_delivery',
          'grocery_delivery',
          'pharmacy_delivery',
          'same_day_delivery',
          'next_day_delivery',
          'urgent_delivery',
          'bulk_delivery',
          'furniture_delivery',
        ],
        type: 'errand_runner',
        displayOrder: 6,
        isActive: true,
      },
      {
        name: 'shopping',
        label: 'Shopping Services',
        icon: '🛒',
        description: 'Personal and grocery shopping assistance',
        subCategories: [
          'grocery_shopping',
          'pharmacy_pickup',
          'retail_shopping',
          'elderly_shopping',
          'clothing_shopping',
          'gift_shopping',
          'bulk_shopping',
          'weekly_shop',
          'emergency_shopping',
        ],
        type: 'errand_runner',
        displayOrder: 7,
        isActive: true,
      },
      {
        name: 'errands',
        label: 'General Errands',
        icon: '🏃',
        description: 'Various errand and task services',
        subCategories: [
          'dry_cleaning_pickup',
          'key_collection',
          'bill_payments',
          'queue_standing',
          'school_pickup',
          'pet_assistance',
          'appointment_assistance',
          'business_errands',
          'post_office_errands',
          'bank_errands',
          'return_packages',
          'pickup_services',
        ],
        type: 'errand_runner',
        displayOrder: 8,
        isActive: true,
      },
      {
        name: 'care_errands',
        label: 'Care & Support Errands',
        icon: '❤️',
        description: 'Care-related errands and support services',
        subCategories: [
          'elderly_shopping',
          'prescription_pickup',
          'medical_equipment_delivery',
          'care_package_delivery',
          'companionship_visits',
          'hospital_transport',
          'doctor_appointment_assistance',
          'home_help_errands',
        ],
        type: 'errand_runner',
        displayOrder: 9,
        isActive: true,
      },
    ];

    for (const categoryData of categories) {
      const category = new ServiceCategory(categoryData);
      await category.save();
      log(`Created category: ${category.label} (${category.subCategories.length} sub-categories)`, 'success');
    }

    log(`${categories.length} categories created successfully`, 'success');
    return { success: true, message: `${categories.length} categories created` };
  } catch (error) {
    log(`Category seeding failed: ${error.message}`, 'error');
    return { success: false, message: error.message };
  }
};

// 3. Seed Subscription Plans
const seedSubscriptionPlans = async () => {
  log('Seeding Subscription Plans...', 'step');
  
  try {
    const count = await SubscriptionPlan.countDocuments();
    
    if (count > 0) {
      log(`Subscription plans already exist (${count} found)`, 'info');
      return { success: true, message: `Plans already exist (${count})` };
    }
    
    const plans = [
      {
        name: 'Monthly',
        description: 'Perfect for occasional users',
        interval: 'month',
        price: 12.99,
        stripePriceId: 'price_monthly_default',
        features: {
          unlimited_errands: true,
          priority_support: false,
          discount: 10,
          advanced_tracking: true,
        },
        isActive: true,
        isPopular: false,
        displayOrder: 1,
        metadata: { billingPeriod: 'month' },
      },
      {
        name: '6 Months',
        description: 'Great value - Save 23%',
        interval: 'month',
        price: 29.99,
        stripePriceId: 'price_six_month_default',
        features: {
          unlimited_errands: true,
          priority_support: true,
          discount: 15,
          advanced_tracking: true,
          priority_matching: true,
        },
        isActive: true,
        isPopular: false,
        displayOrder: 2,
        metadata: { billingPeriod: '6_months', savings: '23%' },
      },
      {
        name: 'Yearly',
        description: 'Best value - Save 38%',
        interval: 'year',
        price: 49.99,
        stripePriceId: 'price_yearly_default',
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
        metadata: { billingPeriod: 'year', savings: '38%' },
      },
    ];

    for (const planData of plans) {
      const plan = new SubscriptionPlan(planData);
      await plan.save();
      log(`Created plan: ${plan.name} - £${plan.price}`, 'success');
    }

    log(`${plans.length} subscription plans created`, 'success');
    return { success: true, message: `${plans.length} plans created` };
  } catch (error) {
    log(`Subscription plan seeding failed: ${error.message}`, 'error');
    return { success: false, message: error.message };
  }
};

// 4. Seed Admin User (if not exists)
const seedAdminUser = async () => {
  log('Checking Admin User...', 'step');
  
  try {
    const adminExists = await User.findOne({ email: 'admin@gmail.com' });
    
    if (adminExists) {
      log(`Admin user already exists (${adminExists.email})`, 'info');
      return { success: true, message: 'Admin already exists' };
    }
    
    const admin = new User({
      fullName: 'Admin User',
      email: 'admin@gmail.com',
      phoneNumber: '07700900000',
      password: 'admin',
      role: 'admin',
      isActive: true,
      isVerified: true,
      acceptedTerms: true,
      acceptedPrivacy: true,
      over18: true,
      verificationStatus: 'approved',
    });
    
    await admin.save();
    log('Admin user created successfully', 'success');
    return { success: true, message: 'Admin user created' };
  } catch (error) {
    log(`Admin seeding failed: ${error.message}`, 'error');
    return { success: false, message: error.message };
  }
};

// ============================================================
// MAIN SEEDER FUNCTIONS
// ============================================================

exports.runAllSeeders = async (req, res) => {
  try {
    log('🚀 Starting all seeders...', 'step');
    
    const results = {
      timestamp: new Date(),
      seeders: [],
      success: true,
      summary: {},
    };
    
    // Run seeders in order
    const seeders = [
      { name: 'Settings', fn: seedSettings },
      { name: 'Admin User', fn: seedAdminUser },
      { name: 'Service Categories', fn: seedServiceCategories },
      { name: 'Subscription Plans', fn: seedSubscriptionPlans },
    ];
    
    for (const seeder of seeders) {
      log(`Running ${seeder.name} seeder...`, 'step');
      const result = await seeder.fn();
      results.seeders.push({
        name: seeder.name,
        ...result,
      });
      
      if (!result.success) {
        results.success = false;
        results.summary.failed = (results.summary.failed || 0) + 1;
        log(`${seeder.name} failed: ${result.message}`, 'error');
      } else {
        results.summary.success = (results.summary.success || 0) + 1;
        log(`${seeder.name} completed: ${result.message}`, 'success');
      }
    }
    
    results.summary.total = seeders.length;
    results.summary.completed = results.seeders.filter(s => s.success).length;
    
    log('🎉 All seeders completed!', 'success');
    
    res.status(200).json({
      message: 'Seeding completed successfully',
      data: results,
    });
    
  } catch (error) {
    log(`Seeding failed: ${error.message}`, 'error');
    res.status(500).json({
      message: 'Seeding failed',
      error: error.message,
    });
  }
};

exports.runSpecificSeeder = async (req, res) => {
  try {
    const { seeder } = req.params;
    
    const seederMap = {
      settings: seedSettings,
      categories: seedServiceCategories,
      subscriptions: seedSubscriptionPlans,
      admin: seedAdminUser,
    };
    
    if (!seederMap[seeder]) {
      return res.status(400).json({
        message: 'Invalid seeder name',
        available: Object.keys(seederMap),
      });
    }
    
    log(`Running specific seeder: ${seeder}`, 'step');
    const result = await seederMap[seeder]();
    
    res.status(200).json({
      message: `Seeder "${seeder}" completed`,
      data: result,
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Seeder failed',
      error: error.message,
    });
  }
};

exports.getSeedStatus = async (req, res) => {
  try {
    const status = {
      settings: await Settings.findOne() ? 'exists' : 'missing',
      categories: await ServiceCategory.countDocuments(),
      subscriptions: await SubscriptionPlan.countDocuments(),
      admin: await User.findOne({ role: 'admin' }) ? 'exists' : 'missing',
    };
    
    res.status(200).json({
      message: 'Seed status retrieved',
      data: status,
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Failed to get seed status',
      error: error.message,
    });
  }
};

exports.resetAndReseed = async (req, res) => {
  try {
    log('⚠️ Starting reset and reseed...', 'warning');
    
    // Only allow in production with confirmation
    if (process.env.NODE_ENV === 'production' && !req.query.confirm) {
      return res.status(400).json({
        message: 'Production reset requires confirmation',
        instruction: 'Add ?confirm=true to the URL',
      });
    }
    
    // Clear data
    log('Clearing existing data...', 'step');
    await Settings.deleteMany({});
    await ServiceCategory.deleteMany({});
    await SubscriptionPlan.deleteMany({});
    // Don't delete admin user or providers - keep them
    
    log('Data cleared, reseeding...', 'step');
    
    // Reseed
    const results = await exports.runAllSeeders(req, res);
    
    log('🎉 Reset and reseed completed!', 'success');
    
    res.status(200).json({
      message: 'Reset and reseed completed successfully',
      data: results,
    });
    
  } catch (error) {
    log(`Reset and reseed failed: ${error.message}`, 'error');
    res.status(500).json({
      message: 'Reset and reseed failed',
      error: error.message,
    });
  }
};