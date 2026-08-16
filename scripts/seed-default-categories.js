const mongoose = require('mongoose');
require('dotenv').config();
const ServiceCategory = require('../models/ServiceCategory.model');

const seedDefaultCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if categories already exist
    const existing = await ServiceCategory.countDocuments();
    if (existing > 0) {
      console.log(`⚠️ ${existing} categories already exist. Skipping seed.`);
      process.exit(0);
    }

    const categories = [
      // ============================================================
      // SERVICE PROVIDER CATEGORIES (Professional Services)
      // ============================================================
      {
        name: 'healthcare',
        label: 'Healthcare',
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
        displayOrder: 1,
        type: 'provider', // This is for service providers
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
        displayOrder: 2,
        type: 'provider',
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
        displayOrder: 3,
        type: 'provider',
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
        displayOrder: 4,
        type: 'provider',
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
        displayOrder: 5,
        type: 'provider',
      },

      // ============================================================
      // ERRAND RUNNER CATEGORIES (Task-Based Services)
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
        displayOrder: 6,
        type: 'errand_runner',
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
        displayOrder: 7,
        type: 'errand_runner',
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
        displayOrder: 8,
        type: 'errand_runner',
      },
      {
        name: 'care_errands',
        label: 'Care & Support',
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
        displayOrder: 9,
        type: 'errand_runner',
      },
    ];

    for (const categoryData of categories) {
      const category = new ServiceCategory(categoryData);
      await category.save();
      console.log(`✅ Created ${category.type}: ${category.label} with ${category.subCategories.length} sub-categories`);
    }

    console.log(`\n✅ Seeded ${categories.length} categories successfully!`);
    console.log('\n📋 Next steps:');
    console.log('1. Go to Admin Panel → Provider Management');
    console.log('2. Edit each provider and assign them to the appropriate categories');
    console.log('3. Go to Admin Panel → Errand Runner Management');
    console.log('4. Edit each runner and assign them to the appropriate categories');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding categories:', error);
    process.exit(1);
  }
};

seedDefaultCategories();