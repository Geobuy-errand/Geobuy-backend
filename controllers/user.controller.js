const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const ErrandRunnerProfile = require('../models/ErrandRunnerProfile.model');
const Errand = require('../models/Errand.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const geoService = require('../services/geoService');
const { countryOfUser, isWithinCountry } = require('../config/countries');

const PUBLIC_PROFILE_FIELDS = 'fullName role averageRating totalReviews verificationBadges serviceCategories country address.town address.state createdAt';

/** Do these two users currently have an errand / service request together? */
async function haveActiveRelationship(a, b) {
  const pair = [
    { customerId: a, providerId: b },
    { customerId: b, providerId: a },
  ];
  if (await Errand.exists({ $or: pair })) return true;
  return Boolean(
    await ServiceRequest.exists({
      $or: [
        { customerId: a, selectedProviderId: b },
        { customerId: b, selectedProviderId: a },
        { customerId: a, 'invitedProviders.providerId': b },
        { customerId: b, 'invitedProviders.providerId': a },
      ],
    })
  );
}

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const allowedUpdates = [
      'fullName',
      'phoneNumber',
      'address',
      'accessNeeds',
      'preferredContactTime',
      'travelType',
      'serviceArea',
    ];

    const updates = {};
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Keep the map location in sync with the address so distance matching works.
    // (Accounts used to stay at [0,0] forever, so "nearby" matching never worked.)
    const country = countryOfUser(req.user);
    if (updates.address || req.body.coordinates) {
      const point = await geoService
        .resolvePoint({ ...(updates.address || req.user.address?.toObject?.() || req.user.address || {}), coordinates: req.body.coordinates }, country)
        .catch(() => null);
      if (point) updates.location = { type: 'Point', coordinates: [point.lng, point.lat] };
    }

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
        await ErrandRunnerProfile.findOneAndUpdate(
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
    const userUpdates = {};
    if (isAvailable !== undefined) {
      updates.isAvailable = isAvailable;
      userUpdates.isAvailable = isAvailable;
    }
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (location && isWithinCountry(lat, lng, countryOfUser(req.user))) {
      // Setting `location` and `location.lastUpdated` separately in one update
      // is a MongoDB path conflict — set the whole object instead.
      updates.location = { type: 'Point', coordinates: [lng, lat], lastUpdated: new Date() };
      // Runner matching reads User.location, so keep it current too.
      userUpdates.location = { type: 'Point', coordinates: [lng, lat] };
    }

    const profile = await ErrandRunnerProfile.findOneAndUpdate(
      { userId: req.user._id },
      updates,
      { new: true }
    );

    if (Object.keys(userUpdates).length) await User.findByIdAndUpdate(req.user._id, userUpdates);

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
      .populate('userId', 'fullName averageRating totalReviews country address.town address.state')
      .limit(20);

    res.json(runners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getErrandRunnerById = async (req, res) => {
  try {
    const runner = await ErrandRunnerProfile.findById(req.params.id)
      .select('-bankDetails -documents -dateOfBirth -phoneNumber -address.street -address.postcode')
      .populate('userId', 'fullName averageRating totalReviews country address.town address.state');

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
    if (location && isWithinCountry(location.lat, location.lng, countryOfUser(req.user))) {
      updates.location = {
        type: 'Point',
        coordinates: [Number(location.lng), Number(location.lat)],
      };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true }
    ).select('-password');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user._id}`).emit('availability-updated', {
        userId: req.user._id,
        isAvailable: user.isAvailable,
        location,
      });
    }

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

    if (req.query.country) query.country = String(req.query.country).toUpperCase();

    const providers = await User.find(query)
      .select('fullName address.town address.state averageRating totalReviews location country verificationBadges')
      .limit(20);

    res.json(providers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    // Contact details (email, phone, full address) are only shown to the user
    // themselves, admins, and people they have an errand / job with. This
    // endpoint used to return them to anyone, without logging in.
    const viewer = req.user;
    const isSelf = viewer && String(viewer._id) === String(req.params.id);
    const canSeeContact =
      viewer && (isSelf || viewer.role === 'admin' || (await haveActiveRelationship(viewer._id, req.params.id)));

    const fields = canSeeContact ? `${PUBLIC_PROFILE_FIELDS} email phoneNumber address` : PUBLIC_PROFILE_FIELDS;
    const user = await User.findById(req.params.id).select(fields);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ message: 'User not found' });
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