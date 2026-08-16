const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Service = require('../models/Service.model');
const Notification = require('../models/Notification.model');
const OSRMService = require('../services/osrmService');
const NominatimService = require('../services/nominatimService');


const getPricingSettings = async () => {
  const settings = await Settings.getSettings();
  return {
    BASE_FEE: settings.pricing.baseFee,
    SUBSCRIPTION_DISCOUNT: settings.pricing.subscriptionDiscount,
    HEAVY_ITEM_FEE: settings.pricing.heavyItemFee,
    WAIT_TIME_FEE_PER_MIN: settings.pricing.waitTimeFeePerMin,
    WAIT_TIME_FREE_MIN: settings.pricing.waitTimeFreeMin,
    PEAK_URGENT_FEE: settings.pricing.peakUrgentFee,
    EXTRA_STOP_FEE: settings.pricing.extraStopFee,
    DISTANCE_TIERS: settings.pricing.distanceTiers,
    PLATFORM_FEE_PERCENTAGE: settings.pricing.platformFeePercentage,
  };
};

// Helper function to get distance rate based on miles
const getDistanceRate = (miles, distanceTiers) => {
  if (miles <= distanceTiers.tier1.maxMiles) {
    return distanceTiers.tier1.ratePerMile;
  } else if (miles <= distanceTiers.tier2.maxMiles) {
    return distanceTiers.tier2.ratePerMile;
  } else if (miles <= distanceTiers.tier3.maxMiles) {
    return distanceTiers.tier3.ratePerMile;
  } else {
    return distanceTiers.tier4.ratePerMile;
  }
};

