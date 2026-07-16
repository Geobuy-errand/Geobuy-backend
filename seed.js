const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User.model');
const Service = require('./models/Service.model');
const Booking = require('./models/Booking.model');
const ProviderProfile = require('./models/ProviderProfile.model');
const Wallet = require('./models/Wallet.model');

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data (optional)
    await User.deleteMany({});
    await Service.deleteMany({});
    await Booking.deleteMany({});
    await ProviderProfile.deleteMany({});
    await Wallet.deleteMany({});

    console.log('Cleared existing data');

    // Create admin user
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
    console.log('Admin user created');

    // Create sample services
    const services = [
      {
        name: 'Grocery Delivery',
        category: 'groceries',
        description: 'We\'ll do your weekly grocery shopping and deliver it to your door.',
        basePrice: 15,
        pricePerKm: 0.5,
        minPrice: 10,
        maxPrice: 30,
        estimatedTime: 60,
        icon: '🛒',
        isPopular: true,
        isActive: true,
      },
      {
        name: 'Prescription Pickup',
        category: 'pharmacy',
        description: 'Collect your prescriptions from the pharmacy and deliver them to you.',
        basePrice: 12,
        pricePerKm: 0.4,
        minPrice: 8,
        maxPrice: 25,
        estimatedTime: 45,
        icon: '💊',
        isActive: true,
      },
      {
        name: 'Parcel Delivery',
        category: 'parcel_delivery',
        description: 'Same-day parcel delivery service for packages up to 10kg.',
        basePrice: 10,
        pricePerKm: 0.6,
        minPrice: 8,
        maxPrice: 35,
        estimatedTime: 45,
        icon: '📦',
        isPopular: true,
        isActive: true,
      },
      {
        name: 'Basic Care And Support',
        category: 'basic_care_and_support',
        description: 'Same-day parcel delivery service for packages up to 10kg.',
        basePrice: 10,
        pricePerKm: 0.6,
        minPrice: 8,
        maxPrice: 35,
        estimatedTime: 45,
        icon: '📦',
        isPopular: true,
        isActive: true,
      },
      {
        name: 'Food Pickup',
        category: 'food_pickup',
        description: 'Pick up your favorite takeaway and deliver it to your location.',
        basePrice: 8,
        pricePerKm: 0.4,
        minPrice: 5,
        maxPrice: 20,
        estimatedTime: 30,
        icon: '🍕',
        isActive: true,
      },
      {
        name: 'Document Delivery',
        category: 'document_delivery',
        description: 'Secure and timely delivery of important documents.',
        basePrice: 18,
        pricePerKm: 0.7,
        minPrice: 15,
        maxPrice: 40,
        estimatedTime: 60,
        icon: '📄',
        isActive: true,
      },
      {
        name: 'Elderly Shopping',
        category: 'elderly_shopping',
        description: 'Help elderly people with their shopping and errands.',
        basePrice: 20,
        pricePerKm: 0.5,
        minPrice: 15,
        maxPrice: 45,
        estimatedTime: 90,
        icon: '👴',
        requiresDBS: true,
        isActive: true,
      },
    ];

    const createdServices = [];
    for (const serviceData of services) {
      const service = new Service(serviceData);
      await service.save();
      createdServices.push(service);
    }
    console.log(`Created ${createdServices.length} services`);

    // Create sample providers
    const providerUsers = [];
    for (let i = 1; i <= 5; i++) {
      const provider = new User({
        fullName: `Provider ${i}`,
        email: `provider${i}@example.com`,
        phoneNumber: `0770090000${i}`,
        password: 'Provider123!',
        role: 'provider',
        isActive: true,
        isVerified: true,
        verificationStatus: 'approved',
        acceptedTerms: true,
        acceptedPrivacy: true,
        over18: true,
        address: {
          street: `${i} Main Street`,
          town: 'London',
          postcode: `SW1A ${i}AA`,
        },
        averageRating: 4 + (i % 2) * 0.5,
        totalReviews: i * 3,
        isAvailable: true,
        location: {
          type: 'Point',
          coordinates: [-0.1276 + i * 0.01, 51.5074 + i * 0.01],
        },
      });
      await provider.save();
      providerUsers.push(provider);

      // Create provider profile
      const providerProfile = new ProviderProfile({
        userId: provider._id,
        services: createdServices.slice(0, i % 3 + 1).map(s => s._id),
        serviceAreas: ['London', 'Westminster'],
        maxDistance: 10 + i,
        completedJobs: i * 4,
        totalEarnings: i * 250,
        completionRate: 95 + i,
        isVerified: true,
        about: `Professional errand runner with ${i} years of experience.`,
      });
      await providerProfile.save();

      // Create wallet
      const wallet = new Wallet({
        userId: provider._id,
        balance: i * 150 + 50,
        totalEarned: i * 300,
      });
      await wallet.save();
    }
    console.log(`Created ${providerUsers.length} providers`);

    // Create sample customers
    const customerUsers = [];
    for (let i = 1; i <= 3; i++) {
      const customer = new User({
        fullName: `Customer ${i}`,
        email: `customer${i}@example.com`,
        phoneNumber: `077009000${i}0`,
        password: 'Customer123!',
        role: 'customer',
        isActive: true,
        isVerified: true,
        acceptedTerms: true,
        acceptedPrivacy: true,
        over18: true,
        address: {
          street: `${i} Customer Road`,
          town: 'London',
          postcode: `E1 ${i}AB`,
        },
      });
      await customer.save();
      customerUsers.push(customer);
    }
    console.log(`Created ${customerUsers.length} customers`);

    // Create sample bookings
    for (let i = 1; i <= 10; i++) {
      const statuses = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'];
      const status = statuses[i % statuses.length];
      const providerIndex = i % providerUsers.length;
      const customerIndex = i % customerUsers.length;
      const serviceIndex = i % createdServices.length;

      const booking = new Booking({
        bookingId: `GB-${2024}${String(i).padStart(2, '0')}${String(i % 12 + 1).padStart(2, '0')}-${String(i).padStart(4, '0')}`,
        customerId: customerUsers[customerIndex]._id,
        providerId: status !== 'pending' && status !== 'cancelled' ? providerUsers[providerIndex]._id : null,
        serviceId: createdServices[serviceIndex]._id,
        serviceType: createdServices[serviceIndex].category,
        pickup: {
          address: `${i} Pickup Street, London`,
          street: `${i} Pickup Street`,
          town: 'London',
          postcode: `SW${i} ${i}AB`,
          coordinates: {
            lat: 51.5074 + i * 0.005,
            lng: -0.1276 + i * 0.005,
          },
        },
        destination: {
          address: `${i} Destination Road, London`,
          street: `${i} Destination Road`,
          town: 'London',
          postcode: `E${i} ${i}CD`,
          coordinates: {
            lat: 51.5074 + i * 0.008,
            lng: -0.1276 + i * 0.008,
          },
        },
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
        time: `${10 + (i % 8)}:00`,
        description: `Sample booking ${i}`,
        estimatedPrice: 15 + i * 2.5,
        status: status,
        paymentStatus: status === 'completed' ? 'paid' : 'pending',
      });
      await booking.save();
    }
    console.log('Sample bookings created');

    console.log('✅ Database seeded successfully!');
    // process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    // process.exit(1);
  }
};

module.exports = seedDatabase;