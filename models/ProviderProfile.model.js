const mongoose = require('mongoose');

const providerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
      },
    ],
    serviceCategories: [
      {
        type: String,
        enum: [
          // Errand & Delivery
          'shopping',
          'groceries',
          'pharmacy',
          'retail',
          'food_pickup',
          'parcel_delivery',
          'document_delivery',
          'dry_cleaning',
          'key_collection',
          'bill_payments',
          'queue_standing',
          'school_pickup',
          'pet_assistance',
          'elderly_shopping',
          'appointment_assistance',
          'business_deliveries',
          // Care & Support
          'basic_care_and_support',
          'elderly_care',
          'childcare',
          'personal_care',
          'dementia_care',
          'live_in_care',
          // Trades
          'plumbing',
          'electrical',
          'carpentry',
          'painting',
          'gardening',
          'roofing',
          'carpet_cleaning',
          // Professional
          'legal',
          'accounting',
          'consulting',
          'financial_advice',
          'tax_services',
          // Personal
          'tutoring',
          'fitness_training',
          'beauty_services',
          'massage_therapy',
          'hairdressing',
          'nail_tech',
          'barbing',
          // Other
          'cleaning_services',
          'event_planning',
          'pet_sitting',
          'house_sitting',
          'personal_shopping',
          'custom',
        ],
        default: [],
      }
    ],
    serviceAreas: [
      {
        type: String,
      },
    ],
    maxDistance: {
      type: Number,
      default: 10,
    },
    completedJobs: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    responseTime: {
      type: Number,
      default: 0,
    },
    completionRate: {
      type: Number,
      default: 0,
    },
    about: String,
    languages: [String],
    verificationDocuments: {
      type: Map,
      of: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationSubmittedAt: Date,
    verificationReviewedAt: Date,
    verificationNotes: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ProviderProfile', providerProfileSchema);