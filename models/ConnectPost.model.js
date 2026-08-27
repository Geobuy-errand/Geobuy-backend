const mongoose = require('mongoose');

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
      enum: [
        'England', 'Scotland', 'Wales', 'Northern Ireland',
        'London', 'Manchester', 'Birmingham', 'Liverpool',
        'Bristol', 'Sheffield', 'Leeds', 'Newcastle',
        'Nottingham', 'Southampton', 'Brighton', 'Oxford',
        'Cambridge', 'York', 'Bath', 'Edinburgh', 'Glasgow',
        'Aberdeen', 'Dundee', 'Cardiff', 'Swansea', 'Belfast',
        'Derry', 'All UK'
      ],
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