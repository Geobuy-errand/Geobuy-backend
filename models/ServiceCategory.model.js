const mongoose = require('mongoose');

const serviceCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: '📋',
    },
    description: {
      type: String,
      default: '',
    },
    subCategories: [
      {
        type: String,
        required: true,
      }
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ServiceCategory', serviceCategorySchema);