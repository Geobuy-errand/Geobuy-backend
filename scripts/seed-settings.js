const mongoose = require('mongoose');
require('dotenv').config();
const Settings = require('../models/Setting.model');

const seedSettings = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if settings exist
    let settings = await Settings.findOne();
    
    if (!settings) {
      console.log('📋 Creating default settings...');
      
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
      console.log('✅ Default settings created successfully!');
    } else {
      console.log('📋 Settings already exist, updating...');
      
      // Update existing settings with new fields if needed
      if (!settings.pricing?.platformFeePercentage) {
        settings.pricing.platformFeePercentage = 20;
        await settings.save();
        console.log('✅ Platform fee percentage added to settings');
      }
    }

    console.log('\n📊 Current settings:');
    console.log(`   Base Fee: £${settings.pricing?.baseFee || 3.99}`);
    console.log(`   Platform Fee: ${settings.pricing?.platformFeePercentage || 20}%`);
    console.log(`   Currency: ${settings.platform?.currencySymbol || '£'}${settings.platform?.currency || 'GBP'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding settings:', error);
    process.exit(1);
  }
};

seedSettings();