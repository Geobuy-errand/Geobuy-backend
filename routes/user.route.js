const express = require('express');
const router = express.Router();
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const { authMiddleware } = require('../middleware/auth.middleware');

// Update profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const allowedUpdates = [
      'fullName',
      'phoneNumber',
      'address',
      'accessNeeds',
      'preferredContactTime',
    ];

    const updates = {};
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get provider profile
router.get('/provider-profile', authMiddleware, async (req, res) => {
  try {
    const providerProfile = await ProviderProfile.findOne({ userId: req.user._id })
      .populate('services', 'name category description');

    if (!providerProfile) {
      return res.status(404).json({ message: 'Provider profile not found' });
    }

    res.json(providerProfile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update provider availability
router.put('/availability', authMiddleware, async (req, res) => {
  try {
    const { isAvailable, location } = req.body;

    const updates = {};
    if (isAvailable !== undefined) updates.isAvailable = isAvailable;
    if (location) {
      updates.location = {
        type: 'Point',
        coordinates: [location.lng, location.lat],
      };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true }
    ).select('-password');

    // Emit socket event
    const io = req.app.get('io');
    io.to(`user_${req.user._id}`).emit('availability-updated', {
      userId: req.user._id,
      isAvailable: user.isAvailable,
      location,
    });

    res.json({
      message: 'Availability updated',
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get available providers
router.get('/available-providers', async (req, res) => {
  try {
    const { lat, lng, maxDistance = 10, serviceId } = req.query;

    let query = {
      role: 'provider',
      isActive: true,
      isAvailable: true,
      verificationStatus: 'approved',
    };

    // Location-based query
    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: maxDistance * 1000, // Convert km to meters
        },
      };
    }

    // Filter by service
    if (serviceId) {
      const providerProfiles = await ProviderProfile.find({ services: serviceId });
      const providerIds = providerProfiles.map(p => p.userId);
      query._id = { $in: providerIds };
    }

    const providers = await User.find(query)
      .select('fullName phoneNumber address averageRating totalReviews location')
      .limit(20);

    res.json(providers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('fullName email phoneNumber address role averageRating totalReviews');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;