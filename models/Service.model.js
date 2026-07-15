const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'shopping',
        'groceries',
        'pharmacy',
        'retail',
        'alcohol',
        'food_pickup',
        'parcel_delivery',
        'basic_care_and_support',
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
        'custom',
      ],
    },
    description: {
      type: String,
      required: true,
    },
    basePrice: {
      type: Number,
      required: true,
    },
    pricePerKm: {
      type: Number,
      default: 0,
    },
    minPrice: Number,
    maxPrice: Number,
    estimatedTime: {
      type: Number,
      required: true,
    },
    icon: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    requiresSpecialSkills: {
      type: Boolean,
      default: false,
    },
    requiresDBS: {
      type: Boolean,
      default: false,
    },
    serviceAreas: [String],
    restrictions: [String],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Service', serviceSchema);