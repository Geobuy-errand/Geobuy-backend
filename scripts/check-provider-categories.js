const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User.model');

const checkProviderCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const providers = await User.find({ 
      role: 'provider',
      isActive: true 
    }).select('fullName email serviceCategories');

    console.log(`\n📊 Found ${providers.length} providers\n`);
    
    if (providers.length === 0) {
      console.log('⚠️ No providers found in the database!');
      process.exit(0);
    }

    providers.forEach((provider, index) => {
      console.log(`${index + 1}. ${provider.fullName} (${provider.email})`);
      console.log(`   Categories: ${provider.serviceCategories?.length > 0 ? provider.serviceCategories.join(', ') : '❌ NONE'}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkProviderCategories();