const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User.model');
const Service = require('./models/Service.model');
const Booking = require('./models/Booking.model');
const ProviderProfile = require('./models/ProviderProfile.model');
const Wallet = require('./models/Wallet.model');
const ErrandRunnerProfile = require('./models/ErrandRunnerProfile.model');
const SubscriptionPlan = require('./models/SubscriptionPlan.model');

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Service.deleteMany({});
    await Booking.deleteMany({});
    await ProviderProfile.deleteMany({});
    await Wallet.deleteMany({});
    await ErrandRunnerProfile.deleteMany({});
    await SubscriptionPlan.deleteMany({});

    console.log('Cleared existing data');

    // ============================================================
    // CREATE ADMIN
    // ============================================================
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
    });
    await admin.save();
    console.log('✅ Admin user created');

    // ============================================================
    // CREATE SERVICES
    // ============================================================
    const serviceDefinitions = [
      { name: 'Grocery Delivery', category: 'groceries', description: 'We\'ll do your weekly grocery shopping and deliver it to your door.', basePrice: 15, pricePerKm: 0.5, minPrice: 10, maxPrice: 30, estimatedTime: 60, icon: '🛒', isPopular: true },
      { name: 'Prescription Pickup', category: 'pharmacy', description: 'Collect your prescriptions from the pharmacy and deliver them to you.', basePrice: 12, pricePerKm: 0.4, minPrice: 8, maxPrice: 25, estimatedTime: 45, icon: '💊' },
      { name: 'Parcel Delivery', category: 'parcel_delivery', description: 'Same-day parcel delivery service for packages up to 10kg.', basePrice: 10, pricePerKm: 0.6, minPrice: 8, maxPrice: 35, estimatedTime: 45, icon: '📦', isPopular: true },
      { name: 'Food Pickup', category: 'food_pickup', description: 'Pick up your favorite takeaway and deliver it to your location.', basePrice: 8, pricePerKm: 0.4, minPrice: 5, maxPrice: 20, estimatedTime: 30, icon: '🍕' },
      { name: 'Document Delivery', category: 'document_delivery', description: 'Secure and timely delivery of important documents.', basePrice: 18, pricePerKm: 0.7, minPrice: 15, maxPrice: 40, estimatedTime: 60, icon: '📄' },
      { name: 'Elderly Shopping', category: 'elderly_shopping', description: 'Help elderly people with their shopping and errands.', basePrice: 20, pricePerKm: 0.5, minPrice: 15, maxPrice: 45, estimatedTime: 90, icon: '👴', requiresDBS: true },
      { name: 'Dry Cleaning', category: 'dry_cleaning', description: 'Pick up and deliver dry cleaning.', basePrice: 12, pricePerKm: 0.5, minPrice: 8, maxPrice: 25, estimatedTime: 45, icon: '👔' },
      { name: 'Key Collection', category: 'key_collection', description: 'Securely collect and deliver keys.', basePrice: 10, pricePerKm: 0.4, minPrice: 6, maxPrice: 20, estimatedTime: 30, icon: '🔑' },
      // ✅ Added Elderly Care as a separate service for the Care category
      { name: 'Elderly Care Service', category: 'basic_care_and_support', description: 'Professional elderly care and domestic support services.', basePrice: 25, pricePerKm: 0.5, minPrice: 20, maxPrice: 50, estimatedTime: 120, icon: '❤️', requiresDBS: true },
    ];

    const createdServices = [];
    for (const serviceData of serviceDefinitions) {
      const service = new Service({ ...serviceData, isActive: true });
      await service.save();
      createdServices.push(service);
    }
    console.log(`✅ Created ${createdServices.length} services`);

    // ============================================================
    // CREATE SERVICE PROVIDERS (One for each service category)
    // ============================================================
    const serviceProviderData = [
      { 
        name: 'Fresh Groceries Ltd', 
        email: 'groceries@example.com', 
        phone: '07700900011', 
        categories: ['groceries'], 
        about: 'Professional grocery delivery service with 5 years experience.' 
      },
      { 
        name: 'MediQuick Pharmacy', 
        email: 'pharmacy@example.com', 
        phone: '07700900012', 
        categories: ['pharmacy'], 
        about: 'Reliable prescription pickup and delivery service.' 
      },
      { 
        name: 'Swift Parcels', 
        email: 'parcel@example.com', 
        phone: '07700900013', 
        categories: ['parcel_delivery'], 
        about: 'Fast and secure parcel delivery across the UK.' 
      },
      { 
        name: 'Foodie Express', 
        email: 'food@example.com', 
        phone: '07700900014', 
        categories: ['food_pickup'], 
        about: 'Quick food pickup and delivery from your favorite restaurants.' 
      },
      { 
        name: 'Secure Docs', 
        email: 'documents@example.com', 
        phone: '07700900015', 
        categories: ['document_delivery'], 
        about: 'Secure and confidential document delivery service.' 
      },
      { 
        name: 'Elderly Care Plus', 
        email: 'elderly@example.com', 
        phone: '07700900016', 
        categories: ['elderly_shopping', 'basic_care_and_support'], 
        about: 'Compassionate elderly shopping and care assistance.',
        requiresDBS: true 
      },
      { 
        name: 'Crisp Cleaners', 
        email: 'drycleaning@example.com', 
        phone: '07700900017', 
        categories: ['dry_cleaning'], 
        about: 'Professional dry cleaning pickup and delivery.' 
      },
      { 
        name: 'Key Masters', 
        email: 'keys@example.com', 
        phone: '07700900018', 
        categories: ['key_collection'], 
        about: 'Secure key collection and delivery service.' 
      },
      // Additional service providers for variety
      { 
        name: 'Care & Comfort Services', 
        email: 'care@example.com', 
        phone: '07700900019', 
        categories: ['basic_care_and_support'], 
        about: 'Professional care and domestic support services.',
        requiresDBS: true 
      },
      { 
        name: 'Plumbing Pro', 
        email: 'plumbing@example.com', 
        phone: '07700900020', 
        categories: ['plumbing'], 
        about: 'Expert plumbing services for all your needs.' 
      },
      { 
        name: 'Sparky Electrical', 
        email: 'electrical@example.com', 
        phone: '07700900021', 
        categories: ['electrical'], 
        about: 'Certified electrical services and installations.' 
      },
      { 
        name: 'Clean & Shine', 
        email: 'cleaning@example.com', 
        phone: '07700900022', 
        categories: ['cleaning'], 
        about: 'Professional cleaning services for homes and offices.' 
      },
      // ✅ Added more Care providers
      { 
        name: 'Golden Years Care', 
        email: 'goldencare@example.com', 
        phone: '07700900023', 
        categories: ['basic_care_and_support', 'elderly_shopping'], 
        about: 'Specialized elderly care with 10 years of experience.',
        requiresDBS: true 
      },
      { 
        name: 'Home Help Heroes', 
        email: 'homehelp@example.com', 
        phone: '07700900024', 
        categories: ['basic_care_and_support'], 
        about: 'Domestic support and care for seniors and those with disabilities.',
        requiresDBS: true 
      },
    ];

    const serviceProviders = [];
    for (const data of serviceProviderData) {
      // Find matching services for this provider's categories
      const matchingServices = createdServices.filter(s => data.categories.includes(s.category));
      
      const provider = new User({
        fullName: data.name,
        email: data.email,
        phoneNumber: data.phone,
        password: 'Provider123!',
        role: 'provider', // ✅ Changed from 'provider' to 'provider'
        isActive: true,
        isVerified: true,
        verificationStatus: 'approved',
        acceptedTerms: true,
        acceptedPrivacy: true,
        over18: true,
        renderCareServices: data.requiresDBS || false,
        address: {
          street: `${Math.floor(Math.random() * 100) + 1} Business Street`,
          town: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow'][Math.floor(Math.random() * 5)],
          postcode: `SW1A ${Math.floor(Math.random() * 90) + 10}AA`,
        },
        averageRating: 4 + (Math.random() * 0.5),
        totalReviews: Math.floor(Math.random() * 20) + 5,
        isAvailable: true,
        serviceCategories: data.categories, // ✅ Store categories on user
        location: {
          type: 'Point',
          coordinates: [-0.1276 + (Math.random() - 0.5) * 0.05, 51.5074 + (Math.random() - 0.5) * 0.05],
        },
      });
      await provider.save();
      serviceProviders.push(provider);

      // Create provider profile with serviceCategories
      const providerProfile = new ProviderProfile({
        userId: provider._id,
        services: matchingServices.map(s => s._id),
        serviceCategories: data.categories, // ✅ Correctly set serviceCategories
        serviceAreas: ['London', 'Manchester', 'Birmingham'],
        maxDistance: 15 + Math.floor(Math.random() * 15),
        completedJobs: Math.floor(Math.random() * 30) + 5,
        totalEarnings: Math.floor(Math.random() * 5000) + 500,
        completionRate: 90 + Math.floor(Math.random() * 9),
        isVerified: true,
        about: data.about || `Professional ${data.categories.join(', ')} service provider.`,
        hourlyRate: 25 + Math.floor(Math.random() * 25),
        rateType: ['hourly', 'fixed', 'negotiable'][Math.floor(Math.random() * 3)],
        certifications: data.requiresDBS ? ['DBS Checked'] : [],
        verificationStatus: 'approved',
        dbsChecked: data.requiresDBS || false,
        insuranceStatus: 'active',
      });
      await providerProfile.save();

      // Create wallet
      const wallet = new Wallet({
        userId: provider._id,
        balance: Math.floor(Math.random() * 500) + 100,
        totalEarned: Math.floor(Math.random() * 3000) + 500,
      });
      await wallet.save();
    }
    console.log(`✅ Created ${serviceProviders.length} service providers`);

    // ============================================================
    // CREATE ERRAND RUNNERS
    // ============================================================
    const errandRunnerData = [
      { name: 'Speedy Runner', email: 'runner1@example.com', phone: '07700900101' },
      { name: 'Quick Deliver', email: 'runner2@example.com', phone: '07700900102' },
      { name: 'Reliable Courier', email: 'runner3@example.com', phone: '07700900103' },
    ];

    for (const data of errandRunnerData) {
      const runner = new User({
        fullName: data.name,
        email: data.email,
        phoneNumber: data.phone,
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
      await runner.save();

      // Create errand runner profile
      const runnerProfile = new ErrandRunnerProfile({
        userId: runner._id,
        vehicleType: ['car', 'bicycle', 'motorbike', 'walking'][Math.floor(Math.random() * 4)],
        maxWeightCapacity: 10 + Math.floor(Math.random() * 20),
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
      await runnerProfile.save();

      // Create wallet
      const wallet = new Wallet({
        userId: runner._id,
        balance: Math.floor(Math.random() * 300) + 50,
        totalEarned: Math.floor(Math.random() * 1500) + 200,
      });
      await wallet.save();
    }
    console.log('✅ Created errand runners');

    // ============================================================
    // CREATE CUSTOMERS
    // ============================================================
    const customerData = [
      { name: 'John Smith', email: 'customer1@example.com', phone: '07700900110' },
      { name: 'Sarah Johnson', email: 'customer2@example.com', phone: '07700900111' },
      { name: 'Michael Brown', email: 'customer3@example.com', phone: '07700900112' },
      { name: 'Emma Wilson', email: 'customer4@example.com', phone: '07700900113' },
    ];

    const customers = [];
    for (const data of customerData) {
      const customer = new User({
        fullName: data.name,
        email: data.email,
        phoneNumber: data.phone,
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
      await customer.save();
      customers.push(customer);
    }
    console.log(`✅ Created ${customers.length} customers`);

    // ============================================================
    // CREATE SUBSCRIPTION PLANS
    // ============================================================
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
        metadata: { savings: '38%' },
      },
    ];

    for (const planData of plans) {
      const plan = new SubscriptionPlan(planData);
      await plan.save();
    }
    console.log('✅ Created subscription plans');

    console.log('✅ Database seeded successfully!');
    console.log('\n📋 Available Care Providers for Elderly Care:');
    console.log('1. Elderly Care Plus (elderly@example.com) - Categories: elderly_shopping, basic_care_and_support');
    console.log('2. Care & Comfort Services (care@example.com) - Categories: basic_care_and_support');
    console.log('3. Golden Years Care (goldencare@example.com) - Categories: basic_care_and_support, elderly_shopping');
    console.log('4. Home Help Heroes (homehelp@example.com) - Categories: basic_care_and_support');
    
  } catch (error) {
    console.error('Seeding error:', error);
  }
};

module.exports = seedDatabase;