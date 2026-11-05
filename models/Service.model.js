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
    // Countries this service is offered in. basePrice etc. are the UK (£)
    // prices; pricesNG holds the Nigerian (₦) prices.
    countries: {
      type: [String],
      enum: ['GB', 'NG'],
      default: ['GB', 'NG'],
    },
    pricesNG: {
      basePrice: Number,
      pricePerKm: Number,
      minPrice: Number,
      maxPrice: Number,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Service', serviceSchema);