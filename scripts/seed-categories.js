const mongoose = require('mongoose');
require('dotenv').config();
const ServiceCategory = require('../models/ServiceCategory.model');

const seedCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing categories
    await ServiceCategory.deleteMany({});
    console.log('Cleared existing categories');

    const categories = [
      {
        name: 'care',
        label: 'Care Services',
        icon: '❤️',
        description: 'Elderly care, childcare, personal care, and support services',
        subCategories: [
          'basic_care_and_support',
          'elderly_care',
          'childcare',
          'personal_care',
          'dementia_care',
          'live_in_care',
          'elderly_shopping',
        ],
        displayOrder: 1,
      },
      {
        name: 'trades',
        label: 'Trades & Handyman',
        icon: '🔧',
        description: 'Plumbing, electrical, carpentry, and home maintenance services',
        subCategories: [
          'plumbing',
          'electrical',
          'carpentry',
          'painting',
          'gardening',
          'roofing',
          'carpet_cleaning',
        ],
        displayOrder: 2,
      },
      {
        name: 'professional',
        label: 'Professional Services',
        icon: '💼',
        description: 'Legal, accounting, consulting, and financial services',
        subCategories: [
          'legal',
          'accounting',
          'consulting',
          'financial_advice',
          'tax_services',
        ],
        displayOrder: 3,
      },
      {
        name: 'personal',
        label: 'Personal Services',
        icon: '👤',
        description: 'Tutoring, fitness, beauty, and wellness services',
        subCategories: [
          'tutoring',
          'fitness_training',
          'beauty_services',
          'massage_therapy',
          'hairdressing',
          'nail_tech',
          'barbing',
        ],
        displayOrder: 4,
      },
      {
        name: 'other',
        label: 'Other Services',
        icon: '📋',
        description: 'Cleaning, events, pet sitting, and custom services',
        subCategories: [
          'cleaning_services',
          'event_planning',
          'pet_sitting',
          'house_sitting',
          'personal_shopping',
          'custom',
        ],
        displayOrder: 5,
      },
    ];

    for (const categoryData of categories) {
      const category = new ServiceCategory(categoryData);
      await category.save();
      console.log(`✅ Created category: ${category.label} with ${category.subCategories.length} sub-categories`);
    }

    console.log('✅ Categories seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding categories:', error);
    process.exit(1);
  }
};

seedCategories();