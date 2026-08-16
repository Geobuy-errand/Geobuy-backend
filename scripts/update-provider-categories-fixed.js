const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');

// Map email domains to appropriate categories
const PROVIDER_CATEGORY_MAP = {
  // Existing providers from seed
  'groceries@example.com': ['groceries'],
  'pharmacy@example.com': ['pharmacy'],
  'parcel@example.com': ['parcel_delivery'],
  'food@example.com': ['food_pickup'],
  'documents@example.com': ['document_delivery'],
  'elderly@example.com': ['elderly_shopping', 'basic_care_and_support'],
  'drycleaning@example.com': ['dry_cleaning'],
  'keys@example.com': ['key_collection'],
  'care@example.com': ['basic_care_and_support'],
  'plumbing@example.com': ['plumbing'],
  'electrical@example.com': ['electrical'],
  'cleaning@example.com': ['cleaning_services'],
  'goldencare@example.com': ['basic_care_and_support', 'elderly_shopping'],
  'homehelp@example.com': ['basic_care_and_support'],
  
  // Any additional providers
  'runner1@example.com': ['parcel_delivery', 'groceries'],
  'runner2@example.com': ['food_pickup', 'parcel_delivery'],
  'runner3@example.com': ['document_delivery', 'pharmacy'],
};

// Also map by name for any providers not matched by email
const PROVIDER_NAME_MAP = {
  'Fresh Groceries Ltd': ['groceries'],
  'MediQuick Pharmacy': ['pharmacy'],
  'Swift Parcels': ['parcel_delivery'],
  'Foodie Express': ['food_pickup'],
  'Secure Docs': ['document_delivery'],
  'Elderly Care Plus': ['elderly_shopping', 'basic_care_and_support'],
  'Crisp Cleaners': ['dry_cleaning'],
  'Key Masters': ['key_collection'],
  'Care & Comfort Services': ['basic_care_and_support'],
  'Plumbing Pro': ['plumbing'],
  'Sparky Electrical': ['electrical'],
  'Clean & Shine': ['cleaning_services'],
  'Golden Years Care': ['basic_care_and_support', 'elderly_shopping'],
  'Home Help Heroes': ['basic_care_and_support'],
  'Speedy Runner': ['parcel_delivery', 'groceries'],
  'Quick Deliver': ['food_pickup', 'parcel_delivery'],
  'Reliable Courier': ['document_delivery', 'pharmacy'],
};

const updateProviderCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all providers
    const providers = await User.find({ 
      role: 'provider',
      isActive: true 
    });

    console.log(`\n📊 Found ${providers.length} providers to update\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const provider of providers) {
      // Try to find categories by email
      let categories = PROVIDER_CATEGORY_MAP[provider.email];
      
      // If not found by email, try by name
      if (!categories) {
        categories = PROVIDER_NAME_MAP[provider.fullName];
      }

      // If still not found, assign default based on role or keep existing
      if (!categories) {
        // Check if provider already has categories
        if (provider.serviceCategories && provider.serviceCategories.length > 0) {
          console.log(`⏭️ ${provider.fullName} already has categories: ${provider.serviceCategories.join(', ')}`);
          skippedCount++;
          continue;
        }
        
        // Assign default based on provider type
        if (provider.fullName.toLowerCase().includes('care') || 
            provider.fullName.toLowerCase().includes('elderly')) {
          categories = ['basic_care_and_support', 'elderly_shopping'];
        } else if (provider.fullName.toLowerCase().includes('clean')) {
          categories = ['cleaning_services'];
        } else if (provider.fullName.toLowerCase().includes('plumb')) {
          categories = ['plumbing'];
        } else if (provider.fullName.toLowerCase().includes('electrical') || 
                   provider.fullName.toLowerCase().includes('sparky')) {
          categories = ['electrical'];
        } else {
          categories = ['custom'];
        }
      }

      // Update the provider
      provider.serviceCategories = categories;
      await provider.save();

      // Also update provider profile if it exists
      const profile = await ProviderProfile.findOne({ userId: provider._id });
      if (profile) {
        profile.serviceCategories = categories;
        await profile.save();
      }

      console.log(`✅ ${provider.fullName} (${provider.email}) updated with: ${categories.join(', ')}`);
      updatedCount++;
    }

    console.log(`\n📊 Summary: ${updatedCount} providers updated, ${skippedCount} skipped`);
    process.exit(0);
  } catch (error) {
    console.error('Error updating providers:', error);
    process.exit(1);
  }
};

updateProviderCategories();