const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');

// Valid service categories
const VALID_CATEGORIES = [
  // Errand & Delivery
  'shopping', 'groceries', 'pharmacy', 'retail', 'food_pickup',
  'parcel_delivery', 'document_delivery', 'dry_cleaning', 'key_collection',
  'bill_payments', 'queue_standing', 'school_pickup', 'pet_assistance',
  'elderly_shopping', 'appointment_assistance', 'business_deliveries',
  // Care & Support
  'basic_care_and_support', 'elderly_care', 'childcare', 'personal_care',
  'dementia_care', 'live_in_care',
  // Trades
  'plumbing', 'electrical', 'carpentry', 'painting', 'gardening',
  'roofing', 'carpet_cleaning',
  // Professional
  'legal', 'accounting', 'consulting', 'financial_advice', 'tax_services',
  // Personal
  'tutoring', 'fitness_training', 'beauty_services', 'massage_therapy',
  'hairdressing', 'nail_tech', 'barbing',
  // Other
  'cleaning_services', 'event_planning', 'pet_sitting', 'house_sitting',
  'personal_shopping', 'custom'
];

const updateProviderCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // First, update all users with role 'service' to 'provider'
    await User.updateMany(
      { role: 'service' },
      { $set: { role: 'provider' } }
    );
    console.log('✅ Updated users with role "service" to "provider"');

    // Update providers with service categories
    const updates = [
      { email: 'elderly@example.com', categories: ['elderly_shopping', 'basic_care_and_support'] },
      { email: 'care@example.com', categories: ['basic_care_and_support'] },
      { email: 'groceries@example.com', categories: ['groceries'] },
      { email: 'pharmacy@example.com', categories: ['pharmacy'] },
      { email: 'parcel@example.com', categories: ['parcel_delivery'] },
      { email: 'food@example.com', categories: ['food_pickup'] },
      { email: 'documents@example.com', categories: ['document_delivery'] },
      { email: 'drycleaning@example.com', categories: ['dry_cleaning'] },
      { email: 'keys@example.com', categories: ['key_collection'] },
      { email: 'plumbing@example.com', categories: ['plumbing'] },
      { email: 'electrical@example.com', categories: ['electrical'] },
      { email: 'cleaning@example.com', categories: ['cleaning_services'] },
    ];

    let updatedCount = 0;
    let errorCount = 0;

    for (const update of updates) {
      try {
        // Find the user
        const user = await User.findOne({ email: update.email });
        if (!user) {
          console.log(`⚠️ User not found: ${update.email}`);
          errorCount++;
          continue;
        }

        // Validate categories
        const validCategories = update.categories.filter(cat => 
          VALID_CATEGORIES.includes(cat)
        );

        if (validCategories.length === 0) {
          console.log(`⚠️ No valid categories for: ${update.email}`);
          errorCount++;
          continue;
        }

        // Update user
        user.serviceCategories = validCategories;
        if (user.role !== 'admin') {
          user.role = 'provider';
        }
        await user.save();

        // Update or create provider profile
        let profile = await ProviderProfile.findOne({ userId: user._id });
        if (profile) {
          profile.serviceCategories = validCategories;
          await profile.save();
        } else {
          // Create profile if it doesn't exist
          profile = new ProviderProfile({
            userId: user._id,
            serviceCategories: validCategories,
            serviceAreas: ['London', 'Manchester', 'Birmingham'],
            isVerified: true,
            verificationStatus: 'approved',
          });
          await profile.save();
        }

        console.log(`✅ Updated ${user.fullName} (${user.email}) with categories: ${validCategories.join(', ')}`);
        updatedCount++;

      } catch (error) {
        console.error(`❌ Error updating ${update.email}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n📊 Summary: ${updatedCount} providers updated, ${errorCount} errors`);
    process.exit(0);
  } catch (error) {
    console.error('Error updating providers:', error);
    process.exit(1);
  }
};

updateProviderCategories();