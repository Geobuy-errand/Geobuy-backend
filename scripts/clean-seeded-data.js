const mongoose = require('mongoose');
require('dotenv').config();
const Service = require('../models/Service.model');
const ServiceCategory = require('../models/ServiceCategory.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const Quote = require('../models/Quote.model');
const User = require('../models/User.model');

const cleanSeededData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\n🗑️  Cleaning up seeded data...\n');

    // 1. Delete all services
    const servicesCount = await Service.countDocuments();
    await Service.deleteMany({});
    console.log(`✅ Deleted ${servicesCount} services`);

    // 2. Delete all service categories
    const categoriesCount = await ServiceCategory.countDocuments();
    await ServiceCategory.deleteMany({});
    console.log(`✅ Deleted ${categoriesCount} service categories`);

    // 3. Delete all service requests
    const requestsCount = await ServiceRequest.countDocuments();
    await ServiceRequest.deleteMany({});
    console.log(`✅ Deleted ${requestsCount} service requests`);

    // 4. Delete all quotes
    const quotesCount = await Quote.countDocuments();
    await Quote.deleteMany({});
    console.log(`✅ Deleted ${quotesCount} quotes`);

    // 5. Reset provider serviceCategories to empty array
    const providerUpdate = await User.updateMany(
      { role: 'provider' },
      { $set: { serviceCategories: [] } }
    );
    console.log(`✅ Reset serviceCategories for ${providerUpdate.modifiedCount} providers`);

    // 6. Reset errand_runner serviceCategories to empty array
    const runnerUpdate = await User.updateMany(
      { role: 'errand_runner' },
      { $set: { serviceCategories: [] } }
    );
    console.log(`✅ Reset serviceCategories for ${runnerUpdate.modifiedCount} errand runners`);

    console.log('\n✅ Clean up completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Go to Admin Panel → Service Categories');
    console.log('2. Create your categories (e.g., "Healthcare", "Trades", "Professional Services")');
    console.log('3. Add sub-categories for each (e.g., "Nursing", "Plumbing", "Legal Advice")');
    console.log('4. Go to Provider Management and assign categories to providers');
    console.log('5. Go to Errand Runner Management and assign categories to runners');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning data:', error);
    process.exit(1);
  }
};

cleanSeededData();