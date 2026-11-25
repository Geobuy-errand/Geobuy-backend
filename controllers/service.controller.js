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
const settingsService = require('../services/settingsService');
const { releaseServiceFunds, refundServicePayment } = require('../services/escrowService');
const { verificationGate } = require('../services/verificationService');

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
    const ops = await settingsService.getOperations();
    // No booking fee for customers; Geobuy earns the provider commission (admin setting).
    const SERVICE_FEE = 0;
    const PLATFORM_FEE_PERCENTAGE = pricing.providerCommissionPercentage;

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
      expiresAt: settingsService.daysFromNow(ops.serviceRequestExpiryDays),
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

    // Invited providers, and providers the system matched to the request, can quote
    const isInvited = serviceRequest.invitedProviders?.some((p) => same(p.providerId, req.user._id));
    const isMatched = serviceRequest.matchedProviders?.some((p) => same(p.providerId, req.user._id));

    if (!isInvited && !isMatched && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not authorized to quote for this request' });
    }
    if (isMatched && !isInvited) {
      serviceRequest.invitedProviders = serviceRequest.invitedProviders || [];
      serviceRequest.invitedProviders.push({ providerId: req.user._id, status: 'invited', invitedAt: new Date() });
    }

    // Identity check (Admin → Settings → Verification)
    const gate = await verificationGate(req.user, 'provider');
    if (gate) return res.status(403).json(gate);

    // Check if provider already submitted a quote
    const existingQuote = await Quote.findOne({
      serviceRequestId,
      providerId: req.user._id,
    });

    if (existingQuote) {
      return res.status(400).json({ message: 'You have already submitted a quote' });
    }

    const { quoteExpiryDays } = await settingsService.getOperations();
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
      expiresAt: settingsService.daysFromNow(quoteExpiryDays),
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
      .populate('providerId', 'fullName email phoneNumber averageRating totalReviews verificationBadges verificationStatus')
      .sort({ amount: 1 });

    const isProviderViewer = req.user.role === 'provider';
    const out = quotes
      .filter((q) => !isProviderViewer || same(q.providerId, req.user._id))
      .map((q) => {
        const o = q.toObject();
        o.lastOfferBy = lastOfferByFor(serviceRequest, q);
        o.originalAmount = o.originalAmount ?? o.amount;
        o.history = (serviceRequest.negotiationHistory || [])
          .filter((h) => h.quoteId && same(h.quoteId, q._id))
          .map((h) => ({ from: h.from, amount: h.offerAmount, message: h.message, status: h.status, at: h.timestamp }));
        return o;
      });
    res.json(out);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// NEGOTIATION FUNCTIONS
// ============================================================

// Negotiation rules (customer ↔ provider, on one quote):
//  - The provider's quote is the opening offer (lastOfferBy = 'provider').
//  - Whoever did NOT make the latest offer can accept it, counter it or decline.
//  - Customer accepts the provider's offer  -> booked at that price, customer pays.
//  - Provider accepts the customer's counter -> booked at that price, customer pays.
//  - The number of counter-offers is capped by settings (maxCounterOffers).

const notifyBoth = (req, serviceRequest, quote, event, payload) => {
  const io = req.app.get('io');
  if (!io) return;
  const data = { serviceRequestId: serviceRequest._id, quoteId: quote._id, ...payload };
  io.to(`booking_${serviceRequest._id}`).emit(event, data);
  io.to(`user_${serviceRequest.customerId?._id || serviceRequest.customerId}`).emit(event, data);
  io.to(`user_${quote.providerId?._id || quote.providerId}`).emit(event, data);
};

// Who made the latest offer on a quote. Older quotes have no lastOfferBy,
// so fall back to the negotiation history.
const lastOfferByFor = (serviceRequest, quote) => {
  const last = [...(serviceRequest.negotiationHistory || [])]
    .reverse()
    .find((h) => h.quoteId && same(h.quoteId, quote._id) && h.status === 'countered');
  return last?.from || quote.lastOfferBy || 'provider';
};

