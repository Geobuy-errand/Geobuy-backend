const Settings = require('../models/Setting.model');
const ServiceCategory = require('../models/ServiceCategory.model');
const Service = require('../models/Service.model');
const SubscriptionPlan = require('../models/SubscriptionPlan.model');
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const ErrandRunnerProfile = require('../models/ErrandRunnerProfile.model');
const Wallet = require('../models/Wallet.model');
const bcrypt = require('bcryptjs');

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
          connectionFee: 1.99,
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
      let updated = false;
      
      if (!settings.pricing?.connectionFee) {
        settings.pricing.connectionFee = 1.99;
        updated = true;
      }
      
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
        subCategories: ['nursing', 'caregiving', 'physical_therapy', 'occupational_therapy', 'speech_therapy', 'medical_transport', 'home_health_aide', 'hospice_care', 'palliative_care', 'wound_care', 'medication_management', 'health_monitoring'],
        type: 'provider',
        displayOrder: 1,
        isActive: true,
      },
      {
        name: 'trades',
        label: 'Trades & Handyman',
        icon: '🔧',
        description: 'Skilled trade and home maintenance services',
        subCategories: ['plumbing', 'electrical', 'carpentry', 'painting_decorating', 'gardening_landscaping', 'roofing', 'carpet_cleaning', 'tiling', 'flooring', 'window_cleaning', 'gutter_cleaning', 'pressure_washing', 'general_handyman', 'furniture_assembly', 'tv_mounting'],
        type: 'provider',
        displayOrder: 2,
        isActive: true,
      },
      {
        name: 'professional_services',
        label: 'Professional Services',
        icon: '💼',
        description: 'Legal, financial, and business consulting services',
        subCategories: ['legal_advice', 'accounting', 'consulting', 'financial_advice', 'tax_services', 'business_planning', 'hr_consulting', 'marketing_consulting', 'it_consulting'],
        type: 'provider',
        displayOrder: 3,
        isActive: true,
      },
      {
        name: 'personal_services',
        label: 'Personal Services',
        icon: '👤',
        description: 'Personal wellness, beauty, and lifestyle services',
        subCategories: ['tutoring', 'fitness_training', 'beauty_services', 'massage_therapy', 'hairdressing', 'nail_tech', 'barbing', 'yoga_instruction', 'personal_chef', 'event_planning', 'pet_sitting', 'house_sitting'],
        type: 'provider',
        displayOrder: 4,
        isActive: true,
      },
      {
        name: 'cleaning',
        label: 'Cleaning Services',
        icon: '🧹',
        description: 'Professional cleaning and maintenance services',
        subCategories: ['residential_cleaning', 'commercial_cleaning', 'deep_cleaning', 'carpet_cleaning', 'window_cleaning', 'move_in_cleaning', 'move_out_cleaning', 'post_construction_cleaning', 'green_cleaning'],
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
        subCategories: ['parcel_delivery', 'document_delivery', 'food_delivery', 'grocery_delivery', 'pharmacy_delivery', 'same_day_delivery', 'next_day_delivery', 'urgent_delivery', 'bulk_delivery', 'furniture_delivery'],
        type: 'errand_runner',
        displayOrder: 6,
        isActive: true,
      },
      {
        name: 'shopping',
        label: 'Shopping Services',
        icon: '🛒',
        description: 'Personal and grocery shopping assistance',
        subCategories: ['grocery_shopping', 'pharmacy_pickup', 'retail_shopping', 'elderly_shopping', 'clothing_shopping', 'gift_shopping', 'bulk_shopping', 'weekly_shop', 'emergency_shopping'],
        type: 'errand_runner',
        displayOrder: 7,
        isActive: true,
      },
      {
        name: 'errands',
        label: 'General Errands',
        icon: '🏃',
        description: 'Various errand and task services',
        subCategories: ['dry_cleaning_pickup', 'key_collection', 'bill_payments', 'queue_standing', 'school_pickup', 'pet_assistance', 'appointment_assistance', 'business_errands', 'post_office_errands', 'bank_errands', 'return_packages', 'pickup_services'],
        type: 'errand_runner',
        displayOrder: 8,
        isActive: true,
      },
      {
        name: 'care_errands',
        label: 'Care & Support Errands',
        icon: '❤️',
        description: 'Care-related errands and support services',
        subCategories: ['elderly_shopping', 'prescription_pickup', 'medical_equipment_delivery', 'care_package_delivery', 'companionship_visits', 'hospital_transport', 'doctor_appointment_assistance', 'home_help_errands'],
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

// 3. Seed Services (Linked to Categories)
const seedServices = async () => {
  log('Seeding Services...', 'step');
  
  try {
    // Check if services already exist
    const count = await Service.countDocuments();
    
    if (count > 0) {
      log(`Services already exist (${count} found)`, 'info');
      return { success: true, message: `Services already exist (${count})` };
    }
    
    // Get all categories with their subCategories
    const categories = await ServiceCategory.find({ isActive: true });
    
    if (categories.length === 0) {
      log('No categories found. Please seed categories first.', 'warning');
      return { success: false, message: 'No categories found. Seed categories first.' };
    }
    
    log(`Found ${categories.length} categories for service creation`, 'data');

    // Create services for each subCategory
    const services = [];
    
    for (const category of categories) {
      for (const subCategory of category.subCategories) {
        // Skip if service already exists for this subCategory
        const existing = await Service.findOne({ category: subCategory });
        if (existing) {
          log(`Service already exists for "${subCategory}"`, 'info');
          continue;
        }
        
        // Generate service based on category type
        const serviceData = generateServiceData(subCategory, category.type, category.name);
        if (serviceData) {
          const service = new Service({
            ...serviceData,
            isActive: true,
          });
          await service.save();
          services.push(service);
          log(`Created service: ${service.name} (${service.category})`, 'success');
        }
      }
    }

    log(`${services.length} services created successfully`, 'success');
    return { success: true, message: `${services.length} services created` };
    
  } catch (error) {
    log(`Service seeding failed: ${error.message}`, 'error');
    return { success: false, message: error.message };
  }
};

// Helper function to generate service data from subCategory
const generateServiceData = (subCategory, type, categoryName) => {
  const serviceMap = {
    // ============================================================
    // PROVIDER SERVICES (Healthcare)
    // ============================================================
    nursing: {
      name: 'Nursing Care',
      description: 'Professional nursing care at home',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 60,
      icon: '👨‍⚕️',
      requiresDBS: true,
    },
    caregiving: {
      name: 'Caregiving Services',
      description: 'Compassionate caregiving and support',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '🤝',
      requiresDBS: true,
    },
    physical_therapy: {
      name: 'Physical Therapy',
      description: 'Professional physical therapy sessions',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 45,
      icon: '🏃',
      requiresDBS: true,
    },
    occupational_therapy: {
      name: 'Occupational Therapy',
      description: 'Professional occupational therapy',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 45,
      icon: '🧠',
      requiresDBS: true,
    },
    speech_therapy: {
      name: 'Speech Therapy',
      description: 'Professional speech and language therapy',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 55,
      estimatedTime: 45,
      icon: '🗣️',
      requiresDBS: true,
    },
    medical_transport: {
      name: 'Medical Transport',
      description: 'Safe and reliable medical transport',
      basePrice: 20,
      pricePerKm: 0.6,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 30,
      icon: '🚑',
      requiresDBS: true,
    },
    home_health_aide: {
      name: 'Home Health Aide',
      description: 'Compassionate home health assistance',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 90,
      icon: '🏠',
      requiresDBS: true,
    },
    hospice_care: {
      name: 'Hospice Care',
      description: 'Compassionate end-of-life care',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 90,
      icon: '🌅',
      requiresDBS: true,
    },
    palliative_care: {
      name: 'Palliative Care',
      description: 'Specialized palliative care services',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 90,
      icon: '💝',
      requiresDBS: true,
    },
    wound_care: {
      name: 'Wound Care',
      description: 'Professional wound care and management',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 45,
      icon: '🩹',
      requiresDBS: true,
    },
    medication_management: {
      name: 'Medication Management',
      description: 'Professional medication management and support',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 35,
      estimatedTime: 45,
      icon: '💊',
      requiresDBS: true,
    },
    health_monitoring: {
      name: 'Health Monitoring',
      description: 'Professional health monitoring services',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 35,
      estimatedTime: 60,
      icon: '📊',
      requiresDBS: true,
    },
    
    // ============================================================
    // PROVIDER SERVICES (Trades)
    // ============================================================
    plumbing: {
      name: 'Plumbing Services',
      description: 'Professional plumbing repairs and installations',
      basePrice: 35,
      pricePerKm: 0.6,
      minPrice: 30,
      maxPrice: 80,
      estimatedTime: 60,
      icon: '🔧',
    },
    electrical: {
      name: 'Electrical Services',
      description: 'Certified electrical repairs and installations',
      basePrice: 35,
      pricePerKm: 0.6,
      minPrice: 30,
      maxPrice: 80,
      estimatedTime: 60,
      icon: '⚡',
    },
    carpentry: {
      name: 'Carpentry Services',
      description: 'Professional carpentry and woodworking',
      basePrice: 30,
      pricePerKm: 0.6,
      minPrice: 25,
      maxPrice: 70,
      estimatedTime: 90,
      icon: '🪚',
    },
    painting_decorating: {
      name: 'Painting & Decorating',
      description: 'Professional painting and decorating services',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 60,
      estimatedTime: 90,
      icon: '🎨',
    },
    gardening_landscaping: {
      name: 'Gardening & Landscaping',
      description: 'Professional gardening and landscaping services',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 50,
      estimatedTime: 60,
      icon: '🌿',
    },
    roofing: {
      name: 'Roofing Services',
      description: 'Professional roofing repairs and installation',
      basePrice: 40,
      pricePerKm: 0.6,
      minPrice: 35,
      maxPrice: 100,
      estimatedTime: 120,
      icon: '🏗️',
    },
    carpet_cleaning: {
      name: 'Carpet Cleaning',
      description: 'Professional carpet and upholstery cleaning',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '🧹',
    },
    tiling: {
      name: 'Tiling Services',
      description: 'Professional tiling and grouting services',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 90,
      icon: '📐',
    },
    flooring: {
      name: 'Flooring Services',
      description: 'Professional flooring installation and repair',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 90,
      icon: '🏠',
    },
    window_cleaning: {
      name: 'Window Cleaning',
      description: 'Professional window and glass cleaning',
      basePrice: 15,
      pricePerKm: 0.4,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 45,
      icon: '🪟',
    },
    gutter_cleaning: {
      name: 'Gutter Cleaning',
      description: 'Professional gutter cleaning and maintenance',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '🌧️',
    },
    pressure_washing: {
      name: 'Pressure Washing',
      description: 'Professional pressure washing and cleaning',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 60,
      icon: '💦',
    },
    general_handyman: {
      name: 'General Handyman',
      description: 'Professional handyman services',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 60,
      icon: '🔨',
    },
    furniture_assembly: {
      name: 'Furniture Assembly',
      description: 'Professional furniture assembly and installation',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '🪑',
    },
    tv_mounting: {
      name: 'TV Mounting',
      description: 'Professional TV mounting and installation',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 45,
      estimatedTime: 45,
      icon: '📺',
    },
    
    // ============================================================
    // PROVIDER SERVICES (Professional)
    // ============================================================
    legal_advice: {
      name: 'Legal Advice',
      description: 'Professional legal consultation and advice',
      basePrice: 40,
      pricePerKm: 0.4,
      minPrice: 35,
      maxPrice: 100,
      estimatedTime: 60,
      icon: '⚖️',
    },
    accounting: {
      name: 'Accounting Services',
      description: 'Professional accounting and bookkeeping',
      basePrice: 30,
      pricePerKm: 0.4,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 60,
      icon: '📊',
    },
    consulting: {
      name: 'Business Consulting',
      description: 'Professional business strategy consulting',
      basePrice: 45,
      pricePerKm: 0.5,
      minPrice: 40,
      maxPrice: 120,
      estimatedTime: 90,
      icon: '💼',
    },
    financial_advice: {
      name: 'Financial Advice',
      description: 'Professional financial planning and advice',
      basePrice: 35,
      pricePerKm: 0.4,
      minPrice: 30,
      maxPrice: 80,
      estimatedTime: 60,
      icon: '📈',
    },
    tax_services: {
      name: 'Tax Services',
      description: 'Professional tax preparation and advice',
      basePrice: 35,
      pricePerKm: 0.4,
      minPrice: 30,
      maxPrice: 70,
      estimatedTime: 60,
      icon: '🧾',
    },
    business_planning: {
      name: 'Business Planning',
      description: 'Professional business planning services',
      basePrice: 40,
      pricePerKm: 0.5,
      minPrice: 35,
      maxPrice: 90,
      estimatedTime: 90,
      icon: '📋',
    },
    hr_consulting: {
      name: 'HR Consulting',
      description: 'Professional HR and recruitment consulting',
      basePrice: 40,
      pricePerKm: 0.5,
      minPrice: 35,
      maxPrice: 80,
      estimatedTime: 60,
      icon: '👥',
    },
    marketing_consulting: {
      name: 'Marketing Consulting',
      description: 'Professional marketing strategy and consulting',
      basePrice: 40,
      pricePerKm: 0.5,
      minPrice: 35,
      maxPrice: 80,
      estimatedTime: 60,
      icon: '📢',
    },
    it_consulting: {
      name: 'IT Consulting',
      description: 'Professional IT and technology consulting',
      basePrice: 45,
      pricePerKm: 0.5,
      minPrice: 40,
      maxPrice: 100,
      estimatedTime: 60,
      icon: '💻',
    },
    
    // ============================================================
    // PROVIDER SERVICES (Personal)
    // ============================================================
    tutoring: {
      name: 'Tutoring Services',
      description: 'Professional tutoring in various subjects',
      basePrice: 20,
      pricePerKm: 0.4,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '📚',
    },
    fitness_training: {
      name: 'Fitness Training',
      description: 'Personal fitness training sessions',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 60,
      icon: '💪',
    },
    beauty_services: {
      name: 'Beauty Services',
      description: 'Professional beauty and wellness services',
      basePrice: 25,
      pricePerKm: 0.4,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 60,
      icon: '💄',
    },
    massage_therapy: {
      name: 'Massage Therapy',
      description: 'Professional massage therapy sessions',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 55,
      estimatedTime: 60,
      icon: '💆',
    },
    hairdressing: {
      name: 'Hairdressing',
      description: 'Professional hairdressing services',
      basePrice: 20,
      pricePerKm: 0.4,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 45,
      icon: '💇',
    },
    nail_tech: {
      name: 'Nail Technician',
      description: 'Professional nail care and design',
      basePrice: 15,
      pricePerKm: 0.4,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 45,
      icon: '💅',
    },
    barbing: {
      name: 'Barbing/Haircut',
      description: 'Professional barbing and haircut services',
      basePrice: 15,
      pricePerKm: 0.4,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 30,
      icon: '✂️',
    },
    yoga_instruction: {
      name: 'Yoga Instruction',
      description: 'Professional yoga and wellness instruction',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '🧘',
    },
    personal_chef: {
      name: 'Personal Chef',
      description: 'Professional personal chef services',
      basePrice: 35,
      pricePerKm: 0.5,
      minPrice: 30,
      maxPrice: 70,
      estimatedTime: 120,
      icon: '👨‍🍳',
    },
    event_planning: {
      name: 'Event Planning',
      description: 'Professional event planning and coordination',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 90,
      icon: '🎉',
    },
    pet_sitting: {
      name: 'Pet Sitting',
      description: 'Professional pet sitting and care services',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '🐕',
    },
    house_sitting: {
      name: 'House Sitting',
      description: 'Professional house sitting services',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '🏠',
    },
    
    // ============================================================
    // PROVIDER SERVICES (Cleaning)
    // ============================================================
    residential_cleaning: {
      name: 'Residential Cleaning',
      description: 'Professional home cleaning services',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 90,
      icon: '🧹',
    },
    commercial_cleaning: {
      name: 'Commercial Cleaning',
      description: 'Professional commercial and office cleaning',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 90,
      icon: '🏢',
    },
    deep_cleaning: {
      name: 'Deep Cleaning',
      description: 'Comprehensive deep cleaning services',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 120,
      icon: '✨',
    },
    move_in_cleaning: {
      name: 'Move-in Cleaning',
      description: 'Professional move-in cleaning services',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 90,
      icon: '🚪',
    },
    move_out_cleaning: {
      name: 'Move-out Cleaning',
      description: 'Professional move-out cleaning services',
      basePrice: 25,
      pricePerKm: 0.5,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 90,
      icon: '📦',
    },
    post_construction_cleaning: {
      name: 'Post-Construction Cleaning',
      description: 'Professional post-construction cleaning',
      basePrice: 30,
      pricePerKm: 0.5,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 120,
      icon: '🏗️',
    },
    green_cleaning: {
      name: 'Green Cleaning',
      description: 'Professional eco-friendly cleaning services',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 90,
      icon: '🌱',
    },
    
    // ============================================================
    // ERRAND RUNNER SERVICES (Delivery)
    // ============================================================
    parcel_delivery: {
      name: 'Parcel Delivery',
      description: 'Same-day parcel delivery service',
      basePrice: 10,
      pricePerKm: 0.6,
      minPrice: 8,
      maxPrice: 25,
      estimatedTime: 30,
      icon: '📦',
      isPopular: true,
    },
    document_delivery: {
      name: 'Document Delivery',
      description: 'Secure document delivery service',
      basePrice: 12,
      pricePerKm: 0.6,
      minPrice: 10,
      maxPrice: 30,
      estimatedTime: 30,
      icon: '📄',
    },
    food_delivery: {
      name: 'Food Delivery',
      description: 'Food delivery from restaurants',
      basePrice: 8,
      pricePerKm: 0.5,
      minPrice: 5,
      maxPrice: 20,
      estimatedTime: 30,
      icon: '🍕',
    },
    grocery_delivery: {
      name: 'Grocery Delivery',
      description: 'Weekly grocery shopping and delivery',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '🛒',
      isPopular: true,
    },
    pharmacy_delivery: {
      name: 'Pharmacy Delivery',
      description: 'Prescription pickup and delivery',
      basePrice: 12,
      pricePerKm: 0.5,
      minPrice: 10,
      maxPrice: 25,
      estimatedTime: 45,
      icon: '💊',
    },
    same_day_delivery: {
      name: 'Same Day Delivery',
      description: 'Urgent same-day delivery service',
      basePrice: 15,
      pricePerKm: 0.7,
      minPrice: 12,
      maxPrice: 35,
      estimatedTime: 30,
      icon: '⚡',
    },
    next_day_delivery: {
      name: 'Next Day Delivery',
      description: 'Next day delivery service',
      basePrice: 10,
      pricePerKm: 0.5,
      minPrice: 8,
      maxPrice: 25,
      estimatedTime: 30,
      icon: '📅',
    },
    urgent_delivery: {
      name: 'Urgent Delivery',
      description: 'Urgent express delivery service',
      basePrice: 18,
      pricePerKm: 0.8,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 15,
      icon: '🚀',
    },
    bulk_delivery: {
      name: 'Bulk Delivery',
      description: 'Large item and bulk delivery service',
      basePrice: 25,
      pricePerKm: 0.6,
      minPrice: 20,
      maxPrice: 50,
      estimatedTime: 60,
      icon: '📦',
    },
    furniture_delivery: {
      name: 'Furniture Delivery',
      description: 'Furniture and large item delivery',
      basePrice: 30,
      pricePerKm: 0.7,
      minPrice: 25,
      maxPrice: 60,
      estimatedTime: 90,
      icon: '🛋️',
    },
    
    // ============================================================
    // ERRAND RUNNER SERVICES (Shopping)
    // ============================================================
    grocery_shopping: {
      name: 'Grocery Shopping',
      description: 'Professional grocery shopping assistance',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '🛒',
    },
    pharmacy_pickup: {
      name: 'Pharmacy Pickup',
      description: 'Prescription pickup service',
      basePrice: 10,
      pricePerKm: 0.5,
      minPrice: 8,
      maxPrice: 20,
      estimatedTime: 30,
      icon: '💊',
    },
    retail_shopping: {
      name: 'Retail Shopping',
      description: 'Personal shopping assistance',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '🛍️',
    },
    elderly_shopping: {
      name: 'Elderly Shopping',
      description: 'Compassionate shopping for elderly',
      basePrice: 18,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 35,
      estimatedTime: 90,
      icon: '👴',
      requiresDBS: true,
    },
    clothing_shopping: {
      name: 'Clothing Shopping',
      description: 'Personal clothing shopping assistance',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '👗',
    },
    gift_shopping: {
      name: 'Gift Shopping',
      description: 'Personalized gift shopping service',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '🎁',
    },
    bulk_shopping: {
      name: 'Bulk Shopping',
      description: 'Bulk item shopping and delivery',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 90,
      icon: '📦',
    },
    weekly_shop: {
      name: 'Weekly Shop',
      description: 'Regular weekly shopping service',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '📋',
    },
    emergency_shopping: {
      name: 'Emergency Shopping',
      description: 'Urgent emergency shopping service',
      basePrice: 20,
      pricePerKm: 0.7,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 30,
      icon: '🚨',
    },
    
    // ============================================================
    // ERRAND RUNNER SERVICES (General Errands)
    // ============================================================
    dry_cleaning_pickup: {
      name: 'Dry Cleaning Pickup',
      description: 'Pickup and delivery of dry cleaning',
      basePrice: 12,
      pricePerKm: 0.5,
      minPrice: 10,
      maxPrice: 25,
      estimatedTime: 45,
      icon: '👔',
    },
    key_collection: {
      name: 'Key Collection',
      description: 'Secure key collection and delivery',
      basePrice: 10,
      pricePerKm: 0.5,
      minPrice: 8,
      maxPrice: 20,
      estimatedTime: 30,
      icon: '🔑',
    },
    bill_payments: {
      name: 'Bill Payments',
      description: 'Bill payment and errand service',
      basePrice: 10,
      pricePerKm: 0.5,
      minPrice: 8,
      maxPrice: 20,
      estimatedTime: 30,
      icon: '💳',
    },
    queue_standing: {
      name: 'Queue Standing',
      description: 'Stand in queues on your behalf',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '👥',
    },
    school_pickup: {
      name: 'School Pickup',
      description: 'Safe school pickup and dropoff',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '🏫',
      requiresDBS: true,
    },
    pet_assistance: {
      name: 'Pet Assistance',
      description: 'Pet care and assistance services',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '🐕',
    },
    appointment_assistance: {
      name: 'Appointment Assistance',
      description: 'Appointment booking and assistance',
      basePrice: 12,
      pricePerKm: 0.5,
      minPrice: 10,
      maxPrice: 25,
      estimatedTime: 45,
      icon: '📅',
    },
    business_errands: {
      name: 'Business Errands',
      description: 'Professional business errand services',
      basePrice: 18,
      pricePerKm: 0.6,
      minPrice: 15,
      maxPrice: 35,
      estimatedTime: 60,
      icon: '🏢',
    },
    post_office_errands: {
      name: 'Post Office Errands',
      description: 'Post office and mailing services',
      basePrice: 10,
      pricePerKm: 0.5,
      minPrice: 8,
      maxPrice: 20,
      estimatedTime: 30,
      icon: '📮',
    },
    bank_errands: {
      name: 'Bank Errands',
      description: 'Banking and financial errand services',
      basePrice: 12,
      pricePerKm: 0.5,
      minPrice: 10,
      maxPrice: 25,
      estimatedTime: 45,
      icon: '🏦',
    },
    return_packages: {
      name: 'Return Packages',
      description: 'Package return and shipping service',
      basePrice: 10,
      pricePerKm: 0.5,
      minPrice: 8,
      maxPrice: 20,
      estimatedTime: 30,
      icon: '📦',
    },
    pickup_services: {
      name: 'Pickup Services',
      description: 'General pickup and collection service',
      basePrice: 12,
      pricePerKm: 0.5,
      minPrice: 10,
      maxPrice: 25,
      estimatedTime: 30,
      icon: '📍',
    },
    
    // ============================================================
    // ERRAND RUNNER SERVICES (Care Errands)
    // ============================================================
    prescription_pickup: {
      name: 'Prescription Pickup',
      description: 'Prescription collection and delivery',
      basePrice: 12,
      pricePerKm: 0.5,
      minPrice: 10,
      maxPrice: 25,
      estimatedTime: 45,
      icon: '💊',
      requiresDBS: true,
    },
    medical_equipment_delivery: {
      name: 'Medical Equipment Delivery',
      description: 'Medical equipment delivery service',
      basePrice: 15,
      pricePerKm: 0.6,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 45,
      icon: '🩺',
      requiresDBS: true,
    },
    care_package_delivery: {
      name: 'Care Package Delivery',
      description: 'Care package delivery service',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 45,
      icon: '📦',
      requiresDBS: true,
    },
    companionship_visits: {
      name: 'Companionship Visits',
      description: 'Compassionate companionship visits',
      basePrice: 20,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '🤗',
      requiresDBS: true,
    },
    hospital_transport: {
      name: 'Hospital Transport',
      description: 'Safe hospital transport service',
      basePrice: 20,
      pricePerKm: 0.6,
      minPrice: 15,
      maxPrice: 40,
      estimatedTime: 60,
      icon: '🚑',
      requiresDBS: true,
    },
    doctor_appointment_assistance: {
      name: 'Doctor Appointment Assistance',
      description: 'Doctor appointment assistance and support',
      basePrice: 18,
      pricePerKm: 0.5,
      minPrice: 15,
      maxPrice: 35,
      estimatedTime: 60,
      icon: '👨‍⚕️',
      requiresDBS: true,
    },
    home_help_errands: {
      name: 'Home Help Errands',
      description: 'Home help and assistance errands',
      basePrice: 15,
      pricePerKm: 0.5,
      minPrice: 12,
      maxPrice: 30,
      estimatedTime: 60,
      icon: '🏠',
      requiresDBS: true,
    },
  };

  // Get the service data for this subCategory
  const serviceData = serviceMap[subCategory];
  if (!serviceData) {
    log(`No service mapping found for "${subCategory}"`, 'warning');
    return null;
  }

  return {
    ...serviceData,
    category: subCategory,
    // Add the parent category name as a tag
    tags: [categoryName],
  };
};

// 4. Seed Users (Customers, Providers, Errand Runners)
const seedUsers = async () => {
  log('Seeding Users...', 'step');
  
  try {
    const count = await User.countDocuments({ role: { $ne: 'admin' } });
    
    if (count > 0) {
      log(`Users already exist (${count} non-admin users found)`, 'info');
      return { success: true, message: `Users already exist (${count})` };
    }
    
    const users = [];
    
    // ============================================================
    // CUSTOMERS
    // ============================================================
    const customers = [
      { fullName: 'John Smith', email: 'customer1@example.com', phoneNumber: '07700900110' },
      { fullName: 'Sarah Johnson', email: 'customer2@example.com', phoneNumber: '07700900111' },
      { fullName: 'Michael Brown', email: 'customer3@example.com', phoneNumber: '07700900112' },
      { fullName: 'Emma Wilson', email: 'customer4@example.com', phoneNumber: '07700900113' },
    ];

    for (const data of customers) {
      const user = new User({
        ...data,
        password: 'Customer123!',
        role: 'customer',
        isActive: true,
        isVerified: true,
        acceptedTerms: true,
        acceptedPrivacy: true,
        over18: true,
        address: {
          street: `${Math.floor(Math.random() * 100) + 1} Customer Lane`,
          town: ['London', 'Manchester', 'Birmingham', 'Leeds'][Math.floor(Math.random() * 4)],
          postcode: `SW${Math.floor(Math.random() * 20) + 1} ${Math.floor(Math.random() * 90) + 10}AA`,
        },
      });
      await user.save();
      users.push(user);
      log(`Created customer: ${user.fullName} (${user.email})`, 'success');
    }

    // ============================================================
    // SERVICE PROVIDERS
    // ============================================================
    const providers = [
      { 
        fullName: 'NurseCare UK', 
        email: 'nurse@example.com', 
        phoneNumber: '07700900120',
        categories: ['nursing', 'caregiving', 'home_health_aide'],
        about: 'Professional nursing and care services with 10+ years experience.',
        hourlyRate: 30,
        dbsChecked: true,
      },
      { 
        fullName: 'Plumbing Pro', 
        email: 'plumbing@example.com', 
        phoneNumber: '07700900121',
        categories: ['plumbing', 'general_handyman'],
        about: 'Expert plumbing and handyman services with 15 years experience.',
        hourlyRate: 35,
        dbsChecked: false,
      },
      { 
        fullName: 'Sparky Electrical', 
        email: 'electrical@example.com', 
        phoneNumber: '07700900122',
        categories: ['electrical', 'tv_mounting'],
        about: 'Certified electrician with 12 years experience.',
        hourlyRate: 35,
        dbsChecked: false,
      },
      { 
        fullName: 'Legal Eagles', 
        email: 'legal@example.com', 
        phoneNumber: '07700900123',
        categories: ['legal_advice', 'consulting'],
        about: 'Professional legal and business consulting services.',
        hourlyRate: 45,
        dbsChecked: false,
      },
      { 
        fullName: 'Clean & Shine', 
        email: 'cleaning@example.com', 
        phoneNumber: '07700900124',
        categories: ['residential_cleaning', 'deep_cleaning'],
        about: 'Professional cleaning services for homes and offices.',
        hourlyRate: 20,
        dbsChecked: false,
      },
      { 
        fullName: 'Tutor Masters', 
        email: 'tutor@example.com', 
        phoneNumber: '07700900125',
        categories: ['tutoring'],
        about: 'Expert tutoring in Maths, Science, and English.',
        hourlyRate: 25,
        dbsChecked: true,
      },
      { 
        fullName: 'Massage Therapy UK', 
        email: 'massage@example.com', 
        phoneNumber: '07700900126',
        categories: ['massage_therapy'],
        about: 'Professional massage therapy and wellness services.',
        hourlyRate: 30,
        dbsChecked: false,
      },
      { 
        fullName: 'Green Thumb Gardens', 
        email: 'gardening@example.com', 
        phoneNumber: '07700900127',
        categories: ['gardening_landscaping'],
        about: 'Expert gardening and landscaping services.',
        hourlyRate: 25,
        dbsChecked: false,
      },
    ];

    for (const data of providers) {
      const user = new User({
        fullName: data.fullName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: 'Provider123!',
        role: 'provider',
        isActive: true,
        isVerified: true,
        verificationStatus: 'approved',
        acceptedTerms: true,
        acceptedPrivacy: true,
        over18: true,
        serviceCategories: data.categories,
        address: {
          street: `${Math.floor(Math.random() * 100) + 1} Business Street`,
          town: ['London', 'Manchester', 'Birmingham'][Math.floor(Math.random() * 3)],
          postcode: `SW1A ${Math.floor(Math.random() * 90) + 10}AA`,
        },
        averageRating: 4 + (Math.random() * 0.5),
        totalReviews: Math.floor(Math.random() * 20) + 5,
        isAvailable: true,
        location: {
          type: 'Point',
          coordinates: [-0.1276 + (Math.random() - 0.5) * 0.05, 51.5074 + (Math.random() - 0.5) * 0.05],
        },
      });
      await user.save();
      users.push(user);

      // Create provider profile
      const profile = new ProviderProfile({
        userId: user._id,
        serviceCategories: data.categories,
        serviceAreas: ['London', 'Manchester', 'Birmingham'],
        maxDistance: 15 + Math.floor(Math.random() * 15),
        completedJobs: Math.floor(Math.random() * 30) + 5,
        totalEarnings: Math.floor(Math.random() * 5000) + 500,
        completionRate: 90 + Math.floor(Math.random() * 9),
        isVerified: true,
        about: data.about,
        hourlyRate: data.hourlyRate,
        rateType: 'hourly',
        certifications: data.dbsChecked ? ['DBS Checked'] : [],
        verificationStatus: 'approved',
        dbsChecked: data.dbsChecked || false,
        insuranceStatus: 'active',
      });
      await profile.save();

      // Create wallet
      const wallet = new Wallet({
        userId: user._id,
        balance: Math.floor(Math.random() * 500) + 100,
        totalEarned: Math.floor(Math.random() * 3000) + 500,
      });
      await wallet.save();

      log(`Created provider: ${user.fullName} (${user.email})`, 'success');
    }

    // ============================================================
    // ERRAND RUNNERS
    // ============================================================
    const runners = [
      { 
        fullName: 'Speedy Runner', 
        email: 'runner1@example.com', 
        phoneNumber: '07700900130',
        vehicleType: 'car',
        maxWeightCapacity: 25,
      },
      { 
        fullName: 'Quick Deliver', 
        email: 'runner2@example.com', 
        phoneNumber: '07700900131',
        vehicleType: 'bicycle',
        maxWeightCapacity: 10,
      },
      { 
        fullName: 'Reliable Courier', 
        email: 'runner3@example.com', 
        phoneNumber: '07700900132',
        vehicleType: 'motorbike',
        maxWeightCapacity: 20,
      },
      { 
        fullName: 'Eco Runner', 
        email: 'runner4@example.com', 
        phoneNumber: '07700900133',
        vehicleType: 'walking',
        maxWeightCapacity: 5,
      },
    ];

    for (const data of runners) {
      const user = new User({
        fullName: data.fullName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: 'Runner123!',
        role: 'errand_runner',
        isActive: true,
        isVerified: true,
        verificationStatus: 'approved',
        acceptedTerms: true,
        acceptedPrivacy: true,
        over18: true,
        address: {
          street: `${Math.floor(Math.random() * 100) + 1} Runner Road`,
          town: ['London', 'Manchester', 'Birmingham'][Math.floor(Math.random() * 3)],
          postcode: `E${Math.floor(Math.random() * 20) + 1} ${Math.floor(Math.random() * 90) + 10}AB`,
        },
        averageRating: 4 + (Math.random() * 0.5),
        totalReviews: Math.floor(Math.random() * 15) + 3,
        isAvailable: true,
        location: {
          type: 'Point',
          coordinates: [-0.1276 + (Math.random() - 0.5) * 0.03, 51.5074 + (Math.random() - 0.5) * 0.03],
        },
      });
      await user.save();
      users.push(user);

      // Create errand runner profile
      const profile = new ErrandRunnerProfile({
        userId: user._id,
        vehicleType: data.vehicleType,
        maxWeightCapacity: data.maxWeightCapacity,
        maxDistancePreference: 5 + Math.floor(Math.random() * 15),
        verificationStatus: 'approved',
        isAvailable: true,
        completedJobs: Math.floor(Math.random() * 20) + 2,
        totalEarnings: Math.floor(Math.random() * 2000) + 200,
        location: {
          type: 'Point',
          coordinates: [-0.1276 + (Math.random() - 0.5) * 0.03, 51.5074 + (Math.random() - 0.5) * 0.03],
        },
      });
      await profile.save();

      // Create wallet
      const wallet = new Wallet({
        userId: user._id,
        balance: Math.floor(Math.random() * 300) + 50,
        totalEarned: Math.floor(Math.random() * 1500) + 200,
      });
      await wallet.save();

      log(`Created errand runner: ${user.fullName} (${user.email})`, 'success');
    }

    log(`${users.length} users created successfully`, 'success');
    return { success: true, message: `${users.length} users created` };
  } catch (error) {
    log(`User seeding failed: ${error.message}`, 'error');
    return { success: false, message: error.message };
  }
};

// 5. Seed Admin User (if not exists)
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

// 6. Seed Subscription Plans
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
      { name: 'Services', fn: seedServices },
      { name: 'Users', fn: seedUsers },
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
      services: seedServices,
      users: seedUsers,
      admin: seedAdminUser,
      subscriptions: seedSubscriptionPlans,
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
      services: await Service.countDocuments(),
      users: {
        total: await User.countDocuments(),
        customers: await User.countDocuments({ role: 'customer' }),
        providers: await User.countDocuments({ role: 'provider' }),
        errandRunners: await User.countDocuments({ role: 'errand_runner' }),
        admins: await User.countDocuments({ role: 'admin' }),
      },
      subscriptions: await SubscriptionPlan.countDocuments(),
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
    await Service.deleteMany({});
    await SubscriptionPlan.deleteMany({});
    await User.deleteMany({ role: { $ne: 'admin' } }); // Keep admin, delete other users
    await ProviderProfile.deleteMany({});
    await ErrandRunnerProfile.deleteMany({});
    await Wallet.deleteMany({});
    
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