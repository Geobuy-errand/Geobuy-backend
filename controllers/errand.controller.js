// ============================================================
// Errand controller — UK & Nigeria
//
// Lifecycle:
//   quote -> create (pending, unpaid) -> pay (hosted checkout)
//   -> runners in the same country are notified -> runner accepts
//   -> en_route -> collected -> delivered -> customer confirms (completed)
//   -> runner's wallet is credited (services/escrowService.js)
// ============================================================

const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Payment = require('../models/Payment.model');
const Settings = require('../models/Setting.model');
const createNotification = require('../utils/create-notification');
const geoService = require('../services/geoService');
const pricingService = require('../services/pricingService');
const { notifyNearbyRunners } = require('../services/runnerMatching');
const { releaseErrandFunds, refundErrandPayment } = require('../services/escrowService');
const { countryOfUser, getCountry, isWithinCountry } = require('../config/countries');
const { formatMoney } = require('../utils/money');
const { sendTemplateEmail, errandTemplates } = require('../utils/email-templates');

const CUSTOMER_PUBLIC_FIELDS = 'fullName averageRating';
const CONTACT_FIELDS = 'fullName email phoneNumber address averageRating totalReviews';

const same = (a, b) => a && b && String(a?._id || a) === String(b?._id || b);

async function sendEmailSafe(to, tpl) {
  try {
    if (to && tpl) await sendTemplateEmail(to, tpl.subject, tpl.title, tpl.content, tpl.button);
  } catch (e) {
    console.warn('Email failed:', e.message);
  }
}

async function paymentRequiredFirst() {
  const s = await Settings.getSettings();
  return s.features?.requirePaymentBeforeAcceptance !== false;
}

/** Hide customer contact details from runners who haven't been assigned. */
function redactForRunner(errand) {
  const obj = errand.toObject ? errand.toObject() : { ...errand };
  if (obj.customerId && typeof obj.customerId === 'object') {
    obj.customerId = { _id: obj.customerId._id, fullName: obj.customerId.fullName, averageRating: obj.customerId.averageRating };
  }
  for (const side of ['pickup', 'dropoff']) {
    if (obj[side]) {
      delete obj[side].contactPhone;
      delete obj[side].contactName;
    }
  }
  delete obj.qrCode;
  return obj;
}

// ------------------------------------------------------------
// Shared: resolve locations, route and price on the SERVER.
// Client-sent distance/price/subscription flags are ignored.
// ------------------------------------------------------------
async function buildQuote(body, user) {
  const country = countryOfUser(user);
  const c = getCountry(country);
  const { pickup, dropoff } = body;

  if (!pickup || !(pickup.address || pickup.street)) {
    const e = new Error('Pickup address is required');
    e.status = 400;
    throw e;
  }
  if (!dropoff || !(dropoff.address || dropoff.street)) {
    const e = new Error('Drop-off address is required');
    e.status = 400;
    throw e;
  }

  const [pickupPoint, dropoffPoint] = await Promise.all([
    geoService.resolvePoint(pickup, country),
    geoService.resolvePoint(dropoff, country),
  ]);

  if (!pickupPoint || !dropoffPoint) {
    const which = !pickupPoint ? 'pickup' : 'drop-off';
    const e = new Error(
      `We couldn't find the ${which} address in ${c.name}. Please pick it from the suggestions or add the area and ${
        country === 'NG' ? 'state' : 'postcode'
      }.`
    );
    e.status = 400;
    throw e;
  }

  for (const [label, p] of [['Pickup', pickupPoint], ['Drop-off', dropoffPoint]]) {
    if (!isWithinCountry(p.lat, p.lng, country)) {
      const e = new Error(`${label} address must be in ${c.name}`);
      e.status = 400;
      throw e;
    }
  }

  const route = await geoService.getRoute(pickupPoint, dropoffPoint, { country });

  const price = await pricingService.calculateErrandPrice({
    country,
    distanceKm: route.distanceKm,
    isHeavyItem: Boolean(body.isHeavyItem),
    isPeakUrgent: Boolean(body.isPeakUrgent),
    extraStopsCount: body.extraStopsCount,
    waitTimeMinutes: body.waitTimeMinutes,
    userId: user._id,
  });

  return { country, pickupPoint, dropoffPoint, route, price };
}