// Book the provider at the quote's current amount. Used when the customer
// accepts the provider's offer and when the provider accepts the customer's
// counter-offer. Returns the claimed request, or null if someone else got there first.
async function bookQuote(req, quote, serviceRequest, acceptedBy) {
  const finalPrice = quote.amount;
  const providerId = quote.providerId?._id || quote.providerId;
  const split = await pricingService.splitServiceAmount(finalPrice, serviceRequest.country || 'GB');

  const claimed = await ServiceRequest.findOneAndUpdate(
    { _id: serviceRequest._id, status: { $in: ['pending', 'quotes_received', 'negotiating'] } },
    {
      $set: {
        selectedProviderId: providerId,
        selectedQuoteId: quote._id,
        finalPrice,
        status: 'provider_selected',
        paymentStatus: 'pending',
        platformFee: split.platformFee,
        providerAmount: split.providerAmount,
        platformFeePercentage: split.platformFeePercentage,
      },
      $push: {
        negotiationHistory: {
          from: acceptedBy,
          userId: req.user._id,
          message: `${acceptedBy === 'customer' ? 'Customer' : 'Provider'} accepted ${formatMoney(finalPrice, serviceRequest.currency)}`,
          offerAmount: finalPrice,
          quoteId: quote._id,
          status: 'accepted',
          timestamp: new Date(),
        },
      },
    },
    { new: true }
  );
  if (!claimed) return null;

  quote.status = 'accepted';
  quote.isSelected = true;
  quote.selectedAt = new Date();
  await quote.save();

  await Quote.updateMany(
    { serviceRequestId: serviceRequest._id, _id: { $ne: quote._id }, status: 'pending' },
    { $set: { status: 'rejected' } }
  );

  const price = formatMoney(finalPrice, claimed.currency);
  const provider = quote.providerId?.fullName ? quote.providerId : await User.findById(providerId).select('fullName');
  await createNotification(
    providerId,
    'quote_accepted',
    acceptedBy === 'customer' ? '🎉 Quote Accepted!' : '🤝 Deal agreed',
    acceptedBy === 'customer'
      ? `Your quote of ${price} has been accepted for ${claimed.serviceType}. We'll tell you as soon as the customer has paid — please don't start before then.`
      : `You accepted ${price} for ${claimed.serviceType}. We'll tell you as soon as the customer has paid — please don't start before then.`,
    { serviceRequestId: claimed._id, customerId: claimed.customerId, finalPrice }
  );
  await createNotification(
    claimed.customerId,
    'service_payment_required',
    acceptedBy === 'customer' ? '✅ Provider booked — payment needed' : '🤝 Provider accepted your offer — payment needed',
    `${acceptedBy === 'customer' ? 'You booked' : 'Booked:'} ${provider?.fullName || 'the provider'} for ${price}. Pay now to confirm the booking — your money is held securely until you confirm the job is done.`,
    { serviceRequestId: claimed._id, providerId, finalPrice }
  );

  notifyBoth(req, claimed, quote, 'quote-accepted', { providerId, amount: finalPrice, currency: claimed.currency, acceptedBy });
  return claimed;
}

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

    const isCustomer = same(serviceRequest.customerId, req.user._id);
    const isProvider = same(quote.providerId, req.user._id);
    if (!isCustomer && !isProvider) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const from = isCustomer ? 'customer' : 'provider';

    const features = await settingsService.getFeatures();
    if (features.negotiationEnabled === false) {
      return res.status(400).json({ message: 'Price negotiation is turned off. Accept or decline the quote.' });
    }

    const offer = round2(parseFloat(counterAmount));
    if (!Number.isFinite(offer) || offer <= 0) {
      return res.status(400).json({ message: 'Please enter a valid amount' });
    }
    if (!['pending', 'quotes_received', 'negotiating'].includes(serviceRequest.status) || quote.status !== 'pending') {
      return res.status(400).json({ message: 'This quote can no longer be negotiated' });
    }

    // Take turns: you can't counter your own latest offer.
    const lastBy = lastOfferByFor(serviceRequest, quote);
    if (lastBy === from) {
      return res.status(400).json({
        message: from === 'customer'
          ? 'Waiting for the provider to respond to your offer'
          : 'Waiting for the customer to respond to your offer',
      });
    }
    if (offer === round2(quote.amount)) {
      return res.status(400).json({ message: 'That is the current price — accept it instead of countering' });
    }

    const { maxCounterOffers } = await settingsService.getOperations();
    if (maxCounterOffers && (quote.counterCount || 0) >= maxCounterOffers) {
      return res.status(400).json({ message: `The limit of ${maxCounterOffers} counter-offers has been reached. Accept or decline the current price.` });
    }

    const currency = serviceRequest.currency || 'GBP';
    if (quote.originalAmount == null) quote.originalAmount = quote.amount;
    quote.amount = offer;
    quote.lastOfferBy = from;
    quote.counterCount = (quote.counterCount || 0) + 1;
    await quote.save();

    serviceRequest.negotiationHistory = serviceRequest.negotiationHistory || [];
    serviceRequest.negotiationHistory.push({
      from,
      userId: req.user._id,
      message: message || `${from === 'customer' ? 'Customer' : 'Provider'} offered ${formatMoney(offer, currency)}`,
      offerAmount: offer,
      quoteId: quote._id,
      status: 'countered',
      timestamp: new Date(),
    });
    serviceRequest.status = 'negotiating';
    await serviceRequest.save();

    const recipientId = isCustomer ? quote.providerId : serviceRequest.customerId;
    await createNotification(
      recipientId,
      'quote_countered',
      '🔄 Counter-Offer Received',
      `${req.user.fullName || (isCustomer ? 'The customer' : 'The provider')} offered ${formatMoney(offer, currency)} for ${serviceRequest.serviceType}. Accept it, counter or decline.`,
      { serviceRequestId: serviceRequest._id, quoteId: quote._id, amount: offer, from, message: message || '' }
    );

    notifyBoth(req, serviceRequest, quote, 'negotiation-update', { amount: offer, from, message });

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

