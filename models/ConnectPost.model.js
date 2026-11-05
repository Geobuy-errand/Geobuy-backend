const mongoose = require('mongoose');
const { ALL_REGIONS, canonicalRegion } = require('../config/locations');

const connectPostSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['meeting_venue', 'activity', 'announcement', 'event', 'general'],
      default: 'general',
    },
    state: {
      type: String,
      required: true,
      // UK regions/cities + Nigerian states (see config/locations.js).
      // The setter accepts 'london', 'st_albans', 'FCT' etc.
      enum: ALL_REGIONS,
      set: canonicalRegion,
    },
    country: {
      type: String,
      enum: ['GB', 'NG'],
      default: 'GB',
      index: true,
    },
    venue: {
      name: String,
      address: String,
      postcode: String,
      googleMapsUrl: String,
    },
    date: {
      type: Date,
    },
    time: {
      type: String,
    },
    imageUrl: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
    },
    views: {
      type: Number,
      default: 0,
    },
    tags: [String],
  },
  {
    timestamps: true,
  }
);

// Indexes
connectPostSchema.index({ state: 1, createdAt: -1 });
connectPostSchema.index({ type: 1 });
connectPostSchema.index({ isActive: 1 });
connectPostSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ConnectPost', connectPostSchema);