function priceBreakdownResponse(route, price) {
  return {
    country: price.country,
    currency: price.currency,
    distance: {
      value: price.distance,
      unit: price.distanceUnit,
      km: route.distanceKm,
      text: route.distanceText,
      source: route.source,
      accuracy: route.accuracy,
    },
    duration: { minutes: route.durationMin, text: route.durationText },
    baseFee: price.baseFee,
    distanceRate: price.distanceRate,
    distanceFee: price.distanceFee,
    additionalCharges: {
      heavyItem: price.heavyItemFee || null,
      waitTime: price.waitTimeFee || null,
      peakUrgent: price.peakUrgentFee || null,
      extraStops: price.extraStopsFee || null,
    },
    subtotal: price.subtotal,
    subscription: {
      isSubscribed: price.isSubscribed,
      discountPercentage: price.discountPercentage,
      discountAmount: price.discountAmount,
    },
    total: price.total,
    formattedTotal: formatMoney(price.total, price.currency),
    revenueSplit: { geobuyFee: price.platformFee, providerAmount: price.providerAmount },
  };
}

// POST /errands/quote — price preview (what the customer will pay)
exports.quoteErrand = async (req, res) => {
  try {
    const { route, price, pickupPoint, dropoffPoint } = await buildQuote(req.body, req.user);
    res.json({
      priceBreakdown: priceBreakdownResponse(route, price),
      pickup: { coordinates: pickupPoint },
      dropoff: { coordinates: dropoffPoint },
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// POST /errands — create errand (unpaid). Customer pays next.
exports.createErrand = async (req, res) => {
  try {
    const { pickup, dropoff, taskDetails, preferredDate, preferredTime, requiresLiveTracking, photos } = req.body;

    if (!preferredDate || !preferredTime) {
      return res.status(400).json({ message: 'Preferred date and time are required' });
    }

    const { country, pickupPoint, dropoffPoint, route, price } = await buildQuote(req.body, req.user);

    const errand = new Errand({
      customerId: req.user._id,
      country,
      currency: price.currency,
      distanceUnit: price.distanceUnit,
      pickup: { ...pickup, formattedAddress: pickup.address, coordinates: pickupPoint },
      dropoff: { ...dropoff, formattedAddress: dropoff.address, coordinates: dropoffPoint },
      taskDetails: taskDetails || '',
      preferredDate,
      preferredTime,
      photos: photos || [],
      requiresLiveTracking: Boolean(requiresLiveTracking),
      status: 'pending',
      paymentStatus: 'pending',
      distance: price.distance,
      distanceKm: route.distanceKm,
      distanceText: route.distanceText,
      distanceSource: route.source,
      duration: route.durationMin,
      durationText: route.durationText,
      isHeavyItem: Boolean(req.body.isHeavyItem),
      isPeakUrgent: Boolean(req.body.isPeakUrgent),
      extraStopsCount: price.extraStopsCount,
      waitTimeMinutes: price.waitTimeMinutes,
      isSubscribed: price.isSubscribed,
      baseFee: price.baseFee,
      distanceFee: price.distanceFee,
      distanceRate: price.distanceRate,
      heavyItemFee: price.heavyItemFee,
      waitTimeFee: price.waitTimeFee,
      peakUrgentFee: price.peakUrgentFee,
      extraStopsFee: price.extraStopsFee,
      subtotal: price.subtotal,
      discountPercentage: price.discountPercentage,
      discountAmount: price.discountAmount,
      total: price.total,
      platformFee: price.platformFee,
      providerAmount: price.providerAmount,
    });

    await errand.save();

    const payFirst = await paymentRequiredFirst();
    let nearestProviders = [];
    if (!payFirst) {
      const matches = await notifyNearbyRunners(errand, req.app.get('io'));
      nearestProviders = matches.map(({ runner, route: r }) => ({
        id: runner._id,
        name: runner.fullName,
        distance: r?.distanceText,
        duration: r?.durationText,
        rating: runner.averageRating,
      }));
    }

    res.status(201).json({
      message: payFirst ? 'Errand created — please complete payment to find a runner' : 'Errand created successfully',
      errand,
      paymentRequired: payFirst,
      priceBreakdown: priceBreakdownResponse(route, price),
      nearestProviders,
    });
  } catch (error) {
    console.error('Create errand error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Failed to create errand' });
  }
};

// GET /errands/available — runner job board (same country, paid, unassigned)
exports.getAvailableErrands = async (req, res) => {
  try {
    const runner = req.user;
    const country = countryOfUser(runner);

    const query = { status: 'pending', providerId: null, country };
    // Errands created before Nigeria support have no country field.
    if (country === 'GB') {
      delete query.country;
      query.$or = [{ country: 'GB' }, { country: { $exists: false } }];
    }
    if (await paymentRequiredFirst()) query.paymentStatus = 'paid';

    const errands = await Errand.find(query)
      .populate('customerId', CUSTOMER_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .limit(100);

    const runnerPoint = geoService.pointFromGeoJSON(runner.location);
    let result = errands.map(redactForRunner);

    if (runnerPoint) {
      const distances = await geoService.getDistancesFrom(
        runnerPoint,
        result.map((e) => e.pickup?.coordinates),
        { country }
      );
      result = result
        .map((e, i) => ({
          ...e,
          distanceToPickup: distances[i]?.distanceText || null,
          distanceToPickupKm: distances[i]?.distanceKm ?? null,
          timeToPickup: distances[i]?.durationText || null,
        }))
        .sort((a, b) => (a.distanceToPickupKm ?? 1e9) - (b.distanceToPickupKm ?? 1e9));
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /errands — the caller's own errands
exports.getErrands = async (req, res) => {
  try {
    const query = {};
    const role = req.user.role;
    if (role === 'customer') query.customerId = req.user._id;
    else if (role === 'errand_runner' || role === 'provider') query.providerId = req.user._id;
    else if (role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    if (role === 'admin' && req.query.country) query.country = String(req.query.country).toUpperCase();

    const errands = await Errand.find(query)
      .populate('customerId', CONTACT_FIELDS)
      .populate('providerId', CONTACT_FIELDS)
      .sort({ createdAt: -1 });

    res.json(errands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /errands/:id
exports.getErrandById = async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id)
      .populate('customerId', CONTACT_FIELDS)
      .populate('providerId', CONTACT_FIELDS);

    if (!errand) return res.status(404).json({ message: 'Errand not found' });

    const user = req.user;
    const isCustomer = same(errand.customerId, user._id);
    const isRunner = same(errand.providerId, user._id);

    if (isCustomer || isRunner || user.role === 'admin') return res.json(errand);

    // Runners may preview open errands in their country (without contact details).
    const openToRunner =
      user.role === 'errand_runner' &&
      errand.status === 'pending' &&
      !errand.providerId &&
      (errand.country || 'GB') === countryOfUser(user);
    if (openToRunner) return res.json(redactForRunner(errand));

    return res.status(403).json({ message: 'Access denied' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /errands/:id/accept — atomic, first runner wins
exports.acceptErrand = async (req, res) => {
  try {
    const runner = req.user;

    if (runner.verificationStatus !== 'approved') {
      return res.status(403).json({ message: 'Your account must be verified before you can accept errands.' });
    }

    const existing = await Errand.findById(req.params.id).select('country paymentStatus status providerId');
    if (!existing) return res.status(404).json({ message: 'Errand not found' });
    if ((existing.country || 'GB') !== countryOfUser(runner)) {
      return res.status(403).json({ message: 'This errand is in a different country' });
    }

    const filter = { _id: req.params.id, status: 'pending', providerId: null };
    if (await paymentRequiredFirst()) filter.paymentStatus = 'paid';

    // findOneAndUpdate with the status in the filter means only ONE runner
    // can ever win, even if two tap "Accept" at the same moment.
    const errand = await Errand.findOneAndUpdate(
      filter,
      { $set: { providerId: runner._id, status: 'accepted', acceptedAt: new Date(), negotiationStatus: 'accepted' } },
      { new: true }
    ).populate('customerId', 'fullName email');

    if (!errand) {
      return res.status(409).json({ message: 'Sorry, this errand has already been taken or is no longer available.' });
    }

    await Payment.updateMany({ errandId: errand._id, type: { $in: ['errand', null] } }, { $set: { providerId: runner._id } });

    await createNotification(errand.customerId._id, 'booking_accepted', 'Errand accepted', `${runner.fullName} has accepted your errand #${errand.errandId}`, {
      errandId: errand._id,
    });

    const io = req.app.get('io');
    if (io) {
      const payload = { errandId: errand._id, providerId: runner._id, providerName: runner.fullName };
      io.to(`errand_${errand._id}`).emit('errand-accepted', payload);
      io.to(`user_${errand.customerId._id}`).emit('errand-accepted', payload);
      io.to('admin_room').emit('errand-accepted', payload);
    }

    await sendEmailSafe(
      errand.customerId.email,
      errandTemplates.errandAccepted(errand.customerId.fullName, errand.errandId, runner.fullName, errand.preferredDate || 'To be scheduled')
    );
    await sendEmailSafe(
      runner.email,
      errandTemplates.youAcceptedErrand(runner.fullName, errand.errandId, 'Errand runs', errand.pickup?.address || 'Pickup location')
    );

    const full = await Errand.findById(errand._id).populate('customerId', CONTACT_FIELDS).populate('providerId', CONTACT_FIELDS);
    res.json({ message: 'Errand accepted successfully', errand: full });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Who may move an errand from one status to another
const RUNNER_TRANSITIONS = {
  accepted: ['en_route', 'cancelled'],
  en_route: ['collected', 'cancelled'],
  collected: ['delivered'],
};
const CUSTOMER_TRANSITIONS = {
  pending: ['cancelled'],
  accepted: ['cancelled'],
  delivered: ['completed'],
};
const ADMIN_TRANSITIONS = {
  pending: ['cancelled'],
  accepted: ['en_route', 'cancelled'],
  en_route: ['collected', 'cancelled'],
  collected: ['delivered', 'cancelled'],
  delivered: ['completed', 'cancelled'],
};

// PUT /errands/:id/status
exports.updateErrandStatus = async (req, res) => {
  try {
    const { status, location, reason } = req.body;
    const errand = await Errand.findById(req.params.id)
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email phoneNumber');

    if (!errand) return res.status(404).json({ message: 'Errand not found' });

    const user = req.user;
    const isCustomer = same(errand.customerId, user._id);
    const isRunner = same(errand.providerId, user._id);
    const isAdmin = user.role === 'admin';

    if (!isCustomer && !isRunner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const table = isAdmin ? ADMIN_TRANSITIONS : isRunner ? RUNNER_TRANSITIONS : CUSTOMER_TRANSITIONS;
    if (!table[errand.status]?.includes(status)) {
      const hint =
        status === 'completed' && isRunner
          ? ' Only the customer can confirm completion — mark it as delivered instead.'
          : '';
      return res.status(400).json({ message: `You can't change this errand from "${errand.status}" to "${status}".${hint}` });
    }

    const io = req.app.get('io');
    const previousStatus = errand.status;

    // A runner who backs out returns the errand to the pool rather than
    // cancelling the customer's (already paid) errand.
    if (status === 'cancelled' && isRunner && !isAdmin) {
      const released = await Errand.findOneAndUpdate(
        { _id: errand._id, providerId: user._id, status: { $in: ['accepted', 'en_route'] } },
        {
          $set: { status: 'pending', acceptedAt: null, enRouteAt: null },
          $unset: { providerId: 1 },
          $push: { locationUpdates: { timestamp: new Date(), status: `runner_withdrew: ${reason || 'no reason'}` } },
        },
        { new: true }
      );
      if (!released) return res.status(409).json({ message: 'Errand could not be released' });
      await Payment.updateMany({ errandId: errand._id }, { $unset: { providerId: 1 } });
      await createNotification(
        errand.customerId._id,
        'errand_status_updated',
        'Finding a new runner',
        `Your runner had to withdraw from errand #${errand.errandId}. We're finding you another runner.`,
        { errandId: errand._id }
      );
      await notifyNearbyRunners(released, io);
      if (io) io.to(`user_${errand.customerId._id}`).emit('errand-status-updated', { errandId: errand._id, status: 'pending' });
      return res.json({ message: 'You have withdrawn from this errand', errand: released });
    }

    // Claim the transition atomically so double-taps can't double-process.
    const stamp = {
      accepted: 'acceptedAt',
      en_route: 'enRouteAt',
      collected: 'collectedAt',
      delivered: 'deliveredAt',
      completed: 'completedAt',
      cancelled: 'cancelledAt',
    }[status];

    const set = { status };
    if (stamp) set[stamp] = new Date();
    if (status === 'completed') set.completedBy = isAdmin ? 'admin' : 'customer';
    if (status === 'cancelled') {
      set.cancellationReason = reason || 'Cancelled by user';
      set.cancelledBy = user.role;
    }
    const update = { $set: set };
    if (location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
      update.$push = { locationUpdates: { lat: Number(location.lat), lng: Number(location.lng), timestamp: new Date(), status } };
    }

    const updated = await Errand.findOneAndUpdate({ _id: errand._id, status: previousStatus }, update, { new: true })
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email phoneNumber');
    if (!updated) return res.status(409).json({ message: 'This errand was updated by someone else. Please refresh.' });

    let fundsReleased = false;
    let refund = null;

    if (status === 'completed') {
      try {
        const r = await releaseErrandFunds(updated, { io, releasedBy: user.role });
        fundsReleased = r.released;
      } catch (e) {
        console.error('Release funds failed (admin can retry):', e.message);
      }
      await sendEmailSafe(
        updated.customerId?.email,
        errandTemplates.errandCompleted?.(updated.customerId?.fullName, updated.errandId, updated.providerId?.fullName)
      );
      await sendEmailSafe(
        updated.providerId?.email,
        errandTemplates.errandCompletedProvider?.(updated.providerId?.fullName, updated.errandId, updated.customerId?.fullName)
      );
    }

    if (status === 'cancelled' && ['paid'].includes(updated.paymentStatus)) {
      refund = await refundErrandPayment(updated, { reason: set.cancellationReason });
    }

    // Notify the other party
    const recipients = [];
    if (!isCustomer) recipients.push(updated.customerId?._id);
    if (!isRunner && updated.providerId) recipients.push(updated.providerId._id);
    for (const r of recipients.filter(Boolean)) {
      await createNotification(r, `errand_${status}`, `Errand ${status.replace('_', ' ')}`, `Errand #${updated.errandId} is now ${status.replace('_', ' ')}`, {
        errandId: updated._id,
        status,
      });
    }

    if (io) {
      const payload = { errandId: updated._id, status, location, timestamp: new Date() };
      io.to(`user_${updated.customerId._id}`).emit('errand-status-updated', { ...payload, errand: updated });
      if (updated.providerId) io.to(`user_${updated.providerId._id}`).emit('errand-status-updated', { ...payload, errand: updated });
      io.to(`errand_${updated._id}`).emit('errand-status-updated', payload);
      io.to('admin_room').emit('errand-status-updated', {
        ...payload,
        customerId: updated.customerId._id,
        providerId: updated.providerId?._id,
        errand: { errandId: updated.errandId, pickup: updated.pickup, dropoff: updated.dropoff, total: updated.total, currency: updated.currency },
      });
      if (status === 'completed') {
        io.to(`user_${updated.customerId._id}`).emit('rate-provider', {
          errandId: updated._id,
          providerId: updated.providerId?._id,
          providerName: updated.providerId?.fullName,
        });
      }
    }

    res.json({
      message: `Errand ${status.replace('_', ' ')} successfully`,
      errand: updated,
      ...(status === 'completed' && { fundsReleased }),
      ...(refund && { refund }),
    });
  } catch (error) {
    console.error('Update errand status error:', error);
    res.status(500).json({ message: error.message });
  }
};

// GET /errands/status/:status
exports.getErrandsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['pending', 'accepted', 'en_route', 'collected', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const query = { status };
    if (req.user.role === 'customer') query.customerId = req.user._id;
    else if (req.user.role === 'errand_runner' || req.user.role === 'provider') query.providerId = req.user._id;
    else if (req.user.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

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

// GET /errands/stats
exports.getErrandStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    const query = {};
    if (role === 'customer') query.customerId = userId;
    else if (role === 'errand_runner' || role === 'provider') query.providerId = userId;
    else if (role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const statuses = ['pending', 'accepted', 'en_route', 'collected', 'delivered', 'completed', 'cancelled'];
    const counts = await Errand.aggregate([{ $match: query }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));

    const stats = {
      total: counts.reduce((s, c) => s + c.n, 0),
      pending: byStatus.pending || 0,
      accepted: byStatus.accepted || 0,
      enRoute: byStatus.en_route || 0,
      collected: byStatus.collected || 0,
      delivered: byStatus.delivered || 0,
      completed: byStatus.completed || 0,
      cancelled: byStatus.cancelled || 0,
      currency: getCountry(countryOfUser(req.user)).currency,
    };
    statuses.forEach((s) => (stats[s] = stats[s] ?? byStatus[s] ?? 0));

    if (role === 'errand_runner') {
      const earnings = await Errand.aggregate([
        { $match: { providerId: userId, status: 'completed' } },
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
