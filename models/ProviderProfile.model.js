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