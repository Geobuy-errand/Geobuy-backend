// ============================================================
// Runner matching — find verified errand runners near a pickup point
// in the same country, rank them by real road distance, notify them.
// ============================================================

const User = require('../models/User.model');
const Errand = require('../models/Errand.model');
const geoService = require('./geoService');
const createNotification = require('../utils/create-notification');
const { formatMoney } = require('../utils/money');
const { unitToKm } = require('../config/countries');

const SEARCH_RADIUS_KM = Number(process.env.RUNNER_SEARCH_RADIUS_KM) || 25;
const MAX_NOTIFIED = 10;

/** Runners eligible to see/accept errands in a country. */
function eligibleRunnerQuery(country) {
  return {
    role: 'errand_runner',
    country,
    isActive: true,
    isAvailable: { $ne: false },
    verificationStatus: 'approved',
  };
}

async function findNearbyRunners(errand) {
  const pickup = geoService.toPoint(errand.pickup?.coordinates);
  const country = errand.country || 'GB';
  let runners = [];

  if (pickup) {
    runners = await User.find({
      ...eligibleRunnerQuery(country),
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [pickup.lng, pickup.lat] },
          $maxDistance: SEARCH_RADIUS_KM * 1000,
        },
      },
    })
      .select('_id fullName location averageRating serviceArea')
      .limit(30)
      .lean();
  }

  // Fallback: runners with no saved location but in the same town / state.
  if (runners.length === 0) {
    const area = [errand.pickup?.town, errand.pickup?.state].filter(Boolean);
    if (area.length) {
      runners = await User.find({
        ...eligibleRunnerQuery(country),
        $or: [{ 'address.town': { $in: area } }, { 'address.state': { $in: area } }],
      })
        .select('_id fullName location averageRating serviceArea')
        .limit(20)
        .lean();
    }
  }

  if (runners.length === 0) return [];

  const distances = pickup
    ? await geoService.getDistancesFrom(
        pickup,
        runners.map((r) => geoService.pointFromGeoJSON(r.location)),
        { country }
      )
    : runners.map(() => null);

  return runners
    .map((r, i) => ({ runner: r, route: distances[i] }))
    .filter(({ runner, route }) => {
      // Respect the runner's own max travel radius if they set one.
      const radius = Number(runner.serviceArea?.radius);
      if (!route || !radius) return true;
      return route.distanceKm <= unitToKm(radius, country);
    })
    .sort((a, b) => (a.route?.distanceKm ?? 1e9) - (b.route?.distanceKm ?? 1e9))
    .slice(0, MAX_NOTIFIED);
}

/** Notify nearby runners about a (paid) errand and store the match list. */
async function notifyNearbyRunners(errandOrId, io) {
  const errand = errandOrId?._id ? errandOrId : await Errand.findById(errandOrId);
  if (!errand || errand.status !== 'pending' || errand.providerId) return [];

  let matches = [];
  try {
    matches = await findNearbyRunners(errand);
  } catch (e) {
    console.warn('Runner matching failed:', e.message);
    return [];
  }

  const price = formatMoney(errand.providerAmount || errand.total, errand.currency);

  for (const { runner, route } of matches) {
    const away = route ? `${route.distanceText} from you` : 'near you';
    await createNotification(runner._id, 'booking_created', 'New errand available', `New errand ${away} — earn ${price}`, {
      errandId: errand._id,
      distance: route?.distanceText,
      duration: route?.durationText,
      estimatedEarnings: errand.providerAmount,
      currency: errand.currency,
    });
    if (io) {
      io.to(`user_${runner._id}`).emit('new-errand-available', {
        errandId: errand._id,
        distance: route?.distanceText,
        duration: route?.durationText,
        pickup: errand.pickup?.town || errand.pickup?.address,
        estimatedEarnings: errand.providerAmount,
        currency: errand.currency,
      });
    }
  }

  errand.matchedProviders = matches.map(({ runner, route }) => ({
    providerId: runner._id,
    distance: route?.distanceKm,
    distanceText: route?.distanceText,
    duration: route?.durationText,
    isNearby: Boolean(route && route.distanceKm <= 5),
    status: 'notified',
    notifiedAt: new Date(),
  }));
  await Errand.updateOne({ _id: errand._id }, { $set: { matchedProviders: errand.matchedProviders } });
  return matches;
}

module.exports = { findNearbyRunners, notifyNearbyRunners, eligibleRunnerQuery };
