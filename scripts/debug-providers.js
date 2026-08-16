const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User.model');
const ServiceCategory = require('../models/ServiceCategory.model');

const debugProviders = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get all categories
    const categories = await ServiceCategory.find({ isActive: true });
    console.log(`📂 Found ${categories.length} categories\n`);

    // Get all providers
    const providers = await User.find({ 
      role: 'provider',
      isActive: true,
      verificationStatus: 'approved'
    }).select('fullName email serviceCategories');

    console.log(`👤 Found ${providers.length} providers\n`);

    // Check each category
    for (const category of categories) {
      console.log(`\n📋 Category: ${category.label} (${category.name})`);
      console.log(`   Sub-categories: ${category.subCategories.join(', ')}`);
      
      // Find providers that match this category
      const matchingProviders = providers.filter(p => {
        if (!p.serviceCategories || p.serviceCategories.length === 0) return false;
        return p.serviceCategories.some(sc => category.subCategories.includes(sc));
      });
      
      console.log(`   ✅ ${matchingProviders.length} providers match this category`);
      
      if (matchingProviders.length > 0) {
        matchingProviders.forEach(p => {
          console.log(`      - ${p.fullName} (${p.email})`);
          console.log(`        Categories: ${p.serviceCategories.join(', ')}`);
        });
      } else {
        console.log(`   ⚠️ No providers match this category`);
      }
    }

    // Also check providers with categories that might not be in any category
    console.log('\n\n📊 Providers with categories not in any category:');
    const allSubCategories = categories.flatMap(c => c.subCategories);
    const orphanProviders = providers.filter(p => {
      if (!p.serviceCategories || p.serviceCategories.length === 0) return false;
      return p.serviceCategories.some(sc => !allSubCategories.includes(sc));
    });

    if (orphanProviders.length > 0) {
      orphanProviders.forEach(p => {
        console.log(`   - ${p.fullName} (${p.email})`);
        console.log(`     Categories: ${p.serviceCategories.join(', ')}`);
      });
    } else {
      console.log('   ✅ All provider categories are valid');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

debugProviders();