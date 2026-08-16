const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const ErrandRunnerProfile = require('../models/ErrandRunnerProfile.model');

// Update profile
exports.updateProfile = async (req, res) => {
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

    // If user is errand runner, update profile too
    if (req.user.role === 'errand_runner') {
      const runnerUpdates = {};
      const runnerAllowed = [
        'vehicleType',
        'maxWeightCapacity',
        'maxDistancePreference',
        'preferredAreas',
        'availableDays',
        'availableHours',
        'about',
        'languages',
        'skills',
      ];
      
      runnerAllowed.forEach((field) => {
        if (req.body[field] !== undefined) {
          runnerUpdates[field] = req.body[field];
        }
      });

      if (Object.keys(runnerUpdates).length > 0) {
        await ErrandRunnerProfileModel.findOneAndUpdate(
          { userId: req.user._id },
          runnerUpdates,
          { new: true }
        );
      }
    }

    // If user is service provider, update profile too
    if (req.user.role === 'provider') {
      const providerUpdates = {};
      const providerAllowed = [
        'serviceCategories',
        'certifications',
        'serviceAreas',
        'hourlyRate',
        'fixedRate',
        'rateType',
        'about',
      ];
      
      providerAllowed.forEach((field) => {
        if (req.body[field] !== undefined) {
          providerUpdates[field] = req.body[field];
        }
      });

      if (Object.keys(providerUpdates).length > 0) {
        await ProviderProfile.findOneAndUpdate(
          { userId: req.user._id },
          providerUpdates,
          { new: true }
        );
      }
    }

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getErrandRunnerProfile = async (req, res) => {
  try {
    const profile = await ErrandRunnerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: 'Errand runner profile not found' });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateErrandRunnerAvailability = async (req, res) => {
  try {
    const { isAvailable, location } = req.body;

    const updates = {};
    if (isAvailable !== undefined) updates.isAvailable = isAvailable;
    if (location) {
      updates.location = {
        type: 'Point',
        coordinates: [location.lng, location.lat],
      };
      updates['location.lastUpdated'] = new Date();
    }

    const profile = await ErrandRunnerProfile.findOneAndUpdate(
      { userId: req.user._id },
      updates,
      { new: true }
    );

    // Also update user's availability
    await User.findByIdAndUpdate(req.user._id, { isAvailable });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user._id}`).emit('availability-updated', {
        userId: req.user._id,
        isAvailable: profile?.isAvailable || isAvailable,
        location,
      });
    }

    res.json({
      message: 'Availability updated',
      profile,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAvailableErrandRunners = async (req, res) => {
  try {
    const { lat, lng, maxDistance = 10 } = req.query;

    let query = {
      isActive: true,
      isAvailable: true,
      verificationStatus: 'approved',
    };

    // Location-based query
    if (lat && lng) {
      query['location'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: maxDistance * 1000,
        },
      };
    }

    const runners = await ErrandRunnerProfile.find(query)
      .populate('userId', 'fullName phoneNumber address averageRating totalReviews')
      .limit(20);

    res.json(runners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getErrandRunnerById = async (req, res) => {
  try {
    const runner = await ErrandRunnerProfile.findById(req.params.id)
      .populate('userId', 'fullName email phoneNumber address averageRating totalReviews');

    if (!runner) {
      return res.status(404).json({ message: 'Errand runner not found' });
    }

    res.json(runner);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get provider profile
exports.getProviderProfile = async (req, res) => {
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
};

// Update provider availability
exports.updateAvailability = async (req, res) => {
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
};

// Get available providers
exports.getAvailableProviders = async (req, res) => {
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
          $maxDistance: maxDistance * 1000,
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
};

// Get user by ID
exports.getUserById = async (req, res) => {
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
};

// Update password
exports.changePassword = async (req, res) => {
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
};