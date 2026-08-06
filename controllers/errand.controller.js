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
      // New pricing fields
      isHeavyItem,
      isPeakUrgent,
      extraStopsCount,
      waitTimeMinutes,
    } = req.body;

    // ============================================================
    // STEP 1: Validate UK Addresses
    // ============================================================
    
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
      });
    }

    let dropoffValidation = null;
    if (dropoff && dropoff.address) {
      dropoffValidation = await NominatimService.validateUKAddress(dropoff.address);
      
      if (!dropoffValidation.isValid) {
        return res.status(400).json({
          message: 'Invalid dropoff address. Please enter a valid UK address.',
          error: dropoffValidation.error,
        });
      }
    } else {
      return res.status(400).json({
        message: 'Dropoff address is required for distance calculation.',
      });
    }

    // ============================================================
    // STEP 2: Calculate Distance using OSRM
    // ============================================================
    
    const distanceResult = await OSRMService.getDistance(
      pickupValidation.coordinates.lat,
      pickupValidation.coordinates.lon,
      dropoffValidation.coordinates.lat,
      dropoffValidation.coordinates.lon
    );

    const distanceInMiles = distanceResult.distance.value;
    const travelDurationMinutes = distanceResult.duration.value;
    const travelDurationText = distanceResult.duration.text;

    // ============================================================
    // STEP 3: Get User's Subscription Status
    // ============================================================
    
    const user = await User.findById(req.user._id);
    const isSubscribed = user?.subscription?.isSubscribed || false;

    // ============================================================
    // STEP 4: Create Errand with Pricing
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
      duration: Math.round(travelDurationMinutes * 100) / 100,
      durationText: travelDurationText,
      // New pricing fields
      isHeavyItem: isHeavyItem || false,
      isPeakUrgent: isPeakUrgent || false,
      extraStopsCount: extraStopsCount || 0,
      waitTimeMinutes: waitTimeMinutes || 0,
      isSubscribed,
    });

    // Pricing is calculated in the pre-save middleware
    await errand.save();

    // ============================================================
    // STEP 5: Find and Notify Nearby Providers
    // ============================================================
    
    const providers = await User.find({
      role: 'provider',
      isActive: true,
      isAvailable: true,
      verificationStatus: 'approved',
    }).limit(20);

    let nearestProviders = [];

    if (providers.length > 0) {
      const providerCoords = providers.map(p => ({
        lat: p.location?.coordinates?.[1] || 51.5074,
        lon: p.location?.coordinates?.[0] || -0.1276,
      }));

      const distances = await OSRMService.getBatchDistances(
        pickupValidation.coordinates.lat,
        pickupValidation.coordinates.lon,
        providerCoords
      );

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
            estimatedPrice: errand.total,
          },
        });
        await notification.save();

        // Emit socket event
        try {
          const io = req.app.get('io');
          if (io) {
            io.to(`user_${provider._id}`).emit('new-errand-available', {
              errandId: errand._id,
              serviceType,
              distance: provider.distanceText,
              duration: provider.durationText,
              pickup: pickup.address,
              estimatedPrice: errand.total,
            });
          }
        } catch (socketError) {
          console.warn('Socket emit error:', socketError.message);
        }
      }

      errand.matchedProviders = nearestProviders.map(p => ({
        providerId: p._id,
        distance: p.distance,
        distanceText: p.distanceText,
        duration: p.durationText,
      }));
      await errand.save();
    }

    // ============================================================
    // STEP 6: Response with Full Price Breakdown
    // ============================================================
    
    res.status(201).json({
      message: 'Errand created successfully',
      errand,
      priceBreakdown: {
        distance: {
          miles: Math.round(distanceInMiles * 100) / 100,
          text: distanceResult.distance.text,
          ratePerMile: errand.distanceRate,
        },
        duration: {
          minutes: Math.round(travelDurationMinutes * 100) / 100,
          text: travelDurationText,
        },
        baseFee: errand.baseFee,
        distanceFee: errand.distanceFee,
        additionalCharges: {
          heavyItem: errand.isHeavyItem ? errand.heavyItemFee : null,
          waitTime: errand.waitTimeMinutes > 5 ? errand.waitTimeFee : null,
          peakUrgent: errand.isPeakUrgent ? errand.peakUrgentFee : null,
          extraStops: errand.extraStopsCount > 0 ? errand.extraStopsFee : null,
        },
        subtotal: errand.subtotal,
        subscription: {
          isSubscribed: errand.isSubscribed,
          discountPercentage: errand.discountPercentage,
          discountAmount: errand.discountAmount,
        },
        total: errand.total,
        revenueSplit: {
          geobuyFee: errand.platformFee,
          providerAmount: errand.providerAmount,
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
// Update errand status with socket emission
exports.updateErrandStatus = async (req, res) => {
  try {
    const { status, location } = req.body;
    const errand = await Errand.findById(req.params.id)
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email phoneNumber');

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId._id.toString() === req.user._id.toString();
    const isProvider = errand.providerId && errand.providerId._id.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const validTransitions = {
      pending: ['accepted', 'cancelled'],
      accepted: ['en_route', 'cancelled'],
      en_route: ['collected', 'cancelled'],
      collected: ['delivered', 'cancelled'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[errand.status]?.includes(status)) {
      return res.status(400).json({ message: 'Invalid status transition' });
    }

    errand.status = status;
    
    const statusMap = {
      accepted: 'acceptedAt',
      en_route: 'enRouteAt',
      collected: 'collectedAt',
      delivered: 'deliveredAt',
      completed: 'completedAt',
      cancelled: 'cancelledAt',
    };
    
    if (statusMap[status]) {
      errand[statusMap[status]] = new Date();
    }

    if (location) {
      errand.locationUpdates.push({
        lat: location.lat,
        lng: location.lng,
        timestamp: new Date(),
        status: status,
      });
    }

    await errand.save();

    // Get payment info if completed
    let paymentInfo = null;
    if (status === 'completed') {
      paymentInfo = await Payment.findOne({ errandId: errand._id });
    }

    // Create notification
    const recipientId = isCustomer ? errand.providerId?._id : errand.customerId._id;
    if (recipientId) {
      await createNotification(
        recipientId,
        `errand_${status}`,
        `Errand ${status}`,
        `Errand #${errand.errandId} is now ${status}`,
        { errandId: errand._id, status }
      );
    }

    // Emit socket events to all relevant parties
    const io = req.app.get('io');
    if (io) {
      // Customer
      io.to(`user_${errand.customerId._id}`).emit('errand-status-updated', {
        errandId: errand._id,
        status: status,
        location: location,
        timestamp: new Date(),
        errand: errand,
      });

      // Provider
      if (errand.providerId) {
        io.to(`user_${errand.providerId._id}`).emit('errand-status-updated', {
          errandId: errand._id,
          status: status,
          location: location,
          timestamp: new Date(),
          errand: errand,
        });
      }

      // Admin
      io.to('admin_room').emit('errand-status-updated', {
        errandId: errand._id,
        status: status,
        customerId: errand.customerId._id,
        providerId: errand.providerId?._id,
        timestamp: new Date(),
        errand: {
          errandId: errand.errandId,
          serviceType: errand.serviceType,
          pickup: errand.pickup,
          dropoff: errand.dropoff,
          total: errand.total,
        },
      });

      // Errand room
      io.to(`errand_${errand._id}`).emit('errand-status-updated', {
        errandId: errand._id,
        status: status,
        location: location,
        timestamp: new Date(),
      });

      // If completed, emit completion event
      if (status === 'completed') {
        io.to('admin_room').emit('errand-completed', {
          errandId: errand._id,
          errandId: errand.errandId,
          customerId: errand.customerId._id,
          providerId: errand.providerId?._id,
          total: errand.total,
          paymentId: paymentInfo?._id,
          timestamp: new Date(),
        });

        // Send provider rating notification
        io.to(`user_${errand.customerId._id}`).emit('rate-provider', {
          errandId: errand._id,
          providerId: errand.providerId?._id,
          providerName: errand.providerId?.fullName,
        });
      }
    }

    res.json({
      message: `Errand ${status} successfully`,
      errand,
    });

  } catch (error) {
    console.error('Update errand status error:', error);
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