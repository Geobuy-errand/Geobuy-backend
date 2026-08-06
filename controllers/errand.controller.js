const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const DistanceService = require('../services/distanceService');
const OSRMService = require('../services/osrmService');
const NominatimService = require('../services/nominatimService');

// Get all errands for user
exports.getErrands = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'provider') {
      query.providerId = req.user._id;
    }
    
    const errands = await Errand.find(query)
      .populate('customerId', 'fullName email phoneNumber')
      .populate('providerId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });
    
    res.json(errands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get available errands for providers
exports.getAvailableErrands = async (req, res) => {
  try {
    const errands = await Errand.find({
      status: 'pending',
      providerId: null,
    })
      .populate('customerId', 'fullName phoneNumber address')
      .sort({ createdAt: -1 });
    
    res.json(errands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all errands for user
exports.getErrands = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'provider') {
      query.providerId = req.user._id;
    }
    
    const errands = await Errand.find(query)
      .populate('customerId', 'fullName email phoneNumber')
      .populate('providerId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });
    
    res.json(errands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get available errands for providers
exports.getAvailableErrands = async (req, res) => {
  try {
    const errands = await Errand.find({
      status: 'pending',
      providerId: null,
    })
      .populate('customerId', 'fullName phoneNumber address')
      .sort({ createdAt: -1 });
    
    res.json(errands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create errand with UK address validation and free distance calculation
exports.createErrand = async (req, res) => {
  try {
    const {
      serviceType,
      pickup,
      dropoff,
      taskDetails,
      preferredDate,
      preferredTime,
      requiresLiveTracking,
      photos,
    } = req.body;

    // ============================================================
    // STEP 1: Validate UK Addresses
    // ============================================================
    
    // Validate pickup address
    if (!pickup || !pickup.address) {
      return res.status(400).json({
        message: 'Pickup address is required',
      });
    }

    const pickupValidation = await NominatimService.validateUKAddress(pickup.address);
    
    if (!pickupValidation.isValid) {
      return res.status(400).json({
        message: 'Invalid pickup address. Please enter a valid UK address.',
        error: pickupValidation.error,
        suggestion: 'Check the address format and try again (e.g., "10 Downing Street, London")',
      });
    }

    // Validate dropoff address (if provided)
    let dropoffValidation = null;
    if (dropoff && dropoff.address) {
      dropoffValidation = await NominatimService.validateUKAddress(dropoff.address);
      
      if (!dropoffValidation.isValid) {
        return res.status(400).json({
          message: 'Invalid dropoff address. Please enter a valid UK address.',
          error: dropoffValidation.error,
          suggestion: 'Check the address format and try again (e.g., "10 Downing Street, London")',
        });
      }
    } else {
      // Dropoff is required for errands with distance-based pricing
      return res.status(400).json({
        message: 'Dropoff address is required for distance calculation.',
        suggestion: 'Please provide both pickup and dropoff addresses.',
      });
    }

    // ============================================================
    // STEP 2: Calculate Distance using OSRM (Free)
    // ============================================================
    
    const distanceResult = await OSRMService.getDistance(
      pickupValidation.coordinates.lat,
      pickupValidation.coordinates.lon,
      dropoffValidation.coordinates.lat,
      dropoffValidation.coordinates.lon
    );

    const distanceInMiles = distanceResult.distance.value;
    const travelDurationMinutes = distanceResult.duration.value; // Extract the number value
    const travelDurationText = distanceResult.duration.text; // Extract the formatted text

    // ============================================================
    // STEP 3: Get User's Subscription Status
    // ============================================================
    
    const user = await User.findById(req.user._id);
    const isSubscribed = user?.subscription?.isSubscribed || false;

    // ============================================================
    // STEP 4: Calculate Pricing
    // ============================================================
    
    // Pricing constants
    const BASE_FEE = 3.50;
    const DISTANCE_FEE_PER_MILE = 1.60;
    const SUBSCRIPTION_DISCOUNT = 20; // 20%
    
    // Calculate subtotal
    const distanceFee = distanceInMiles * DISTANCE_FEE_PER_MILE;
    const subtotal = distanceFee + BASE_FEE;
    
    // Apply subscription discount if applicable
    let discountPercentage = 0;
    let discountAmount = 0;
    let total = subtotal;

    if (isSubscribed) {
      discountPercentage = SUBSCRIPTION_DISCOUNT;
      discountAmount = Math.round((subtotal * discountPercentage) / 100 * 100) / 100;
      total = Math.round((subtotal - discountAmount) * 100) / 100;
    }

    // Calculate platform fee (10% of total)
    const platformFee = Math.round(total * 0.1 * 100) / 100;
    const providerAmount = Math.round((total - platformFee) * 100) / 100;

    // ============================================================
    // STEP 5: Create Errand - FIXED duration fields
    // ============================================================
    
    const errand = new Errand({
      customerId: req.user._id,
      serviceType,
      pickup: {
        ...pickup,
        formattedAddress: pickupValidation.formattedAddress,
        coordinates: {
          lat: pickupValidation.coordinates.lat,
          lng: pickupValidation.coordinates.lon,
        },
      },
      dropoff: {
        ...dropoff,
        formattedAddress: dropoffValidation.formattedAddress,
        coordinates: {
          lat: dropoffValidation.coordinates.lat,
          lng: dropoffValidation.coordinates.lon,
        },
      },
      taskDetails,
      preferredDate,
      preferredTime,
      photos: photos || [],
      requiresLiveTracking: requiresLiveTracking || false,
      status: 'pending',
      distance: Math.round(distanceInMiles * 100) / 100,
      distanceText: distanceResult.distance.text,
      duration: Math.round(travelDurationMinutes * 100) / 100, // Now storing as a number
      durationText: travelDurationText, // Store the formatted text
      baseFee: BASE_FEE,
      distanceFeePerMile: DISTANCE_FEE_PER_MILE,
      distanceFee: Math.round(distanceFee * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      discountPercentage,
      discountAmount,
      total: Math.round(total * 100) / 100,
      platformFee,
      providerAmount,
      isSubscribed,
    });

    await errand.save();

    // ============================================================
    // STEP 6: Find and Notify Nearby Providers
    // ============================================================
    
    // Get all active providers
    const providers = await User.find({
      role: 'provider',
      isActive: true,
      isAvailable: true,
      verificationStatus: 'approved',
    }).limit(20);

    let nearestProviders = [];

    if (providers.length > 0) {
      // Prepare provider coordinates for batch distance calculation
      const providerCoords = providers.map(p => ({
        lat: p.location?.coordinates?.[1] || 51.5074,
        lon: p.location?.coordinates?.[0] || -0.1276,
      }));

      // Calculate distances from pickup to each provider
      const distances = await OSRMService.getBatchDistances(
        pickupValidation.coordinates.lat,
        pickupValidation.coordinates.lon,
        providerCoords
      );

      // Sort providers by distance and get nearest 5
      const sortedProviders = providers.map((provider, index) => ({
        ...provider.toObject(),
        distance: distances[index]?.distance || 999,
        distanceText: distances[index]?.distance 
          ? `${distances[index].distance.toFixed(1)} miles` 
          : 'Unknown',
        duration: distances[index]?.duration || 999,
        durationText: distances[index]?.duration
          ? `${Math.round(distances[index].duration)} min`
          : 'Unknown',
      })).sort((a, b) => a.distance - b.distance);

      nearestProviders = sortedProviders.slice(0, 5);

      // Send notifications to nearest providers
      for (const provider of nearestProviders) {
        const notification = new Notification({
          userId: provider._id,
          type: 'booking_created',
          title: 'New Errand Available',
          message: `New ${serviceType} errand available ${provider.distanceText} from you`,
          data: { 
            errandId: errand._id, 
            distance: provider.distanceText,
            duration: provider.durationText,
            serviceType,
          },
        });
        await notification.save();

        // Emit socket event for real-time notification
        const io = req.app.get('io');
        io.to(`user_${provider._id}`).emit('new-errand-available', {
          errandId: errand._id,
          serviceType,
          distance: provider.distanceText,
          duration: provider.durationText,
          pickup: pickup.address,
          estimatedPrice: total,
        });
      }

      // Store matched providers on the errand
      errand.matchedProviders = nearestProviders.map(p => ({
        providerId: p._id,
        distance: p.distance,
        distanceText: p.distanceText,
        duration: p.durationText,
      }));
      await errand.save();
    }

    // ============================================================
    // STEP 7: Response
    // ============================================================
    
    res.status(201).json({
      message: 'Errand created successfully',
      errand,
      priceBreakdown: {
        distance: {
          miles: Math.round(distanceInMiles * 100) / 100,
          text: distanceResult.distance.text,
        },
        duration: {
          minutes: Math.round(travelDurationMinutes * 100) / 100,
          text: travelDurationText,
        },
        pricing: {
          baseFee: BASE_FEE,
          distanceFee: Math.round(distanceFee * 100) / 100,
          subtotal: Math.round(subtotal * 100) / 100,
          discountPercentage: isSubscribed ? SUBSCRIPTION_DISCOUNT : 0,
          discountAmount: discountAmount,
          total: Math.round(total * 100) / 100,
          platformFee: platformFee,
          providerAmount: providerAmount,
        },
        subscription: {
          isSubscribed,
          savings: isSubscribed ? discountAmount : 0,
        },
      },
      nearestProviders: nearestProviders.map(p => ({
        id: p._id,
        name: p.fullName,
        distance: p.distanceText,
        duration: p.durationText,
        rating: p.averageRating,
      })),
    });

  } catch (error) {
    console.error('Create errand error:', error);
    res.status(500).json({ 
      message: 'Failed to create errand',
      error: error.message,
    });
  }
};

// Accept errand
exports.acceptErrand = async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    if (errand.status !== 'pending') {
      return res.status(400).json({ message: 'Errand is not available' });
    }

    errand.providerId = req.user._id;
    errand.status = 'accepted';
    errand.acceptedAt = new Date();

    await errand.save();

    // Notify customer
    const notification = new Notification({
      userId: errand.customerId,
      type: 'booking_accepted',
      title: 'Errand Accepted',
      message: `${req.user.fullName} has accepted your errand`,
      data: { errandId: errand._id },
    });
    await notification.save();

    // Emit socket event
    const io = req.app.get('io');
    io.to(`errand_${errand._id}`).emit('errand-accepted', {
      errandId: errand._id,
      providerId: req.user._id,
      providerName: req.user.fullName,
    });

    res.json({
      message: 'Errand accepted successfully',
      errand,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update errand status
exports.updateErrandStatus = async (req, res) => {
  try {
    const { status, location } = req.body;
    const errand = await Errand.findById(req.params.id);

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId.toString() === req.user._id.toString();
    const isProvider = errand.providerId && errand.providerId.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const validTransitions = {
      pending: ['accepted', 'cancelled'],
      accepted: ['en_route', 'cancelled'],
      en_route: ['collected', 'cancelled'],
      collected: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };

    if (!validTransitions[errand.status]?.includes(status)) {
      return res.status(400).json({ message: 'Invalid status transition' });
    }

    errand.status = status;
    
    // Update timestamps
    const statusMap = {
      accepted: 'acceptedAt',
      en_route: 'enRouteAt',
      collected: 'collectedAt',
      delivered: 'deliveredAt',
      cancelled: 'cancelledAt',
    };
    
    if (statusMap[status]) {
      errand[statusMap[status]] = new Date();
    }

    // Add location update
    if (location) {
      errand.locationUpdates.push({
        lat: location.lat,
        lng: location.lng,
        timestamp: new Date(),
        status: status,
      });
    }

    await errand.save();

    // Notify other party
    const recipientId = isCustomer ? errand.providerId : errand.customerId;
    if (recipientId) {
      const notification = new Notification({
        userId: recipientId,
        type: `booking_${status}`,
        title: `Errand ${status}`,
        message: `Errand #${errand.errandId} is now ${status}`,
        data: { errandId: errand._id },
      });
      await notification.save();
    }

    // Emit socket event
    const io = req.app.get('io');
    io.to(`errand_${errand._id}`).emit('errand-status-updated', {
      errandId: errand._id,
      status,
      location,
    });

    res.json({
      message: 'Errand status updated',
      errand,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get errand by ID
exports.getErrandById = async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('providerId', 'fullName email phoneNumber address');

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    res.json(errand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Accept errand
exports.acceptErrand = async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    if (errand.status !== 'pending') {
      return res.status(400).json({ message: 'Errand is not available' });
    }

    errand.providerId = req.user._id;
    errand.status = 'accepted';
    errand.acceptedAt = new Date();

    await errand.save();

    // Notify customer
    const notification = new Notification({
      userId: errand.customerId,
      type: 'booking_accepted',
      title: 'Errand Accepted',
      message: `${req.user.fullName} has accepted your errand`,
      data: { errandId: errand._id },
    });
    await notification.save();

    res.json({
      message: 'Errand accepted successfully',
      errand,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update errand status
exports.updateErrandStatus = async (req, res) => {
  try {
    const { status, location } = req.body;
    const errand = await Errand.findById(req.params.id);

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId.toString() === req.user._id.toString();
    const isProvider = errand.providerId && errand.providerId.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const validTransitions = {
      pending: ['accepted', 'cancelled'],
      accepted: ['en_route', 'cancelled'],
      en_route: ['collected', 'cancelled'],
      collected: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };

    if (!validTransitions[errand.status]?.includes(status)) {
      return res.status(400).json({ message: 'Invalid status transition' });
    }

    errand.status = status;
    
    // Update timestamps
    const statusMap = {
      accepted: 'acceptedAt',
      en_route: 'enRouteAt',
      collected: 'collectedAt',
      delivered: 'deliveredAt',
      cancelled: 'cancelledAt',
    };
    
    if (statusMap[status]) {
      errand[statusMap[status]] = new Date();
    }

    // Add location update
    if (location) {
      errand.locationUpdates.push({
        lat: location.lat,
        lng: location.lng,
        timestamp: new Date(),
        status: status,
      });
    }

    await errand.save();

    // Notify other party
    const recipientId = isCustomer ? errand.providerId : errand.customerId;
    if (recipientId) {
      const notification = new Notification({
        userId: recipientId,
        type: `booking_${status}`,
        title: `Errand ${status}`,
        message: `Errand #${errand.errandId} is now ${status}`,
        data: { errandId: errand._id },
      });
      await notification.save();
    }

    res.json({
      message: 'Errand status updated',
      errand,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get errand by ID
exports.getErrandById = async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('providerId', 'fullName email phoneNumber address');

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    res.json(errand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};