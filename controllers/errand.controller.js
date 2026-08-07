const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const DistanceService = require('../services/distanceService');
const OSRMService = require('../services/osrmService');
const NominatimService = require('../services/nominatimService');
const createNotification = require('../utils/create-notification');
const ChatModel = require('../models/Chat.model');


const BASE_FEE = 3.99;
const SUBSCRIPTION_DISCOUNT = 20; // 20%

// Get all errands for user
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
    let ratePerMile = 0.80;
    if (distanceInMiles <= 3) ratePerMile = 0.80;
    else if (distanceInMiles <= 10) ratePerMile = 0.70;
    else if (distanceInMiles <= 20) ratePerMile = 0.60;
    else ratePerMile = 0.50;

    const distanceFee = distanceInMiles * ratePerMile;
    let subtotal = BASE_FEE + distanceFee;
    
    // Additional charges
    if (isHeavyItem) subtotal += 2.99;
    if (waitTimeMinutes > 5) subtotal += (waitTimeMinutes - 5) * 0.30;
    if (isPeakUrgent) subtotal += 1.99;
    if (extraStopsCount > 0) subtotal += extraStopsCount * 1.50;
    
    subtotal = Math.round(subtotal * 100) / 100;
    
    // Apply subscription discount
    let discountPercentage = 0;
    let discountAmount = 0;
    let total = subtotal;
    
    if (isSubscribed) {
      discountPercentage = SUBSCRIPTION_DISCOUNT;
      discountAmount = Math.round((subtotal * SUBSCRIPTION_DISCOUNT / 100) * 100) / 100;
      total = Math.round((subtotal - discountAmount) * 100) / 100;
    }

    // ============================================================
    // STEP 5: Create Errand (No Provider Assigned Yet)
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
      // Additional charges
      isHeavyItem: isHeavyItem || false,
      isPeakUrgent: isPeakUrgent || false,
      extraStopsCount: extraStopsCount || 0,
      waitTimeMinutes: waitTimeMinutes || 0,
      isSubscribed,
      // Pricing
      baseFee: BASE_FEE,
      distanceRate: ratePerMile,
      distanceFee: Math.round(distanceFee * 100) / 100,
      subtotal: subtotal,
      total: total,
      discountPercentage,
      discountAmount,
      // Negotiation
      minPrice: minPrice || Math.round(total * 0.80 * 100) / 100,
      maxPrice: maxPrice || Math.round(total * 1.20 * 100) / 100,
      negotiationStatus: 'open',
      // No provider assigned yet, so platformFee and providerAmount = 0
      platformFee: 0,
      providerAmount: 0,
    });

    await errand.save();

    try {
      let chat = await ChatModel.findOne({
        errandId: errand._id,
        isActive: true,
      });

      if (!chat) {
        chat = new ChatModel({
          participants: [
            { userId: errand.customerId },
            { userId: req.user._id },
          ],
          errandId: errand._id,
          isSupportChat: false,
        });
        await chat.save();

        // Notify both parties about chat
        await createNotification(
          errand.customerId,
          'chat_created',
          'Chat Available 💬',
          `You can now chat with ${req.user.fullName} about your errand`,
          { chatId: chat._id, errandId: errand._id }
        );

        await createNotification(
          req.user._id,
          'chat_created',
          'Chat Available 💬',
          'You can now chat with the customer about this errand',
          { chatId: chat._id, errandId: errand._id }
        );
      }
    } catch (chatError) {
      console.warn('Chat creation failed:', chatError.message);
      // Don't fail the errand acceptance if chat creation fails
    }

    // ============================================================
    // STEP 6: Find and Notify Providers (With Fallback)
    // ============================================================
    
    // Get all active providers
    const allProviders = await User.find({
      role: 'provider',
      isActive: true,
      isAvailable: true,
      verificationStatus: 'approved',
    });

    let providersWithDistance = [];
    let nearestProviders = [];
    let allProvidersNotified = [];

    if (allProviders.length > 0) {
      // Prepare provider coordinates
      const providerCoords = allProviders.map(p => ({
        lat: p.location?.coordinates?.[1] || 51.5074,
        lon: p.location?.coordinates?.[0] || -0.1276,
      }));

      // Calculate distances from pickup to each provider
      const distances = await OSRMService.getBatchDistances(
        pickupValidation.coordinates.lat,
        pickupValidation.coordinates.lon,
        providerCoords
      );

      // Map providers with distances
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

      // Sort by distance
      const sortedProviders = [...providersWithDistance].sort((a, b) => a.distance - b.distance);

      // ============================================================
      // NOTIFICATION STRATEGY:
      // 1. Nearby providers (within 10 miles) get immediate notifications
      // 2. If NO nearby providers, all providers get notified
      // 3. All providers can see the errand in their "Available Jobs" list
      // ============================================================
      
      const NEARBY_THRESHOLD = 10; // miles
      const nearbyProviders = sortedProviders.filter(p => p.distance <= NEARBY_THRESHOLD);
      
      // Determine which providers to notify immediately
      let providersToNotify = [];
      
      if (nearbyProviders.length > 0) {
        // Case 1: There are nearby providers - notify them
        providersToNotify = nearbyProviders.slice(0, 10); // Notify top 10 nearby
        nearestProviders = providersToNotify;
        
        console.log(`📍 Found ${nearbyProviders.length} nearby providers, notifying top ${providersToNotify.length}`);
      } else {
        // Case 2: No nearby providers - notify all providers (with distance info)
        providersToNotify = sortedProviders.slice(0, 20); // Notify top 20 (furthest)
        nearestProviders = providersToNotify;
        
        console.log(`📍 No nearby providers found. Notifying ${providersToNotify.length} providers (furthest)`);
      }

      // Send notifications and store matched providers
      for (const provider of providersToNotify) {
        // Create notification
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

        // Emit socket event for real-time notification
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

        // Store matched providers on the errand (all matched providers)
        allProvidersNotified.push({
          providerId: provider._id,
          distance: provider.distance,
          distanceText: provider.distanceText,
          duration: provider.durationText,
          isNearby: provider.distance <= NEARBY_THRESHOLD,
        });
      }

      // Store all matched providers on the errand for reference
      errand.matchedProviders = allProvidersNotified;
      await errand.save();
    }

    // ============================================================
    // STEP 7: Response
    // ============================================================
    
    res.status(201).json({
      message: 'Errand created successfully. Waiting for offers.',
      errand,
      priceBreakdown: {
        baseFee: BASE_FEE,
        distance: {
          miles: Math.round(distanceInMiles * 100) / 100,
          text: distanceResult.distance.text,
          ratePerMile: ratePerMile,
        },
        distanceFee: errand.distanceFee,
        additionalCharges: {
          heavyItem: isHeavyItem ? 2.99 : null,
          waitTime: waitTimeMinutes > 5 ? (waitTimeMinutes - 5) * 0.30 : null,
          peakUrgent: isPeakUrgent ? 1.99 : null,
          extraStops: extraStopsCount > 0 ? extraStopsCount * 1.50 : null,
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
        nearbyCount: providersWithDistance.filter(p => p.distance <= NEARBY_THRESHOLD).length,
        totalNotified: providersToNotify.length,
        totalAvailable: allProviders.length,
        message: providersWithDistance.filter(p => p.distance <= NEARBY_THRESHOLD).length > 0
          ? `Notified ${providersToNotify.length} nearby providers`
          : 'No nearby providers found. Notified available providers further away.',
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

    await errand.save();
    
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