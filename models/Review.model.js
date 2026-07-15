const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    revieweeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      maxlength: 500,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    response: {
      type: String,
      maxlength: 500,
    },
    respondedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Review', reviewSchema);