// Accept quote (customer accepts the provider's current offer)
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
    if (lastOfferByFor(serviceRequest, quote) === 'customer') {
      return res.status(400).json({ message: 'Waiting for the provider to respond to your counter-offer' });
    }

    // The agreed price is the quote's current amount; a client-sent price is ignored.
    const claimed = await bookQuote(req, quote, serviceRequest, 'customer');
    if (!claimed) return res.status(409).json({ message: 'This request was updated. Please refresh.' });

    res.json({
      message: 'Quote accepted successfully',
      serviceRequest: claimed,
    });
  } catch (error) {
    console.error('❌ Accept quote error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Provider accepts the customer's counter-offer. The job is booked at that
// price and the customer is asked to pay.
exports.acceptCounterOffer = async (req, res) => {
  try {
    const { quoteId } = req.body;
    const quote = await Quote.findById(quoteId).populate('providerId', 'fullName email');
    if (!quote) return res.status(404).json({ message: 'Quote not found' });
    if (!same(quote.providerId, req.user._id)) return res.status(403).json({ message: 'Access denied' });

    const serviceRequest = await ServiceRequest.findById(quote.serviceRequestId);
    if (!serviceRequest) return res.status(404).json({ message: 'Service request not found' });

    if (!['pending', 'quotes_received', 'negotiating'].includes(serviceRequest.status) || quote.status !== 'pending') {
      return res.status(400).json({ message: 'This offer is no longer open' });
    }
    if (lastOfferByFor(serviceRequest, quote) !== 'customer') {
      return res.status(400).json({ message: 'There is no counter-offer from the customer to accept' });
    }
    const gate = await verificationGate(req.user, 'provider');
    if (gate) return res.status(403).json(gate);

    const claimed = await bookQuote(req, quote, serviceRequest, 'provider');
    if (!claimed) return res.status(409).json({ message: 'The customer has booked someone else or closed this request.' });

    res.json({ message: 'Offer accepted — the customer has been asked to pay', serviceRequest: claimed });
  } catch (error) {
    console.error('❌ Accept counter-offer error:', error);
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

    if (quote.status !== 'pending' || !['pending', 'quotes_received', 'negotiating'].includes(serviceRequest.status)) {
      return res.status(400).json({ message: 'This quote can no longer be declined' });
    }

    quote.status = 'rejected';
    await quote.save();

    serviceRequest.negotiationHistory = serviceRequest.negotiationHistory || [];
    serviceRequest.negotiationHistory.push({
      from: isCustomer ? 'customer' : 'provider',
      userId: req.user._id,
      message: reason || (isCustomer ? 'Customer declined the quote' : 'Provider withdrew the quote'),
      quoteId: quote._id,
      status: 'rejected',
      timestamp: new Date(),
    });
    // Nothing left to negotiate? Go back to waiting for quotes.
    const stillOpen = await Quote.countDocuments({ serviceRequestId: serviceRequest._id, status: 'pending' });
    if (serviceRequest.status === 'negotiating' || stillOpen === 0) {
      serviceRequest.status = stillOpen > 0 ? 'quotes_received' : 'pending';
    }
    await serviceRequest.save();

    const recipientId = isCustomer ? quote.providerId : serviceRequest.customerId;
    await createNotification(
      recipientId,
      'quote_rejected',
      isCustomer ? '❌ Quote declined' : '❌ Provider withdrew their quote',
      isCustomer
        ? `The customer declined your quote for ${serviceRequest.serviceType}${reason ? `: ${reason}` : ''}`
        : `${req.user.fullName || 'A provider'} withdrew their quote for ${serviceRequest.serviceType}${reason ? `: ${reason}` : ''}`,
      { serviceRequestId: serviceRequest._id, quoteId: quote._id, reason: reason || '' }
    );
    notifyBoth(req, serviceRequest, quote, 'negotiation-update', { from: isCustomer ? 'customer' : 'provider', declined: true });

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
      // Invited, matched or booked providers can see it
      const isInvited = serviceRequest.invitedProviders?.some((p) => same(p.providerId, req.user._id))
        || serviceRequest.matchedProviders?.some((p) => same(p.providerId, req.user._id))
        || same(serviceRequest.selectedProviderId, req.user._id);
      if (!isInvited) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const out = serviceRequest.toObject();
    // Providers only see their own quote and negotiation
    if (req.user.role === 'provider') {
      const q = await Quote.findOne({ serviceRequestId: serviceRequest._id, providerId: req.user._id }).lean();
      out.negotiationHistory = (out.negotiationHistory || []).filter((h) => q && h.quoteId && same(h.quoteId, q._id));
      out.invitedProviders = (out.invitedProviders || []).filter((p) => same(p.providerId, req.user._id));
      out.matchedProviders = undefined;
      out.myQuote = q
        ? { _id: q._id, amount: q.amount, originalAmount: q.originalAmount ?? q.amount, status: q.status, lastOfferBy: lastOfferByFor(serviceRequest, q), counterCount: q.counterCount || 0, message: q.message, estimatedDuration: q.estimatedDuration }
        : null;
      out.isMine = !!same(serviceRequest.selectedProviderId, req.user._id);
      out.canQuote = ['pending', 'quotes_received', 'negotiating'].includes(out.status) && !q
        && ((serviceRequest.invitedProviders || []).some((p) => same(p.providerId, req.user._id))
          || (serviceRequest.matchedProviders || []).some((p) => same(p.providerId, req.user._id)));
    }
    res.json(out);
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
    // Requests this provider was invited to or matched with
    const serviceRequests = await ServiceRequest.find({
      $or: [
        { 'matchedProviders.providerId': req.user._id },
        { 'invitedProviders.providerId': req.user._id },
        { selectedProviderId: req.user._id },
      ],
      status: {
        $in: ['pending', 'quotes_received', 'negotiating', 'provider_selected', 'in_progress', 'awaiting_confirmation', 'completed', 'disputed'],
      },
    })
      .populate('customerId', 'fullName email phoneNumber')
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .sort({ updatedAt: -1 });

    // This provider's quote on each request, and what they need to do next
    const quotes = await Quote.find({ providerId: req.user._id, serviceRequestId: { $in: serviceRequests.map((r) => r._id) } }).lean();
    const byRequest = new Map(quotes.map((q) => [String(q.serviceRequestId), q]));
    const open = ['pending', 'quotes_received', 'negotiating'];

    const out = serviceRequests.map((doc) => {
      const r = doc.toObject();
      const q = byRequest.get(String(r._id));
      const mine = !!same(r.selectedProviderId, req.user._id);
      const invited = (r.invitedProviders || []).some((p) => same(p.providerId, req.user._id));
      // Hide other providers' quotes and contact details
      r.invitedProviders = (r.invitedProviders || []).filter((p) => same(p.providerId, req.user._id));
      r.matchedProviders = undefined;
      r.negotiationHistory = (r.negotiationHistory || []).filter((h) => q && h.quoteId && same(h.quoteId, q._id));
      r.myQuote = q
        ? { _id: q._id, amount: q.amount, originalAmount: q.originalAmount ?? q.amount, status: q.status, lastOfferBy: lastOfferByFor(doc, q), counterCount: q.counterCount || 0, message: q.message }
        : null;
      r.isMine = mine;
      const matched = (doc.matchedProviders || []).some((p) => same(p.providerId, req.user._id));
      r.canQuote = open.includes(r.status) && !q && (invited || matched);
      r.lostToOther = !!r.selectedProviderId && !mine;
      // pending_quote | awaiting_customer | respond_to_counter | declined | booked | lost
      r.providerStage = mine
        ? 'booked'
        : r.lostToOther || (q && q.status === 'rejected' && !open.includes(r.status))
          ? 'lost'
          : !q
            ? (open.includes(r.status) ? 'pending_quote' : 'closed')
            : q.status === 'rejected'
              ? 'declined'
              : r.myQuote.lastOfferBy === 'customer'
                ? 'respond_to_counter'
                : 'awaiting_customer';
      return r;
    });

    res.json(out);
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
    // Once the work has started the customer can't cancel and take the money
    // back unilaterally — that needs an admin (who can refund from the admin panel).
    if (['in_progress', 'awaiting_confirmation'].includes(serviceRequest.status) && req.user.role !== 'admin') {
      return res.status(400).json({ message: 'The provider has already started this job. Please contact support if there is a problem.' });
    }

    serviceRequest.status = 'cancelled';
    serviceRequest.cancelledAt = new Date();
    serviceRequest.cancellationReason = reason || 'Cancelled by user';
    await serviceRequest.save();

    let refund = null;
    if (serviceRequest.paymentStatus === 'paid') {
      refund = await refundServicePayment(serviceRequest, { reason: serviceRequest.cancellationReason });
    } else if (serviceRequest.paymentStatus === 'pending') {
      await ServiceRequest.updateOne({ _id: serviceRequest._id }, { $unset: { paymentStatus: 1 } });
    }

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
      message: refund?.refunded ? 'Service request cancelled and refund issued' : 'Service request cancelled',
      serviceRequest,
      refund,
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

    if (!['provider_selected', 'in_progress', 'awaiting_confirmation'].includes(serviceRequest.status)) {
      return res.status(400).json({ message: 'Request is not in a completable state' });
    }

    const paidInApp = serviceRequest.paymentStatus !== undefined && serviceRequest.paymentStatus !== null;
    if (paidInApp && serviceRequest.paymentStatus === 'pending') {
      return res.status(400).json({ message: 'Please pay for this booking before marking it complete' });
    }

    const previousStatus = serviceRequest.status;
    const claimed = await ServiceRequest.findOneAndUpdate(
      { _id: serviceRequest._id, status: previousStatus },
      { $set: { status: 'completed', completedAt: new Date(), completedBy: 'customer' } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: 'This request was updated. Please refresh.' });
    Object.assign(serviceRequest, claimed.toObject());

    // Paid through Geobuy: release the escrow to the provider's wallet.
    let fundsReleased = false;
    if (paidInApp && ['paid', 'released'].includes(claimed.paymentStatus)) {
      try {
        const r = await releaseServiceFunds(claimed, { io: req.app.get('io'), releasedBy: 'customer' });
        fundsReleased = r.released;
      } catch (e) {
        console.error('Service release failed (admin can retry):', e.message);
      }
    }

    // Older bookings paid directly to the provider: Geobuy invoices its
    // commission automatically when the job is completed.
    if (!paidInApp && serviceRequest.selectedProviderId && serviceRequest.finalPrice > 0) {
      try {
        const exists = await Commission.findOne({ serviceRequestId: serviceRequest._id });
        if (!exists) {
          const [{ providerCommissionPercentage: rate }, { commissionDueDays }] = await Promise.all([
            pricingService.getPricing(serviceRequest.country || 'GB'),
            settingsService.getOperations(),
          ]);
          await Commission.create({
            providerId: serviceRequest.selectedProviderId,
            serviceRequestId: serviceRequest._id,
            amount: serviceRequest.finalPrice,
            currency: serviceRequest.currency || 'GBP',
            commissionRate: rate,
            commissionAmount: round2((serviceRequest.finalPrice * rate) / 100),
            dueDate: settingsService.daysFromNow(commissionDueDays),
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
        `Service request #${serviceRequest.requestId} has been marked as completed${fundsReleased ? ' — your earnings are in your wallet' : ''}`,
        { serviceRequestId: serviceRequest._id }
      );
    }

    res.json({
      message: fundsReleased ? 'Service completed — payment released to the provider' : 'Service request completed',
      serviceRequest,
      fundsReleased,
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
    if (serviceRequest.paymentStatus === 'pending') {
      return res.status(400).json({ message: "The customer hasn't paid yet. We'll notify you as soon as they do." });
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
    const io = req.app.get('io');
    if (io) io.to(`user_${serviceRequest.customerId}`).emit('service-started', { serviceRequestId: serviceRequest._id });

    res.json({
      message: 'Service started',
      serviceRequest,
    });
  } catch (error) {
    console.error('Start service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Provider marks the job as done (PUT /services/requests/:id/mark-done)
// The customer then confirms; if they don't, it auto-completes after
// Settings.features.autoCompleteHours and the provider is paid.
exports.markServiceDone = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id);
    if (!serviceRequest) return res.status(404).json({ message: 'Service request not found' });
    if (!same(serviceRequest.selectedProviderId, req.user._id)) return res.status(403).json({ message: 'Access denied' });
    if (serviceRequest.status !== 'in_progress') {
      return res.status(400).json({ message: 'Start the job before marking it as done' });
    }

    const claimed = await ServiceRequest.findOneAndUpdate(
      { _id: serviceRequest._id, status: 'in_progress' },
      { $set: { status: 'awaiting_confirmation', providerCompletedAt: new Date() } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: 'This request was updated. Please refresh.' });

    await createNotification(
      claimed.customerId,
      'service_marked_done',
      'Job marked as done',
      `${req.user.fullName} has marked ${claimed.serviceType} as done. Please confirm so we can pay them — if there's a problem, contact support.`,
      { serviceRequestId: claimed._id }
    );
    const io = req.app.get('io');
    if (io) io.to(`user_${claimed.customerId}`).emit('service-marked-done', { serviceRequestId: claimed._id });

    res.json({ message: 'Marked as done. The customer has been asked to confirm.', serviceRequest: claimed });
  } catch (error) {
    console.error('Mark service done error:', error);
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
      const defaultRadius = (await pricingService.getPricing(country)).providerSearchRadius;
      const radiusKm = unitToKm(parseFloat(radius) || defaultRadius, country);
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
