/**
 * One-off migration for existing (UK-only) data — safe to run more than once.
 *
 *   node scripts/migrate-add-country.js            # dry run (shows what would change)
 *   node scripts/migrate-add-country.js --apply    # actually write changes
 *
 * What it does:
 *  1. Tags every existing user / errand / payment / wallet / withdrawal /
 *     transaction / subscription / service request / connection as UK (GB/GBP)
 *     where no country is set yet.
 *  2. Sets distanceKm on old errands (their `distance` is in miles).
 *  3. Geocodes users whose map location is still [0,0] (the old default), so
 *     "nearby" runner/provider matching works. Uses the same geocoder as the
 *     app (Google if GOOGLE_MAPS_API_KEY is set, otherwise OpenStreetMap at
 *     1 request/second).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const geoService = require('../services/geoService');

const APPLY = process.argv.includes('--apply');

async function tag(collection, filter, set, label) {
  const col = mongoose.connection.db.collection(collection);
  const n = await col.countDocuments(filter);
  if (APPLY && n) await col.updateMany(filter, { $set: set });
  console.log(`${APPLY ? 'updated' : 'would update'} ${n} ${label}`);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(APPLY ? '== APPLYING CHANGES ==' : '== DRY RUN (add --apply to write) ==');
  const noCountry = { $or: [{ country: { $exists: false } }, { country: null }] };

  await tag('users', noCountry, { country: 'GB' }, 'users → GB');
  await tag('errands', noCountry, { country: 'GB', currency: 'GBP', distanceUnit: 'mi' }, 'errands → GB/GBP');
  await tag('payments', noCountry, { country: 'GB' }, 'payments → GB');
  await tag('payments', { $or: [{ gateway: { $exists: false } }, { gateway: null }] }, { gateway: 'stripe' }, 'payments → gateway stripe');
  await tag('withdrawals', noCountry, { country: 'GB', currency: 'GBP', gateway: 'manual' }, 'withdrawals → GB/GBP');
  await tag('subscriptions', noCountry, { country: 'GB', currency: 'GBP', gateway: 'stripe' }, 'subscriptions → GB/GBP');
  await tag('servicerequests', noCountry, { country: 'GB', currency: 'GBP' }, 'service requests → GB/GBP');
  await tag('connections', noCountry, { country: 'GB' }, 'connections → GB');
  await tag('connectposts', noCountry, { country: 'GB' }, 'connect posts → GB');
  await tag('subscriptionplans', { $or: [{ countries: { $exists: false } }, { countries: { $size: 0 } }] }, { countries: ['GB'] }, 'plans → available in GB');

  // distanceKm for old errands (distance was stored in miles)
  const errands = mongoose.connection.db.collection('errands');
  const oldErrands = await errands.find({ distanceKm: { $exists: false }, distance: { $gt: 0 } }).project({ distance: 1 }).toArray();
  console.log(`${APPLY ? 'setting' : 'would set'} distanceKm on ${oldErrands.length} errands`);
  if (APPLY) {
    for (const e of oldErrands) {
      await errands.updateOne({ _id: e._id }, { $set: { distanceKm: Math.round(e.distance * 1.609344 * 1000) / 1000 } });
    }
  }

  // Geocode users stuck at [0,0]
  const users = mongoose.connection.db.collection('users');
  const unlocated = await users
    .find({ role: { $in: ['provider', 'errand_runner', 'customer'] }, 'location.coordinates': [0, 0], 'address.town': { $exists: true, $ne: '' } })
    .project({ address: 1, country: 1, email: 1 })
    .toArray();
  console.log(`${unlocated.length} users have no map location`);
  let fixed = 0;
  for (const u of unlocated) {
    const point = await geoService.resolvePoint(u.address || {}, u.country || 'GB').catch(() => null);
    if (!point) {
      console.log(`  could not geocode ${u.email} (${geoService.addressToString(u.address || {})})`);
      continue;
    }
    fixed++;
    if (APPLY) await users.updateOne({ _id: u._id }, { $set: { location: { type: 'Point', coordinates: [point.lng, point.lat] } } });
  }
  console.log(`${APPLY ? 'located' : 'could locate'} ${fixed} of ${unlocated.length} users`);

  await mongoose.disconnect();
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
