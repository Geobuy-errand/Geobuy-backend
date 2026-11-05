const Service = require('../models/Service.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const Quote = require('../models/Quote.model');
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const Notification = require('../models/Notification.model');
const ServiceCategoryModel = require('../models/ServiceCategory.model');
const Commission = require('../models/Commission.model');
const createNotification = require('../utils/create-notification');
const geoService = require('../services/geoService');
const pricingService = require('../services/pricingService');
const { countryOfUser, getCountry, normalizeCountry, unitToKm, formatDistance } = require('../config/countries');
const { formatMoney, round2 } = require('../utils/money');

const same = (a, b) => a && b && String(a?._id || a) === String(b?._id || b);
const SETTINGS_FALLBACK_COMMISSION_RATE = 10; // % — matches the existing commission default

// ============================================================
// SERVICE CRUD FUNCTIONS
// ============================================================

// Get all services
exports.getServices = async (req, res) => {
  try {
    // ?country=NG lists services offered in Nigeria (older services have no
    // `countries` field and are treated as available everywhere)
    const query = { isActive: true };
    if (req.query.country) {
      const c = String(req.query.country).toUpperCase();
      query.$or = [{ countries: c }, { countries: { $exists: false } }, { countries: { $size: 0 } }];
    }
    const services = await Service.find(query)
      .select('name category description basePrice pricePerKm pricesNG countries estimatedTime icon isPopular requiresDBS isActive minPrice maxPrice')
      .sort({ isPopular: -1, name: 1 });

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get service by ID
exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create service (admin only)
exports.createService = async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      basePrice,
      pricePerKm,
      minPrice,
      maxPrice,
      estimatedTime,
      icon,
      isActive,
      isPopular,
      requiresSpecialSkills,
      requiresDBS,
      serviceAreas,
      restrictions,
      countries,
      pricesNG,
    } = req.body;

    const service = new Service({
      countries: Array.isArray(countries) && countries.length ? countries : ['GB', 'NG'],
      pricesNG: pricesNG || undefined,
      name,
      category,
      description,
      basePrice,
      pricePerKm: pricePerKm || 0,
      minPrice,
      maxPrice,
      estimatedTime,
      icon,
      isActive: isActive !== undefined ? isActive : true,
      isPopular: isPopular || false,
      requiresSpecialSkills: requiresSpecialSkills || false,
      requiresDBS: requiresDBS || false,
      serviceAreas: serviceAreas || [],
      restrictions: restrictions || [],
    });

    await service.save();

    res.status(201).json({
      message: 'Service created successfully',
      service,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update service (admin only)
exports.updateService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    Object.assign(service, req.body);
    await service.save();

    res.json({
      message: 'Service updated successfully',
      service,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete service (admin only)
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    await service.deleteOne();
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get services by category
exports.getServicesByCategory = async (req, res) => {
  try {
    const services = await Service.find({
      category: req.params.category,
      isActive: true,
    });

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get popular services
exports.getPopularServices = async (req, res) => {
  try {
    const services = await Service.find({
      isActive: true,
      isPopular: true,
    }).limit(8);

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// ============================================================
// SERVICE REQUEST FUNCTIONS
// ============================================================

// Create service request with provider matching
exports.createServiceRequest = async (req, res) => {
  try {
    const {
      category,
      serviceType,
      description,
      location,
      preferredDate,
      preferredTime,
      budget,
      isUrgent,
      requiresDBS,
      requiresCertification,
      invitedProviders,
    } = req.body;

    const country = countryOfUser(req.user);
    const pricing = await pricingService.getPricing(country);
    const SERVICE_FEE = 0; // providers are paid directly; Geobuy invoices commission
    const PLATFORM_FEE_PERCENTAGE = pricing.platformFeePercentage;

    if (!category || !serviceType || !description) {
      return res.status(400).json({ message: 'Category, service type and description are required' });
    }

    // Make sure the job location has real coordinates inside the customer's country.
    let resolvedLocation = location || {};
    try {
      const point = await geoService.resolvePoint(location || req.user.address || {}, country);
      if (point) resolvedLocation = { ...resolvedLocation, coordinates: { lat: point.lat, lng: point.lng } };
    } catch (e) {
      console.warn('Service request geocoding failed:', e.message);
    }

    // Create service request
    const serviceRequest = new ServiceRequest({
      customerId: req.user._id,
      country,
      currency: getCountry(country).currency,
      category,
      serviceType,
      description,
      location: resolvedLocation,
      preferredDate,
      preferredTime,
      budget,
      isUrgent: isUrgent || false,
      requiresDBS: requiresDBS || false,
      requiresCertification: requiresCertification || false,
      serviceFee: SERVICE_FEE,
      platformFeePercentage: PLATFORM_FEE_PERCENTAGE,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isPublic: true,
    });

    await serviceRequest.save();

    // Invite selected providers
    let invitedCount = 0;
    if (invitedProviders && invitedProviders.length > 0) {
      for (const providerId of invitedProviders) {
        // Check if provider exists, is approved and works in the same country
        const provider = await User.findById(providerId);
        if (!provider || provider.role !== 'provider' || provider.verificationStatus !== 'approved') continue;
        if (countryOfUser(provider) !== country) continue;

        // Add to invited providers
        if (!serviceRequest.invitedProviders) {
          serviceRequest.invitedProviders = [];
        }
        
        serviceRequest.invitedProviders.push({
          providerId: providerId,
          status: 'invited',
          invitedAt: new Date(),
        });
        invitedCount++;

        // Send notification to provider using helper
        await createNotification(
          providerId,
          'new_service_request',
          '📋 New Service Request',
          `You've been invited to quote for a ${category} service by ${req.user.fullName}`,
          { 
            serviceRequestId: serviceRequest._id,
            customerId: req.user._id,
            customerName: req.user.fullName,
            category: category,
            serviceType: serviceType,
          }
        );

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
          io.to(`user_${providerId}`).emit('new-service-invite', {
            serviceRequestId: serviceRequest._id,
            category: category,
            serviceType: serviceType,
            customerName: req.user.fullName,
          });
        }
      }
      
      await serviceRequest.save();
    }

    // Send notification to customer using helper
    await createNotification(
      req.user._id,
      'service_request_created',
      '✅ Service Request Created',
      `Your service request for ${serviceType} has been created and sent to ${invitedCount} provider(s).`,
      { 
        serviceRequestId: serviceRequest._id,
        category: category,
        serviceType: serviceType,
        invitedCount: invitedCount,
        totalInvited: invitedProviders?.length || 0,
      }
    );

    res.status(201).json({
      message: 'Service request created successfully',
      serviceRequest,
      invitedCount,
      totalInvited: invitedProviders?.length || 0,
    });

  } catch (error) {
    console.error('❌ Create service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Invite providers to a service request
exports.inviteProviders = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { providerIds } = req.body;

    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check if customer owns this request
    if (serviceRequest.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (['completed', 'cancelled', 'expired'].includes(serviceRequest.status)) {
      return res.status(400).json({ message: 'This request is closed' });
    }

    // Add invited providers
    let invitedCount = 0;
    const requestCountry = normalizeCountry(serviceRequest.country);
    for (const providerId of providerIds || []) {
      const existing = serviceRequest.invitedProviders?.find(
        p => String(p.providerId) === String(providerId)
      );
      const provider = await User.findById(providerId).select('role verificationStatus country');
      if (!provider || provider.role !== 'provider' || provider.verificationStatus !== 'approved') continue;
      if (countryOfUser(provider) !== requestCountry) continue;

      if (!existing) {
        if (!serviceRequest.invitedProviders) {
          serviceRequest.invitedProviders = [];
        }
        
        serviceRequest.invitedProviders.push({
          providerId: providerId,
          status: 'invited',
          invitedAt: new Date(),
        });
        invitedCount++;

        // Notify provider
        await createNotification(
          providerId,
          'new_service_request',
          '📋 Service Request Invitation',
          `You've been invited to quote for a ${serviceRequest.category} service`,
          { serviceRequestId: serviceRequest._id }
        );

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
          io.to(`user_${providerId}`).emit('new-service-invite', {
            serviceRequestId: serviceRequest._id,
            category: serviceRequest.category,
            serviceType: serviceRequest.serviceType,
          });
        }
      }
    }

    await serviceRequest.save();

    res.json({
      message: 'Providers invited successfully',
      invitedCount,
      serviceRequest,
    });
  } catch (error) {
    console.error('Invite providers error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// QUOTE FUNCTIONS
// ============================================================

// Submit quote
exports.submitQuote = async (req, res) => {
  try {
    const {
      serviceRequestId,
      amount,
      message,
      estimatedDuration,
      availabilityStart,
      availabilityEnd,
    } = req.body;

    const quoteAmount = round2(parseFloat(amount));
    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      return res.status(400).json({ message: 'Please enter a valid quote amount' });
    }

    const serviceRequest = await ServiceRequest.findById(serviceRequestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (!['pending', 'quotes_received', 'negotiating'].includes(serviceRequest.status)) {
      return res.status(400).json({ message: 'This request is no longer accepting quotes' });
    }

    // Check if provider was invited
    const isInvited = serviceRequest.invitedProviders?.some(
      p => p.providerId.toString() === req.user._id.toString()
    );

    if (!isInvited && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not authorized to quote for this request' });
    }

    // Check if provider already submitted a quote
    const existingQuote = await Quote.findOne({
      serviceRequestId,
      providerId: req.user._id,
    });

    if (existingQuote) {
      return res.status(400).json({ message: 'You have already submitted a quote' });
    }

    const quote = new Quote({
      serviceRequestId,
      providerId: req.user._id,
      amount: quoteAmount,
      message,
      estimatedDuration,
      availability: {
        startDate: availabilityStart,
        endDate: availabilityEnd,
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
    });

    await quote.save();

    // Update invited provider status
    const inviteIndex = serviceRequest.invitedProviders?.findIndex(
      p => p.providerId.toString() === req.user._id.toString()
    );
    if (inviteIndex !== -1 && inviteIndex !== undefined) {
      serviceRequest.invitedProviders[inviteIndex].quote = {
        amount: quoteAmount,
        message: message,
        estimatedDuration: estimatedDuration,
        submittedAt: new Date(),
      };
      serviceRequest.invitedProviders[inviteIndex].status = 'quoted';
    }
    await serviceRequest.save();

    // Notify customer using helper
    await createNotification(
      serviceRequest.customerId,
      'quote_received',
      '💰 New Quote Received',
      `${req.user.fullName} has submitted a quote of ${formatMoney(quoteAmount, serviceRequest.currency)} for your service request`,
      { 
        serviceRequestId: serviceRequest._id, 
        quoteId: quote._id,
        providerId: req.user._id,
        providerName: req.user.fullName,
        amount: amount,
      }
    );

    // Update request status if first quote
    if (serviceRequest.status === 'pending' || serviceRequest.status === 'open') {
      serviceRequest.status = 'quotes_received';
      await serviceRequest.save();
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${serviceRequest.customerId}`).emit('new-quote', {
        serviceRequestId: serviceRequest._id,
        providerId: req.user._id,
        amount: amount,
      });
    }

    res.status(201).json({
      message: 'Quote submitted successfully',
      quote,
    });
  } catch (error) {
    console.error('❌ Submit quote error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get quotes for service request
exports.getQuotesForRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      // Check if user is an invited provider
      const isInvited = serviceRequest.invitedProviders?.some(
        p => p.providerId.toString() === req.user._id.toString()
      );
      if (!isInvited) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const quotes = await Quote.find({ serviceRequestId: requestId })
      .populate('providerId', 'fullName email phoneNumber averageRating totalReviews verificationBadges')
      .sort({ amount: 1 });

    res.json(quotes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// NEGOTIATION FUNCTIONS
// ============================================================

// Negotiate quote (counter-offer)
exports.negotiateQuote = async (req, res) => {
  try {
    const { quoteId, counterAmount, message } = req.body;
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    const serviceRequest = await ServiceRequest.findById(quote.serviceRequestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    const isCustomer = serviceRequest.customerId.toString() === req.user._id.toString();
    const isProvider = quote.providerId.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Determine who is sending the counter-offer
    const from = isCustomer ? 'customer' : 'provider';

    const offer = round2(parseFloat(counterAmount));
    if (!Number.isFinite(offer) || offer <= 0) {
      return res.status(400).json({ message: 'Please enter a valid amount' });
    }
    if (!['pending', 'quotes_received', 'negotiating'].includes(serviceRequest.status) || quote.status !== 'pending') {
      return res.status(400).json({ message: 'This quote can no longer be negotiated' });
    }
    const currency = serviceRequest.currency || 'GBP';

    // Update quote
    quote.amount = offer;
    quote.status = 'pending';
    quote.message = message || quote.message;
    await quote.save();

    // Add to negotiation history
    if (!serviceRequest.negotiationHistory) {
      serviceRequest.negotiationHistory = [];
    }
    serviceRequest.negotiationHistory.push({
      from,
      userId: req.user._id,
      message: message || `${from} offered ${formatMoney(offer, currency)}`,
      offerAmount: offer,
      quoteId: quote._id,
      status: 'countered',
    });
    serviceRequest.status = 'negotiating';
    await serviceRequest.save();

    // Notify the other party using helper
    const recipientId = isCustomer ? quote.providerId : serviceRequest.customerId;
    const senderName = isCustomer ? req.user.fullName : 'Provider';
    
    await createNotification(
      recipientId,
      'quote_countered',
      '🔄 Counter-Offer Received',
      `${senderName} has made a counter-offer of ${formatMoney(offer, currency)}`,
      { 
        serviceRequestId: serviceRequest._id, 
        quoteId: quote._id,
        amount: counterAmount,
        from: from,
        message: message || '',
      }
    );

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`booking_${serviceRequest._id}`).emit('negotiation-update', {
        serviceRequestId: serviceRequest._id,
        quoteId: quote._id,
        amount: counterAmount,
        from,
        message,
      });
    }

    res.json({
      message: 'Counter-offer sent',
      quote,
      negotiationHistory: serviceRequest.negotiationHistory,
    });
  } catch (error) {
    console.error('❌ Negotiate quote error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Accept quote
exports.acceptQuote = async (req, res) => {
  try {
    const { quoteId } = req.body;
    const quote = await Quote.findById(quoteId).populate('providerId', 'fullName email');
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    const serviceRequest = await ServiceRequest.findById(quote.serviceRequestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (!same(serviceRequest.customerId, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!['pending', 'quotes_received', 'negotiating'].includes(serviceRequest.status)) {
      return res.status(400).json({ message: 'A provider has already been selected or this request is closed' });
    }
    if (quote.status !== 'pending') {
      return res.status(400).json({ message: 'This quote is no longer available' });
    }

    // The customer can't accept their own counter-offer — the provider must respond first.
    const lastForQuote = [...(serviceRequest.negotiationHistory || [])]
      .reverse()
      .find((h) => h.quoteId && same(h.quoteId, quote._id));
    if (lastForQuote?.from === 'customer') {
      return res.status(400).json({ message: 'Waiting for the provider to respond to your counter-offer' });
    }

    // The agreed price is the quote's current amount. A client-sent
    // `finalPrice` is ignored (it used to let the customer set any price).
    const finalPrice = quote.amount;
    const providerId = quote.providerId._id;

    // Atomically claim the request so two quotes can't both be accepted.
    const claimed = await ServiceRequest.findOneAndUpdate(
      { _id: serviceRequest._id, status: { $in: ['pending', 'quotes_received', 'negotiating'] } },
      {
        $set: {
          selectedProviderId: providerId,
          selectedQuoteId: quote._id,
          finalPrice,
          status: 'provider_selected',
        },
      },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: 'This request was updated. Please refresh.' });

    quote.status = 'accepted';
    quote.isSelected = true;
    quote.selectedAt = new Date();
    await quote.save();

    // Close the other quotes
    await Quote.updateMany(
      { serviceRequestId: serviceRequest._id, _id: { $ne: quote._id }, status: 'pending' },
      { $set: { status: 'rejected' } }
    );

    const price = formatMoney(finalPrice, claimed.currency);
    await createNotification(
      providerId,
      'quote_accepted',
      '🎉 Quote Accepted!',
      `Your quote of ${price} has been accepted for ${claimed.serviceType}`,
      { serviceRequestId: claimed._id, customerId: req.user._id, customerName: req.user.fullName, finalPrice }
    );

    await createNotification(
      req.user._id,
      'service_request_accepted',
      '✅ Provider booked',
      `You booked ${quote.providerId.fullName || 'the provider'} for ${price}`,
      { serviceRequestId: claimed._id, providerId, finalPrice }
    );

    const io = req.app.get('io');
    if (io) {
      const payload = { serviceRequestId: claimed._id, providerId, amount: finalPrice, currency: claimed.currency };
      io.to(`booking_${claimed._id}`).emit('quote-accepted', payload);
      io.to(`user_${providerId}`).emit('quote-accepted', payload);
    }

    res.json({
      message: 'Quote accepted successfully',
      serviceRequest: claimed,
    });
  } catch (error) {
    console.error('❌ Accept quote error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Reject quote
exports.rejectQuote = async (req, res) => {
  try {
    const { quoteId, reason } = req.body;
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    const serviceRequest = await ServiceRequest.findById(quote.serviceRequestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization (customer or provider can reject)
    const isCustomer = serviceRequest.customerId.toString() === req.user._id.toString();
    const isProvider = quote.providerId.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider) {
      return res.status(403).json({ message: 'Access denied' });
    }

    quote.status = 'rejected';
    await quote.save();

    // Add to negotiation history
    if (!serviceRequest.negotiationHistory) {
      serviceRequest.negotiationHistory = [];
    }
    serviceRequest.negotiationHistory.push({
      from: isCustomer ? 'customer' : 'provider',
      userId: req.user._id,
      message: reason || 'Quote rejected',
      status: 'rejected',
    });
    await serviceRequest.save();

    // Notify the other party using helper
    const recipientId = isCustomer ? quote.providerId : serviceRequest.customerId;
    const senderName = isCustomer ? 'Customer' : 'Provider';
    
    await createNotification(
      recipientId,
      'quote_rejected',
      '❌ Quote Rejected',
      `Your quote has been rejected${reason ? `: ${reason}` : ''}`,
      { 
        serviceRequestId: serviceRequest._id,
        quoteId: quote._id,
        reason: reason || 'No reason provided',
        rejectedBy: senderName,
      }
    );

    res.json({
      message: 'Quote rejected',
      quote,
    });
  } catch (error) {
    console.error('❌ Reject quote error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// SERVICE REQUEST RETRIEVAL FUNCTIONS
// ============================================================

// Get service request by ID
exports.getServiceRequestById = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('selectedProviderId', 'fullName email phoneNumber address averageRating totalReviews verificationBadges')
      .populate('invitedProviders.providerId', 'fullName email phoneNumber address averageRating totalReviews verificationBadges')
      .populate({
        path: 'negotiationHistory.userId',
        select: 'fullName email',
      });

    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId._id.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      // Check if user is an invited provider
      const isInvited = serviceRequest.invitedProviders?.some((p) => same(p.providerId, req.user._id));
      if (!isInvited) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(serviceRequest);
  } catch (error) {
    console.error('Get service request by ID error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all service requests for a customer
exports.getMyServiceRequests = async (req, res) => {
  try {
    const query = { customerId: req.user._id };
    const serviceRequests = await ServiceRequest.find(query)
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .populate('invitedProviders.providerId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(serviceRequests);
  } catch (error) {
    console.error('Get my service requests error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get service requests for a provider (matched or invited)
exports.getProviderServiceRequests = async (req, res) => {
  try {
    // Find requests where provider is invited or matched
    const serviceRequests = await ServiceRequest.find({
      $or: [
        { 'matchedProviders.providerId': req.user._id },
        { 'invitedProviders.providerId': req.user._id },
      ],
      status: { 
        $in: ['pending', 'quotes_received', 'negotiating', 'provider_selected', 'in_progress'] 
      },
    })
      .populate('customerId', 'fullName email phoneNumber')
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });

    res.json(serviceRequests);
  } catch (error) {
    console.error('Get provider service requests error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// SERVICE REQUEST ACTION FUNCTIONS
// ============================================================

// Cancel service request
exports.cancelServiceRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    const serviceRequest = await ServiceRequest.findById(req.params.id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (['completed', 'cancelled'].includes(serviceRequest.status)) {
      return res.status(400).json({ message: `Request is already ${serviceRequest.status}` });
    }

    serviceRequest.status = 'cancelled';
    serviceRequest.cancelledAt = new Date();
    serviceRequest.cancellationReason = reason || 'Cancelled by user';
    await serviceRequest.save();

    // Notify selected provider if any
    if (serviceRequest.selectedProviderId) {
      await createNotification(
        serviceRequest.selectedProviderId,
        'request_cancelled',
        'Service Request Cancelled',
        `Service request #${serviceRequest.requestId} has been cancelled`,
        { serviceRequestId: serviceRequest._id }
      );
    }

    res.json({
      message: 'Service request cancelled',
      serviceRequest,
    });
  } catch (error) {
    console.error('Cancel service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Complete service request
exports.completeServiceRequest = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (serviceRequest.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (serviceRequest.status !== 'provider_selected' && serviceRequest.status !== 'in_progress') {
      return res.status(400).json({ message: 'Request is not in a completable state' });
    }

    serviceRequest.status = 'completed';
    serviceRequest.completedAt = new Date();
    await serviceRequest.save();

    // Providers are paid directly by the customer, so Geobuy invoices its
    // commission automatically when the job is completed.
    if (serviceRequest.selectedProviderId && serviceRequest.finalPrice > 0) {
      try {
        const exists = await Commission.findOne({ serviceRequestId: serviceRequest._id });
        if (!exists) {
          const rate = SETTINGS_FALLBACK_COMMISSION_RATE;
          await Commission.create({
            providerId: serviceRequest.selectedProviderId,
            serviceRequestId: serviceRequest._id,
            amount: serviceRequest.finalPrice,
            currency: serviceRequest.currency || 'GBP',
            commissionRate: rate,
            commissionAmount: round2((serviceRequest.finalPrice * rate) / 100),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'pending',
            notes: 'Auto-generated on completion',
          });
        }
      } catch (e) {
        console.warn('Commission auto-generation failed:', e.message);
      }
    }

    // Notify provider
    if (serviceRequest.selectedProviderId) {
      await createNotification(
        serviceRequest.selectedProviderId,
        'request_completed',
        'Service Request Completed',
        `Service request #${serviceRequest.requestId} has been marked as completed`,
        { serviceRequestId: serviceRequest._id }
      );
    }

    res.json({
      message: 'Service request completed',
      serviceRequest,
    });
  } catch (error) {
    console.error('Complete service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Start service request (provider)
exports.startServiceRequest = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check if user is the selected provider
    if (!same(serviceRequest.selectedProviderId, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (serviceRequest.status !== 'provider_selected') {
      return res.status(400).json({ message: 'Request is not ready to start' });
    }

    serviceRequest.status = 'in_progress';
    await serviceRequest.save();

    // Notify customer ('request_started' was missing from the enum, which
    // made this endpoint fail after the status was already saved)
    await createNotification(
      serviceRequest.customerId,
      'request_started',
      'Service Started',
      `${req.user.fullName} has started working on your service request`,
      { serviceRequestId: serviceRequest._id }
    );

    res.json({
      message: 'Service started',
      serviceRequest,
    });
  } catch (error) {
    console.error('Start service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getServiceCategories = async (req, res) => {
  try {
    const { type } = req.query; // Optional filter by type
    
    let query = { isActive: true };
    if (type) {
      query.type = type;
    }
    
    const categories = await ServiceCategoryModel.find(query)
      .sort({ displayOrder: 1, name: 1 });
    
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Create a new category (admin only)
exports.createServiceCategory = async (req, res) => {
  try {
    const { name, label, icon, description, subCategories, displayOrder } = req.body;
    
    const existingCategory = await ServiceCategoryModel.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }
    
    const category = new ServiceCategoryModel({
      name,
      label,
      icon,
      description,
      subCategories: subCategories || [],
      displayOrder: displayOrder || 0,
    });
    
    await category.save();
    
    res.status(201).json({
      message: 'Category created successfully',
      category,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a category (admin only)
exports.updateServiceCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, label, icon, description, subCategories, isActive, displayOrder } = req.body;
    
    const category = await ServiceCategoryModel.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Check if name conflicts with another category
    if (name && name !== category.name) {
      const existing = await ServiceCategoryModel.findOne({ name });
      if (existing) {
        return res.status(400).json({ message: 'Category with this name already exists' });
      }
    }
    
    if (name) category.name = name;
    if (label) category.label = label;
    if (icon) category.icon = icon;
    if (description !== undefined) category.description = description;
    if (subCategories) category.subCategories = subCategories;
    if (isActive !== undefined) category.isActive = isActive;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    
    await category.save();
    
    res.json({
      message: 'Category updated successfully',
      category,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a category (admin only)
exports.deleteServiceCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await ServiceCategoryModel.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    await category.deleteOne();
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// SERVICE PROVIDERS (UPDATED TO USE DYNAMIC CATEGORIES)
// ============================================================

// Get service providers with filters
// ============================================================
// PROVIDER SEARCH & MATCHING (UK + Nigeria)
// Distances: computed in km, returned in the country's unit
// (miles for the UK, km for Nigeria) with a ready-made `distanceText`.
// ============================================================

/** Build the Mongo filter for a category (uses admin-managed subcategories). */
async function categoryFilter(category) {
  if (!category) return null;
  const categoryDoc = await ServiceCategoryModel.findOne({ name: String(category).toLowerCase(), isActive: true });
  if (categoryDoc?.subCategories?.length) {
    return { $in: [...categoryDoc.subCategories, categoryDoc.name] };
  }
  return category;
}

/** Score 0–100: closer, better rated and better verified providers rank higher. */
function calculateMatchScore(provider, distanceKm, { requiresDBS, requiresCertification, isUrgent } = {}) {
  let score = 60;
  if (distanceKm !== null && distanceKm !== undefined) {
    // Lose up to 35 points over the first 25 km
    score -= Math.min(35, (distanceKm / 25) * 35);
  }
  if (provider.averageRating) score += provider.averageRating * 4;
  const badges = provider.verificationBadges || [];
  if (badges.includes('id_checked')) score += 5;
  if (badges.includes('insured')) score += 5;
  if (badges.includes('certified')) score += requiresCertification ? 10 : 5;
  if (badges.includes('dbs_checked')) score += requiresDBS ? 10 : 5;
  if (isUrgent && provider.isAvailable) score += 5;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Rank providers by road distance from a point and attach distance fields. */
async function rankProviders(providers, origin, country, extra = {}) {
  const origins = providers.map((p) => geoService.pointFromGeoJSON(p.location));
  const routes = origin ? await geoService.getDistancesFrom(origin, origins, { country }) : providers.map(() => null);
  return providers
    .map((p, i) => {
      const obj = p.toObject ? p.toObject() : p;
      const r = routes[i];
      return {
        ...obj,
        distance: r ? round2(r.distanceKm / (getCountry(country).distanceUnit === 'mi' ? 1.609344 : 1)) : null,
        distanceKm: r ? r.distanceKm : null,
        distanceUnit: getCountry(country).distanceUnit,
        distanceText: r ? r.distanceText : null,
        travelTime: r ? r.durationText : null,
        matchScore: calculateMatchScore(obj, r ? r.distanceKm : null, extra),
      };
    })
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
}

// GET /services/providers?category=&lat=&lng=&radius=&country=
// `radius` is in the country's unit (miles for UK, km for Nigeria).
exports.getServiceProviders = async (req, res) => {
  try {
    const { category, dbsChecked, insured, lat, lng, radius, limit = 20 } = req.query;

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const hasPoint = Number.isFinite(latNum) && Number.isFinite(lngNum) && !(latNum === 0 && lngNum === 0);
    const { countryFromCoordinates } = require('../config/countries');
    const country = normalizeCountry(
      req.query.country || req.user?.country || (hasPoint ? countryFromCoordinates(latNum, lngNum) : null)
    );

    const query = {
      role: 'provider',
      isActive: true,
      verificationStatus: 'approved',
    };
    // Accounts created before Nigeria support have no country (treated as UK)
    if (country === 'GB') query.$or = [{ country: 'GB' }, { country: { $exists: false } }];
    else query.country = country;

    const cat = await categoryFilter(category);
    if (cat) query.serviceCategories = cat;

    const badges = [];
    if (dbsChecked === 'true') badges.push('dbs_checked');
    if (insured === 'true') badges.push('insured');
    if (badges.length) query.verificationBadges = { $all: badges };

    const cap = Math.min(parseInt(limit, 10) || 20, 50);
    let providers;

    if (hasPoint) {
      const radiusKm = unitToKm(parseFloat(radius) || (country === 'NG' ? 15 : 10), country);
      // $near can't be combined with $or, so filter country after the geo query.
      const geoQuery = { ...query };
      delete geoQuery.$or;
      if (country === 'GB') geoQuery.country = { $in: ['GB', null] };
      geoQuery.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lngNum, latNum] },
          $maxDistance: radiusKm * 1000,
        },
      };
      providers = await User.find(geoQuery)
        .select('fullName address.town address.state averageRating totalReviews verificationBadges serviceCategories serviceRates about location country isAvailable')
        .limit(cap);
      providers = await rankProviders(providers, { lat: latNum, lng: lngNum }, country);
    } else {
      providers = await User.find(query)
        .select('fullName address.town address.state averageRating totalReviews verificationBadges serviceCategories serviceRates about location country isAvailable')
        .sort({ averageRating: -1 })
        .limit(cap);
      providers = providers.map((p) => ({ ...p.toObject(), distance: null, distanceText: null, matchScore: calculateMatchScore(p, null) }));
    }

    res.json(providers);
  } catch (error) {
    console.error('❌ getServiceProviders error:', error);
    res.status(500).json({ message: error.message });
  }
};

// GET /services/request/:requestId/matches
exports.getMatchedProviders = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.requestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (!same(serviceRequest.customerId, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const country = normalizeCountry(serviceRequest.country);
    const cat = await categoryFilter(serviceRequest.category);

    // Providers whose profile OR account lists a matching category
    const profileFilter = { isVerified: true };
    if (cat) profileFilter.serviceCategories = cat;
    const profiles = await ProviderProfile.find(profileFilter);
    const profileIds = profiles.map((p) => p.userId);

    const userQuery = {
      role: 'provider',
      isActive: true,
      isAvailable: { $ne: false },
      verificationStatus: 'approved',
      $and: [
        country === 'GB' ? { $or: [{ country: 'GB' }, { country: { $exists: false } }] } : { country },
        cat ? { $or: [{ _id: { $in: profileIds } }, { serviceCategories: cat }] } : {},
      ],
    };

    const users = await User.find(userQuery)
      .select('fullName email phoneNumber averageRating totalReviews verificationBadges location isAvailable')
      .limit(50);

    const origin = geoService.toPoint(serviceRequest.location?.coordinates);
    const ranked = await rankProviders(users, origin, country, {
      requiresDBS: serviceRequest.requiresDBS,
      requiresCertification: serviceRequest.requiresCertification,
      isUrgent: serviceRequest.isUrgent,
    });

    const matchedProviders = ranked.map((u) => {
      const profile = profiles.find((p) => same(p.userId, u._id));
      return {
        providerId: u._id,
        fullName: u.fullName,
        averageRating: u.averageRating,
        totalReviews: u.totalReviews,
        matchScore: u.matchScore,
        distance: u.distance,
        distanceText: u.distanceText,
        distanceUnit: u.distanceUnit,
        travelTime: u.travelTime,
        profile,
        about: profile?.about || '',
        verificationBadges: u.verificationBadges || [],
      };
    });

    res.json({ matchedProviders, total: matchedProviders.length });
  } catch (error) {
    console.error('Get matched providers error:', error);
    res.status(500).json({ message: error.message });
  }
};