// Get all errands
exports.getErrands = async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'errand_runner') {
      query.providerId = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admins can see all errands
    } else {
      return res.status(403).json({ message: 'Access denied' });
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

// Get errand by ID
exports.getErrandById = async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('providerId', 'fullName email phoneNumber address');

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && 
        errand.customerId._id.toString() !== req.user._id.toString() &&
        (errand.providerId && errand.providerId._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(errand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create errand
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
      isHeavyItem,
      isPeakUrgent,
      extraStopsCount,
      waitTimeMinutes,
      minPrice,
      maxPrice,
    } = req.body;

    const pricing = await getPricingSettings();


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
    // STEP 4: Calculate Base Pricing
    // ============================================================
    
    // Distance tier rates
    const ratePerMile = getDistanceRate(distanceInMiles, pricing.DISTANCE_TIERS);
    const distanceFee = distanceInMiles * ratePerMile;
    
    let subtotal = pricing.BASE_FEE + distanceFee;
    
    // Additional charges
    if (isHeavyItem) subtotal += pricing.HEAVY_ITEM_FEE;
    if (waitTimeMinutes > pricing.WAIT_TIME_FREE_MIN) {
      const extraMinutes = waitTimeMinutes - pricing.WAIT_TIME_FREE_MIN;
      subtotal += extraMinutes * pricing.WAIT_TIME_FEE_PER_MIN;
    }
    if (isPeakUrgent) subtotal += pricing.PEAK_URGENT_FEE;
    if (extraStopsCount > 0) subtotal += extraStopsCount * pricing.EXTRA_STOP_FEE;
    
    subtotal = Math.round(subtotal * 100) / 100;
    
    // Apply subscription discount
    let discountPercentage = 0;
    let discountAmount = 0;
    let total = subtotal;
    
    if (isSubscribed) {
      discountPercentage = pricing.SUBSCRIPTION_DISCOUNT;
      discountAmount = Math.round((subtotal * discountPercentage / 100) * 100) / 100;
      total = Math.round((subtotal - discountAmount) * 100) / 100;
    }

    // Calculate revenue split
    const platformFee = Math.round((total * pricing.PLATFORM_FEE_PERCENTAGE / 100) * 100) / 100;
    const providerAmount = Math.round((total - platformFee) * 100) / 100;

    // ============================================================
    // STEP 5: Create Errand
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
      isHeavyItem: isHeavyItem || false,
      isPeakUrgent: isPeakUrgent || false,
      extraStopsCount: extraStopsCount || 0,
      waitTimeMinutes: waitTimeMinutes || 0,
      isSubscribed,
      baseFee: pricing.BASE_FEE,
      distanceRate: ratePerMile,
      distanceFee: Math.round(distanceFee * 100) / 100,
      subtotal: subtotal,
      total: total,
      discountPercentage,
      discountAmount,
      platformFee,
      providerAmount,
      minPrice: minPrice || Math.round(total * 0.80 * 100) / 100,
      maxPrice: maxPrice || Math.round(total * 1.20 * 100) / 100,
      negotiationStatus: 'open',
    });

    await errand.save();

    // ============================================================
    // STEP 6: Find and Notify Providers (Errand Runners)
    // ============================================================
    
    const allProviders = await User.find({
      role: 'errand_runner',
      isActive: true,
      isAvailable: true,
      verificationStatus: 'approved',
    });

    let providersWithDistance = [];
    let providersToNotify = [];

    if (allProviders.length > 0) {
      const providerCoords = allProviders.map(p => ({
        lat: p.location?.coordinates?.[1] || 51.5074,
        lon: p.location?.coordinates?.[0] || -0.1276,
      }));

      const distances = await OSRMService.getBatchDistances(
        pickupValidation.coordinates.lat,
        pickupValidation.coordinates.lon,
        providerCoords
      );

      providersWithDistance = allProviders.map((provider, index) => ({
        ...provider.toObject(),
        distance: distances[index]?.distance || 999,
        distanceText: distances[index]?.distance 
          ? `${distances[index].distance.toFixed(1)} miles` 
          : 'Unknown',
        duration: distances[index]?.duration || 999,
        durationText: distances[index]?.duration
          ? `${Math.round(distances[index].duration)} min`
          : 'Unknown',
      }));

      const sortedProviders = [...providersWithDistance].sort((a, b) => a.distance - b.distance);
      const NEARBY_THRESHOLD = 10;
      const nearbyProviders = sortedProviders.filter(p => p.distance <= NEARBY_THRESHOLD);
      
      if (nearbyProviders.length > 0) {
        providersToNotify = nearbyProviders.slice(0, 10);
      } else {
        providersToNotify = sortedProviders.slice(0, 20);
      }

      // Send notifications
      for (const provider of providersToNotify) {
        const notification = new Notification({
          userId: provider._id,
          type: 'booking_created',
          title: nearbyProviders.length > 0 ? 'New Errand Available Nearby!' : 'New Errand Available',
          message: nearbyProviders.length > 0 
            ? `New ${serviceType} errand available ${provider.distanceText} from you` 
            : `New ${serviceType} errand available (${provider.distanceText} away)`,
          data: { 
            errandId: errand._id, 
            distance: provider.distanceText,
            duration: provider.durationText,
            serviceType,
            isNearby: nearbyProviders.length > 0,
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
              estimatedPrice: total,
              isNearby: nearbyProviders.length > 0,
            });
          }
        } catch (socketError) {
          console.warn('Socket emit error:', socketError.message);
        }

        // Store matched providers on the errand
        errand.matchedProviders.push({
          providerId: provider._id,
          distance: provider.distance,
          distanceText: provider.distanceText,
          duration: provider.durationText,
          isNearby: provider.distance <= NEARBY_THRESHOLD,
        });
      }
      await errand.save();
    }

    // ============================================================
    // STEP 7: Response
    // ============================================================
    
    res.status(201).json({
      message: 'Errand created successfully',
      errand,
      priceBreakdown: {
        baseFee: pricing.BASE_FEE,
        distance: {
          miles: Math.round(distanceInMiles * 100) / 100,
          text: distanceResult.distance.text,
          ratePerMile: ratePerMile,
        },
        distanceFee: errand.distanceFee,
        additionalCharges: {
          heavyItem: isHeavyItem ? pricing.HEAVY_ITEM_FEE : null,
          waitTime: waitTimeMinutes > pricing.WAIT_TIME_FREE_MIN ? (waitTimeMinutes - pricing.WAIT_TIME_FREE_MIN) * pricing.WAIT_TIME_FEE_PER_MIN : null,
          peakUrgent: isPeakUrgent ? pricing.PEAK_URGENT_FEE : null,
          extraStops: extraStopsCount > 0 ? extraStopsCount * pricing.EXTRA_STOP_FEE : null,
        },
        subtotal: subtotal,
        discount: {
          percentage: discountPercentage,
          amount: discountAmount,
        },
        total: total,
      },
      negotiation: {
        status: 'open',
        minPrice: errand.minPrice,
        maxPrice: errand.maxPrice,
      },
      providerNotifications: {
        nearbyCount: providersWithDistance.filter(p => p.distance <= 10).length,
        totalNotified: providersToNotify.length,
        totalAvailable: allProviders.length,
      },
      nearestProviders: providersToNotify.map(p => ({
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
      return res.status(400).json({ message: 'Errand is not pending' });
    }

    errand.providerId = req.user._id;
    errand.status = 'accepted';
    errand.acceptedAt = new Date();

    await errand.save();

    // AUTO-CREATE CHAT
    try {
      const Chat = require('../models/Chat.model');
      let chat = await Chat.findOne({
        errandId: errand._id,
        isActive: true,
      });

      if (!chat) {
        chat = new Chat({
          participants: [
            { userId: errand.customerId },
            { userId: req.user._id },
          ],
          errandId: errand._id,
          isSupportChat: false,
        });
        await chat.save();

        // Notify both parties about chat
        const notification1 = new Notification({
          userId: errand.customerId,
          type: 'chat_created',
          title: 'Chat Available 💬',
          message: `You can now chat with ${req.user.fullName} about your errand`,
          data: { chatId: chat._id, errandId: errand._id },
        });
        await notification1.save();

        const notification2 = new Notification({
          userId: req.user._id,
          type: 'chat_created',
          title: 'Chat Available 💬',
          message: 'You can now chat with the customer about this errand',
          data: { chatId: chat._id, errandId: errand._id },
        });
        await notification2.save();
      }
    } catch (chatError) {
      console.warn('Chat creation failed:', chatError.message);
    }

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

    const previousStatus = errand.status;
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

    if (status === 'cancelled') {
      errand.cancellationReason = req.body.reason || 'Cancelled by user';
      errand.cancelledBy = req.user.role;
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

    // Create notification
    const recipientId = isCustomer ? errand.providerId?._id : errand.customerId._id;
    if (recipientId) {
      const notification = new Notification({
        userId: recipientId,
        type: `booking_${status}`,
        title: `Errand ${status}`,
        message: `Errand #${errand.errandId} is now ${status}`,
        data: { errandId: errand._id, status },
      });
      await notification.save();
    }

    // Emit socket events
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
      if (status === 'completed' || status === 'delivered') {
        io.to('admin_room').emit('errand-completed', {
          errandId: errand._id,
          errandCode: errand.errandId,
          customerId: errand.customerId._id,
          providerId: errand.providerId?._id,
          total: errand.total,
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


// Get errand stats for dashboard
exports.getErrandStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    let query = {};
    if (userRole === 'customer') {
      query.customerId = userId;
    } else if (userRole === 'errand_runner') {
      query.providerId = userId;
    }

    const stats = {
      total: await Errand.countDocuments(query),
      pending: await Errand.countDocuments({ ...query, status: 'pending' }),
      accepted: await Errand.countDocuments({ ...query, status: 'accepted' }),
      enRoute: await Errand.countDocuments({ ...query, status: 'en_route' }),
      collected: await Errand.countDocuments({ ...query, status: 'collected' }),
      delivered: await Errand.countDocuments({ ...query, status: 'delivered' }),
      completed: await Errand.countDocuments({ ...query, status: 'completed' }),
      cancelled: await Errand.countDocuments({ ...query, status: 'cancelled' }),
    };

    // Get total earnings for errand runner
    if (userRole === 'errand_runner') {
      const earnings = await Errand.aggregate([
        { $match: { providerId: userId, status: { $in: ['delivered', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$providerAmount' } } },
      ]);
      stats.totalEarnings = earnings[0]?.total || 0;
    }

    res.json(stats);
  } catch (error) {
    console.error('Get errand stats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get errands by status
exports.getErrandsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    let query = { status };

    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'errand_runner') {
      query.providerId = req.user._id;
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Validate status
    const validStatuses = ['pending', 'accepted', 'en_route', 'collected', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const errands = await Errand.find(query)
      .populate('customerId', 'fullName email phoneNumber')
      .populate('providerId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });

    res.json(errands);
  } catch (error) {
    console.error('Get errands by status error:', error);
    res.status(500).json({ message: error.message });
  }
};

