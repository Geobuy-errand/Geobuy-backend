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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Service', serviceSchema);