/* eslint-disable no-console */
// ============================================================
// GEOBUY — UK + Nigeria test data
//
//   npm run seed:test                 # replace test data, keep everything else
//   npm run seed:test -- --wipe       # empty the WHOLE database first
//                                     #   (needs ALLOW_DB_RESET=true)
//
// Also available over HTTP for hosted environments:
//   GET /api/seed/test-data   (admin login or x-seed-secret header)
//
// Every account it creates uses an @geobuy.test email. Re-running deletes
// those accounts and everything linked to them, then creates them again,
// so real users and real data are never touched (unless you use --wipe).
//
// What you get, for BOTH the UK (GBP, miles, Stripe) and Nigeria
// (NGN, km, Paystack):
//   - customers, errand runners and service providers (approved + pending)
//   - errands in every stage: unpaid, paid & waiting for a runner, accepted,
//     en route, collected, delivered (awaiting confirmation), completed &
//     paid out, cancelled & refunded
//   - provider bookings in every stage: inviting, quotes in, awaiting
//     payment, paid, in progress, marked done, completed & paid out,
//     an older pay-the-provider-directly job with a commission invoice,
//     cancelled & refunded
//   - wallets that match those payouts, completed + pending withdrawals
//   - payments, transactions, notifications, chats, support tickets,
//     reviews, verification documents, subscriptions, Connect posts and
//     connection requests
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const User = require('../models/User.model');
const ErrandRunnerProfile = require('../models/ErrandRunnerProfile.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const Wallet = require('../models/Wallet.model');
const Withdrawal = require('../models/Withdrawal.model');
const Transaction = require('../models/Transaction.model');
const Payment = require('../models/Payment.model');
const Errand = require('../models/Errand.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const Quote = require('../models/Quote.model');
const Commission = require('../models/Commission.model');
const Notification = require('../models/Notification.model');
const Chat = require('../models/Chat.model');
const Message = require('../models/Message.model');
const Review = require('../models/Review.model');
const Booking = require('../models/Booking.model');
const Service = require('../models/Service.model');
const ServiceCategory = require('../models/ServiceCategory.model');
const Verification = require('../models/Verification.model');
const Subscription = require('../models/Subscription.model');
const SubscriptionPlan = require('../models/SubscriptionPlan.model');
const Connection = require('../models/Connection.model');
const ConnectPost = require('../models/ConnectPost.model');
const Settings = require('../models/Setting.model');

const pricingService = require('../services/pricingService');
const geoService = require('../services/geoService');
const { getCountry } = require('../config/countries');

const DOMAIN = 'geobuy.test';
const PASSWORD = 'Test1234!';
const ADMIN_PASSWORD = 'Admin1234!';
const SAMPLE_DOC = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const daysAgo = (d, h = 0) => new Date(Date.now() - d * 86400000 - h * 3600000);
const daysAhead = (d) => new Date(Date.now() + d * 86400000);
const email = (local) => `${local}@${DOMAIN}`;
let refCounter = 0;
const ref = (prefix) => `SEED-${prefix}-${Date.now().toString(36)}-${(++refCounter).toString().padStart(3, '0')}`;

// ------------------------------------------------------------
// Places
// ------------------------------------------------------------
const PLACES = {
  GB: {
    oxfordSt: { address: '200 Oxford Street, London W1D 1NU', street: '200 Oxford Street', town: 'London', postcode: 'W1D 1NU', state: 'London', lat: 51.5152, lng: -0.1419 },
    waterloo: { address: 'Waterloo Station, London SE1 8SW', street: 'Waterloo Road', town: 'London', postcode: 'SE1 8SW', state: 'London', lat: 51.5031, lng: -0.1132 },
    camden: { address: '1 Camden High Street, London NW1 7JE', street: '1 Camden High Street', town: 'London', postcode: 'NW1 7JE', state: 'London', lat: 51.5362, lng: -0.1409 },
    shoreditch: { address: '50 Shoreditch High Street, London E1 6PJ', street: '50 Shoreditch High Street', town: 'London', postcode: 'E1 6PJ', state: 'London', lat: 51.5246, lng: -0.0779 },
    brixton: { address: '400 Brixton Road, London SW9 7AW', street: '400 Brixton Road', town: 'London', postcode: 'SW9 7AW', state: 'London', lat: 51.4655, lng: -0.1149 },
    manchester: { address: '1 Piccadilly Gardens, Manchester M1 1RG', street: '1 Piccadilly Gardens', town: 'Manchester', postcode: 'M1 1RG', state: 'Manchester', lat: 53.4808, lng: -2.2366 },
    salford: { address: 'MediaCityUK, Salford M50 2EQ', street: 'MediaCityUK', town: 'Salford', postcode: 'M50 2EQ', state: 'Manchester', lat: 53.4722, lng: -2.2985 },
  },
  NG: {
    lekki: { address: '12 Admiralty Way, Lekki Phase 1, Lagos', street: '12 Admiralty Way', area: 'Lekki Phase 1', lga: 'Eti-Osa', town: 'Lekki', state: 'Lagos', lat: 6.4474, lng: 3.4723 },
    ikeja: { address: '25 Allen Avenue, Ikeja, Lagos', street: '25 Allen Avenue', area: 'Allen', lga: 'Ikeja', town: 'Ikeja', state: 'Lagos', lat: 6.6018, lng: 3.3515 },
    vi: { address: '3 Adeola Odeku Street, Victoria Island, Lagos', street: '3 Adeola Odeku Street', area: 'Victoria Island', lga: 'Eti-Osa', town: 'Victoria Island', state: 'Lagos', lat: 6.4281, lng: 3.4219 },
    yaba: { address: '10 Herbert Macaulay Way, Yaba, Lagos', street: '10 Herbert Macaulay Way', area: 'Yaba', lga: 'Lagos Mainland', town: 'Yaba', state: 'Lagos', lat: 6.5095, lng: 3.3711 },
    surulere: { address: '9 Bode Thomas Street, Surulere, Lagos', street: '9 Bode Thomas Street', area: 'Surulere', lga: 'Surulere', town: 'Surulere', state: 'Lagos', lat: 6.4969, lng: 3.3539 },
    wuse: { address: 'Plot 5, Aminu Kano Crescent, Wuse 2, Abuja', street: 'Aminu Kano Crescent', area: 'Wuse 2', lga: 'Abuja Municipal', town: 'Abuja', state: 'Federal Capital Territory', lat: 9.0765, lng: 7.4797 },
    garki: { address: '14 Ahmadu Bello Way, Garki, Abuja', street: 'Ahmadu Bello Way', area: 'Garki', lga: 'Abuja Municipal', town: 'Abuja', state: 'Federal Capital Territory', lat: 9.0333, lng: 7.4893 },
  },
};

const addr = (p) => ({ street: p.street, area: p.area, lga: p.lga, town: p.town, state: p.state, postcode: p.postcode });
const geoPoint = (p) => ({ type: 'Point', coordinates: [p.lng, p.lat] });
const errandStop = (p, contactName, contactPhone) => ({
  address: p.address,
  formattedAddress: p.address,
  street: p.street,
  area: p.area,
  town: p.town,
  lga: p.lga,
  state: p.state,
  postcode: p.postcode,
  contactName,
  contactPhone,
  coordinates: { lat: p.lat, lng: p.lng },
});

// ------------------------------------------------------------
// People
// ------------------------------------------------------------
const COMMON = { isActive: true, isVerified: true, over18: true, acceptedTerms: true, acceptedPrivacy: true };

const PEOPLE = {
  GB: {
    customers: [
      { key: 'ukCustomer', fullName: 'Emma Wilson', email: email('uk.customer'), phoneNumber: '07700 900101', place: 'oxfordSt', subscribed: true, connect: true },
      { key: 'ukCustomer2', fullName: 'James Patel', email: email('uk.customer2'), phoneNumber: '07700 900102', place: 'manchester' },
    ],
    runners: [
      { key: 'ukRunner', fullName: 'Oliver Bennett', email: email('uk.runner'), phoneNumber: '07700 900201', place: 'camden', vehicleType: 'car', travelType: 'driving', status: 'approved', bank: { bankName: 'Barclays', sortCode: '20-00-00', accountNumber: '55779911', accountName: 'Oliver Bennett', isVerified: true } },
      { key: 'ukRunnerBike', fullName: 'Amelia Clarke', email: email('uk.runner.bike'), phoneNumber: '07700 900202', place: 'shoreditch', vehicleType: 'bicycle', travelType: 'cycling', status: 'approved', bank: { bankName: 'Monzo', sortCode: '04-00-04', accountNumber: '11223344', accountName: 'Amelia Clarke', isVerified: true } },
      { key: 'ukRunnerPending', fullName: 'Harry Evans', email: email('uk.runner.pending'), phoneNumber: '07700 900203', place: 'brixton', vehicleType: 'motorbike', travelType: 'driving', status: 'pending', bank: { bankName: 'Lloyds', sortCode: '30-90-89', accountNumber: '99887766', accountName: 'Harry Evans' } },
    ],
    providers: [
      { key: 'ukProvider', fullName: 'Sparkle Cleaners London', email: email('uk.provider'), phoneNumber: '07700 900301', place: 'waterloo', status: 'approved', categories: ['cleaning', 'residential_cleaning', 'deep_cleaning'], rate: 25, about: 'Domestic and end-of-tenancy cleaning across central London.', bank: { bankName: 'HSBC', sortCode: '40-11-62', accountNumber: '33445566', accountName: 'Sparkle Cleaners Ltd', isVerified: true } },
      { key: 'ukCarer', fullName: 'Golden Years Care', email: email('uk.carer'), phoneNumber: '07700 900302', place: 'camden', status: 'approved', categories: ['healthcare', 'basic_care_and_support', 'caregiving_services'], rate: 22, care: true, about: 'DBS-checked carers for elderly support and companionship.', bank: { bankName: 'NatWest', sortCode: '60-16-13', accountNumber: '77665544', accountName: 'Golden Years Care', isVerified: true } },
      { key: 'ukProviderPending', fullName: 'Fix-It Fred', email: email('uk.provider.pending'), phoneNumber: '07700 900303', place: 'salford', status: 'pending', categories: ['trades', 'plumbing'], rate: 40, about: 'Plumber, 12 years experience.', bank: { bankName: 'Santander', sortCode: '09-01-28', accountNumber: '12121212', accountName: 'Fred Hughes' } },
    ],
  },
  NG: {
    customers: [
      { key: 'ngCustomer', fullName: 'Chiamaka Okafor', email: email('ng.customer'), phoneNumber: '0803 123 4501', place: 'lekki', subscribed: true, connect: true },
      { key: 'ngCustomer2', fullName: 'Ibrahim Musa', email: email('ng.customer2'), phoneNumber: '0806 123 4502', place: 'wuse' },
    ],
    runners: [
      { key: 'ngRunner', fullName: 'Tunde Bello', email: email('ng.runner'), phoneNumber: '0802 123 4601', place: 'ikeja', vehicleType: 'motorbike', travelType: 'driving', status: 'approved', bank: { bankName: 'Access Bank', bankCode: '044', accountNumber: '0690000031', accountName: 'TUNDE BELLO', isVerified: true, paystackRecipientCode: 'RCP_seed_tunde' } },
      { key: 'ngRunnerKeke', fullName: 'Emeka Nwosu', email: email('ng.runner.keke'), phoneNumber: '0813 123 4602', place: 'yaba', vehicleType: 'keke', travelType: 'driving', status: 'approved', bank: { bankName: 'GTBank', bankCode: '058', accountNumber: '0123456789', accountName: 'EMEKA NWOSU', isVerified: true, paystackRecipientCode: 'RCP_seed_emeka' } },
      { key: 'ngRunnerPending', fullName: 'Aisha Lawal', email: email('ng.runner.pending'), phoneNumber: '0703 123 4603', place: 'surulere', vehicleType: 'car', travelType: 'driving', status: 'pending', bank: { bankName: 'First Bank', bankCode: '011', accountNumber: '3012345678', accountName: 'AISHA LAWAL' } },
    ],
    providers: [
      { key: 'ngProvider', fullName: 'Ngozi Home Cleaning', email: email('ng.provider'), phoneNumber: '0805 123 4701', place: 'surulere', status: 'approved', categories: ['cleaning', 'residential_cleaning', 'deep_cleaning'], rate: 15000, about: 'Home and office cleaning across Lagos Mainland and the Island.', bank: { bankName: 'Zenith Bank', bankCode: '057', accountNumber: '2012345678', accountName: 'NGOZI ADEBAYO', isVerified: true, paystackRecipientCode: 'RCP_seed_ngozi' } },
      { key: 'ngProviderAbuja', fullName: 'Capital Fix & Clean', email: email('ng.provider.abuja'), phoneNumber: '0809 123 4702', place: 'garki', status: 'approved', categories: ['cleaning', 'residential_cleaning', 'trades', 'plumbing', 'electrical'], rate: 20000, about: 'Plumbing, electrical and cleaning in Abuja.', bank: { bankName: 'UBA', bankCode: '033', accountNumber: '1012345678', accountName: 'CAPITAL FIX AND CLEAN', isVerified: true, paystackRecipientCode: 'RCP_seed_capital' } },
      { key: 'ngProviderPending', fullName: 'Mama Care Services', email: email('ng.provider.pending'), phoneNumber: '0704 123 4703', place: 'vi', status: 'pending', categories: ['healthcare', 'basic_care_and_support'], rate: 12000, care: true, about: 'Elderly care and home support.', bank: { bankName: 'Kuda', bankCode: '50211', accountNumber: '2001234567', accountName: 'FOLAKE ADEYEMI' } },
    ],
  },
};

const U = {}; // key -> user doc
const counts = {};
const bump = (k, n = 1) => (counts[k] = (counts[k] || 0) + n);

// ------------------------------------------------------------
// Cleanup
// ------------------------------------------------------------
async function removeOldTestData() {
  const users = await User.find({ email: new RegExp(`@${DOMAIN.replace('.', '\\.')}$`, 'i') }).select('_id');
  const ids = users.map((u) => u._id);
  const errands = await Errand.find({ $or: [{ customerId: { $in: ids } }, { providerId: { $in: ids } }] }).select('_id');
  const srs = await ServiceRequest.find({ customerId: { $in: ids } }).select('_id');
  const chats = await Chat.find({ 'participants.userId': { $in: ids } }).select('_id');
  const bookings = await Booking.find({ customerId: { $in: ids } }).select('_id');
  const errandIds = errands.map((e) => e._id);
  const srIds = srs.map((s) => s._id);

  await Promise.all([
    Payment.deleteMany({ $or: [{ customerId: { $in: ids } }, { providerId: { $in: ids } }, { errandId: { $in: errandIds } }, { serviceRequestId: { $in: srIds } }] }),
    Transaction.deleteMany({ userId: { $in: ids } }),
    Withdrawal.deleteMany({ userId: { $in: ids } }),
    Wallet.deleteMany({ userId: { $in: ids } }),
    Notification.deleteMany({ userId: { $in: ids } }),
    Message.deleteMany({ chatId: { $in: chats.map((c) => c._id) } }),
    Chat.deleteMany({ _id: { $in: chats.map((c) => c._id) } }),
    Quote.deleteMany({ $or: [{ serviceRequestId: { $in: srIds } }, { providerId: { $in: ids } }] }),
    Commission.deleteMany({ providerId: { $in: ids } }),
    Review.deleteMany({ $or: [{ reviewerId: { $in: ids } }, { revieweeId: { $in: ids } }, { bookingId: { $in: bookings.map((b) => b._id) } }] }),
    Booking.deleteMany({ _id: { $in: bookings.map((b) => b._id) } }),
    Verification.deleteMany({ userId: { $in: ids } }),
    Subscription.deleteMany({ userId: { $in: ids } }),
    Connection.deleteMany({ userId: { $in: ids } }),
    ConnectPost.deleteMany({ createdBy: { $in: ids } }),
    ErrandRunnerProfile.deleteMany({ userId: { $in: ids } }),
    ProviderProfile.deleteMany({ userId: { $in: ids } }),
    Errand.deleteMany({ _id: { $in: errandIds } }),
    ServiceRequest.deleteMany({ _id: { $in: srIds } }),
  ]);
  await User.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

// ------------------------------------------------------------
// Catalogue: settings, categories, services, plans
// ------------------------------------------------------------
async function seedCatalogue() {
  const { seeders } = require('../controllers/seed.controller');
  await seeders.seedSettings();
  await seeders.seedServiceCategories();
  await seeders.seedServices();

  // Settings for both countries (missing values fall back to the defaults
  // in services/pricingService.js).
  const settings = await Settings.getSettings();
  settings.set('pricing.distanceMethod', settings.pricing?.distanceMethod || 'road');
  settings.set('pricingNG.distanceMethod', settings.pricingNG?.distanceMethod || 'haversine');
  if (!settings.platform?.contactPhoneNG) settings.set('platform.contactPhoneNG', '+234 800 000 0000');
  if (!settings.platform?.contactEmailNG) settings.set('platform.contactEmailNG', 'support.ng@geobuy.com');
  await settings.save();

  // Every service offered in both countries, with rough Naira prices.
  const toNaira = (gbp) => (gbp ? Math.max(500, Math.round((gbp * 800) / 500) * 500) : undefined);
  const services = await Service.find({});
  for (const s of services) {
    if (!s.countries || s.countries.length === 0) s.countries = ['GB', 'NG'];
    if (!s.pricesNG || s.pricesNG.basePrice == null) {
      s.pricesNG = {
        basePrice: toNaira(s.basePrice),
        pricePerKm: s.pricePerKm ? Math.max(50, Math.round(s.pricePerKm * 250)) : undefined,
        minPrice: toNaira(s.minPrice),
        maxPrice: toNaira(s.maxPrice),
      };
    }
    await s.save();
  }

  // Subscription plans priced for both countries
  const plans = [
    { name: 'Monthly', description: 'Save on every errand', interval: 'month', price: 4.99, priceNGN: 2500, displayOrder: 1, isPopular: false, discount: 20 },
    { name: 'Yearly', description: 'Best value', interval: 'year', price: 49.99, priceNGN: 25000, displayOrder: 2, isPopular: true, discount: 20 },
  ];
  const planDocs = {};
  for (const p of plans) {
    let plan = await SubscriptionPlan.findOne({ name: p.name, interval: p.interval });
    if (!plan) plan = new SubscriptionPlan({ name: p.name, interval: p.interval });
    plan.description = plan.description || p.description;
    if (plan.price == null) plan.price = p.price;
    if (plan.priceNGN == null) plan.priceNGN = p.priceNGN;
    if (!plan.countries || plan.countries.length === 0) plan.countries = ['GB', 'NG'];
    plan.isActive = true;
    plan.isPopular = plan.isPopular ?? p.isPopular;
    plan.displayOrder = plan.displayOrder ?? p.displayOrder;
    plan.features = { unlimited_errands: true, priority_support: true, discount: p.discount, ...(plan.features?.toObject?.() || {}) };
    await plan.save();
    planDocs[p.interval] = plan;
  }

  return {
    services: services.length,
    categories: await ServiceCategory.countDocuments(),
    plans: planDocs,
    cleaningService: services.find((s) => /clean/i.test(s.category)) || services[0],
  };
}

// ------------------------------------------------------------
// Users, profiles, wallets, verification
// ------------------------------------------------------------
async function seedPeople() {
  // Admin
  let admin = await User.findOne({ email: email('admin') });
  if (!admin) {
    admin = await User.create({ ...COMMON, fullName: 'Geobuy Test Admin', email: email('admin'), phoneNumber: '07700 900000', password: ADMIN_PASSWORD, role: 'admin', country: 'GB' });
  }
  U.admin = admin;

  for (const country of ['GB', 'NG']) {
    const places = PLACES[country];
    const { customers, runners, providers } = PEOPLE[country];

    for (const c of customers) {
      const p = places[c.place];
      U[c.key] = await User.create({
        ...COMMON,
        fullName: c.fullName,
        email: c.email,
        phoneNumber: c.phoneNumber,
        password: PASSWORD,
        role: 'customer',
        country,
        address: addr(p),
        location: geoPoint(p),
        savedLocations: [{ name: 'Home', address: p.address, coordinates: { lat: p.lat, lng: p.lng }, isDefault: true }],
      });
      bump('customers');
    }

    for (const r of runners) {
      const p = places[r.place];
      const approved = r.status === 'approved';
      const docs =
        country === 'NG'
          ? { ninSlip: SAMPLE_DOC, utilityBill: SAMPLE_DOC, passport: SAMPLE_DOC }
          : { passport: SAMPLE_DOC, proofOfAddress: SAMPLE_DOC, rightToWork: SAMPLE_DOC, ...(r.vehicleType === 'car' ? { drivingLicence: SAMPLE_DOC } : {}) };
      U[r.key] = await User.create({
        ...COMMON,
        fullName: r.fullName,
        email: r.email,
        phoneNumber: r.phoneNumber,
        password: PASSWORD,
        role: 'errand_runner',
        country,
        dateOfBirth: new Date('1992-04-12'),
        address: addr(p),
        location: geoPoint(p),
        travelType: r.travelType,
        isAvailable: approved,
        verificationStatus: r.status,
        verificationRequestedAt: daysAgo(approved ? 40 : 1),
        documents: docs,
        ...(country === 'NG' ? { nin: '12345678901' } : {}),
        bankDetails: r.bank,
        verificationBadges: approved ? ['id_checked'] : [],
        averageRating: approved ? 4.8 : 0,
        totalReviews: approved ? 12 : 0,
      });
      await ErrandRunnerProfile.create({
        userId: U[r.key]._id,
        dateOfBirth: new Date('1992-04-12'),
        phoneNumber: r.phoneNumber,
        address: addr(p),
        vehicleType: r.vehicleType,
        maxDistancePreference: country === 'NG' ? 15 : 10,
        preferredAreas: [p.town, p.state].filter(Boolean),
        availableDays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false },
        availableHours: { start: '08:00', end: '20:00' },
        documents: docs,
        verificationStatus: r.status,
        verificationSubmittedAt: daysAgo(approved ? 40 : 1),
        ...(approved ? { verificationReviewedAt: daysAgo(38) } : {}),
        bankDetails: r.bank,
        about: `${r.vehicleType} runner based in ${p.town}.`,
        languages: country === 'NG' ? ['English', 'Yoruba', 'Pidgin'] : ['English'],
        location: { ...geoPoint(p), lastUpdated: new Date() },
        isActive: true,
        isAvailable: approved,
      });
      await Wallet.create({ userId: U[r.key]._id, currency: getCountry(country).currency });
      bump('errandRunners');
    }

    for (const pr of providers) {
      const p = places[pr.place];
      const approved = pr.status === 'approved';
      const docs =
        country === 'NG'
          ? { ninSlip: SAMPLE_DOC, utilityBill: SAMPLE_DOC, ...(pr.care ? { certification: SAMPLE_DOC } : {}) }
          : { passport: SAMPLE_DOC, proofOfAddress: SAMPLE_DOC, rightToWork: SAMPLE_DOC, insurance: SAMPLE_DOC, ...(pr.care ? { certification: SAMPLE_DOC } : {}) };
      U[pr.key] = await User.create({
        ...COMMON,
        fullName: pr.fullName,
        email: pr.email,
        phoneNumber: pr.phoneNumber,
        password: PASSWORD,
        role: 'provider',
        country,
        dateOfBirth: new Date('1985-09-20'),
        address: addr(p),
        location: geoPoint(p),
        serviceCategories: pr.categories,
        serviceArea: { radius: country === 'NG' ? 25 : 15, postcodes: p.postcode ? [p.postcode.split(' ')[0]] : [] },
        isAvailable: approved,
        verificationStatus: pr.status,
        verificationRequestedAt: daysAgo(approved ? 60 : 2),
        documents: docs,
        ...(country === 'NG' ? { nin: '10987654321' } : {}),
        renderCareServices: Boolean(pr.care),
        ...(pr.care && country === 'GB' ? { dbsStatus: approved ? 'clear' : 'pending', dbsNumber: '001234567890', dbsExpiry: daysAhead(700) } : {}),
        insuranceStatus: approved ? 'active' : 'not_insured',
        verificationBadges: approved ? ['id_checked', ...(pr.care && country === 'GB' ? ['dbs_checked'] : []), 'insured'] : [],
        serviceRates: { rateType: 'hourly', hourlyRate: pr.rate },
        serviceTerms: { cancellationPolicy: '24 hours notice for a full refund', noticePeriod: 24 },
        about: pr.about,
        bankDetails: pr.bank,
        averageRating: approved ? 4.7 : 0,
        totalReviews: approved ? 9 : 0,
      });
      await ProviderProfile.create({
        userId: U[pr.key]._id,
        serviceCategories: pr.categories,
        serviceAreas: [p.town, p.state].filter(Boolean),
        maxDistance: country === 'NG' ? 25 : 15,
        about: pr.about,
        languages: country === 'NG' ? ['English', 'Yoruba'] : ['English'],
        isVerified: approved,
        verificationSubmittedAt: daysAgo(approved ? 60 : 2),
      });
      await Wallet.create({ userId: U[pr.key]._id, currency: getCountry(country).currency });
      bump('providers');
    }

    // Verification documents (approved for approved users, pending for the rest)
    const docTypes = country === 'NG' ? ['nin', 'utility_bill', 'identity'] : ['identity', 'address', 'right_to_work'];
    for (const person of [...runners, ...providers]) {
      const approved = person.status === 'approved';
      const types = [...docTypes, ...(person.care ? [country === 'GB' ? 'dbs' : 'certification'] : [])];
      for (const type of types) {
        await Verification.create({
          userId: U[person.key]._id,
          type,
          documentUrl: SAMPLE_DOC,
          documentNumber: type === 'nin' ? '12345678901' : undefined,
          status: approved ? 'approved' : 'pending',
          submittedAt: daysAgo(approved ? 40 : 1),
          ...(approved ? { reviewedAt: daysAgo(38), reviewedBy: U.admin._id } : {}),
        });
        bump('verificationDocuments');
      }
    }
  }
}

// ------------------------------------------------------------
// Money helpers
// ------------------------------------------------------------
async function priceErrand(country, from, to, customerId) {
  const c = getCountry(country);
  const { method, multiplier } = await geoService.distanceConfig(country);
  // UK uses road routing in the app; to keep seeding offline we use the
  // same fallback the app uses when routing is unavailable.
  const route =
    method === 'haversine'
      ? geoService.haversineRoute(from, to, country, multiplier)
      : { ...geoService.haversineRoute(from, to, country, c.roadFactor), source: 'estimate' };
  const price = await pricingService.calculateErrandPrice({ country, distanceKm: route.distanceKm, userId: customerId });
  return { route, price };
}

async function workerEarns(worker, amount, currency, description, metadata, when) {
  await Wallet.updateOne({ userId: worker._id }, { $inc: { balance: amount, totalEarned: amount } });
  await Transaction.create({ userId: worker._id, type: 'payout', amount, currency, status: 'completed', description, reference: ref('REL'), completedAt: when, metadata });
}

// ------------------------------------------------------------
// Errands — one in every stage, per country
// ------------------------------------------------------------
async function seedErrands(country) {
  const c = getCountry(country);
  const P = PLACES[country];
  const gb = country === 'GB';
  const cust = gb ? U.ukCustomer : U.ngCustomer;
  const cust2 = gb ? U.ukCustomer2 : U.ngCustomer2;
  const runner = gb ? U.ukRunner : U.ngRunner;
  const runner2 = gb ? U.ukRunnerBike : U.ngRunnerKeke;
  const gateway = gb ? 'stripe' : 'paystack';
  const out = {};

  const routes = gb
    ? [['oxfordSt', 'waterloo'], ['camden', 'shoreditch'], ['brixton', 'waterloo'], ['shoreditch', 'oxfordSt'], ['manchester', 'salford']]
    : [['lekki', 'ikeja'], ['yaba', 'vi'], ['surulere', 'lekki'], ['ikeja', 'yaba'], ['wuse', 'garki']];

  const tasks = gb
    ? ['Collect a parcel from the post office and deliver it', 'Pick up dry cleaning (2 suits)', 'Weekly grocery shop from the list in the app', 'Collect prescription from Boots', 'Drop keys with the letting agent']
    : ['Buy foodstuff at the market (list in chat)', 'Deliver documents to the bank', 'Pick up a parcel from GIG Logistics', 'Collect medication from the pharmacy', 'Drop off a laptop for repair'];

  const make = async (label, { route, task, customer = cust, runnerUser, status, paid, released, refunded, when = 0, extra = {} }) => {
    const [a, b] = route;
    const { route: r, price } = await priceErrand(country, P[a], P[b], customer._id);
    const created = daysAgo(when);
    const errand = new Errand({
      customerId: customer._id,
      country,
      currency: c.currency,
      distanceUnit: c.distanceUnit,
      serviceType: 'errand',
      pickup: errandStop(P[a], customer.fullName, customer.phoneNumber),
      dropoff: errandStop(P[b], customer.fullName, customer.phoneNumber),
      taskDetails: task,
      preferredDate: when > 0 ? daysAgo(when) : daysAhead(1),
      preferredTime: '10:00',
      status,
      distance: price.distance,
      distanceKm: price.distanceKm,
      distanceSource: r.source,
      distanceText: `${price.distance} ${c.distanceUnit}`,
      duration: Math.round(r.durationMin),
      durationText: `${Math.round(r.durationMin)} min`,
      baseFee: price.baseFee,
      distanceRate: price.distanceRate,
      distanceFee: price.distanceFee,
      subtotal: price.subtotal,
      isSubscribed: price.isSubscribed,
      discountPercentage: price.discountPercentage,
      discountAmount: price.discountAmount,
      total: price.total,
      estimatedPrice: { baseFee: price.baseFee, distanceFee: price.distanceFee, total: price.total },
      platformFee: price.platformFee,
      providerAmount: price.providerAmount,
      paymentStatus: refunded ? 'refunded' : released ? 'released' : paid ? 'paid' : 'pending',
      ...(runnerUser ? { providerId: runnerUser._id, acceptedAt: daysAgo(when, -1) } : {}),
      ...(paid ? { paidAt: created } : {}),
      ...extra,
    });
    errand.createdAt = created;
    await errand.save();

    if (paid || refunded) {
      const payment = await Payment.create({
        type: 'errand',
        errandId: errand._id,
        customerId: customer._id,
        providerId: runnerUser?._id,
        amount: price.total,
        platformFee: price.platformFee,
        providerAmount: price.providerAmount,
        currency: c.currency,
        country,
        gateway,
        reference: ref(gb ? 'cs' : 'ERR'),
        status: refunded ? 'refunded' : 'succeeded',
        isEscrow: true,
        paymentDate: created,
        disbursementStatus: refunded ? 'not_applicable' : released ? 'completed' : 'pending',
        ...(released ? { disbursementDate: daysAgo(when, -6), releasedAt: daysAgo(when, -6), disbursementReference: ref('REL') } : {}),
        ...(refunded ? { refundedAt: daysAgo(when, -2), refundAmount: price.total, refundReason: 'Customer cancelled before pickup' } : {}),
      });
      errand.paymentId = payment._id;
      await errand.save();
      await Transaction.create({ userId: customer._id, type: 'payment', amount: -price.total, currency: c.currency, status: 'completed', description: `Payment for errand #${errand.errandId}`, reference: payment.reference, completedAt: created, metadata: { paymentId: payment._id, errandId: errand._id } });
      if (refunded) {
        await Transaction.create({ userId: customer._id, type: 'refund', amount: price.total, currency: c.currency, status: 'completed', description: `Refund for errand #${errand.errandId}`, reference: ref('RFD'), completedAt: daysAgo(when, -2) });
      }
      if (released && runnerUser) {
        await workerEarns(runnerUser, price.providerAmount, c.currency, `Earnings for errand #${errand.errandId}`, { errandId: errand._id, paymentId: payment._id }, daysAgo(when, -6));
      }
      bump('payments');
    }
    out[label] = errand;
    bump(`errands.${status}`);
    return errand;
  };

  // Completed & paid out — history for the main runner (4) and the second runner (1)
  for (let i = 0; i < 4; i++) {
    await make(`completed${i}`, { route: routes[i % 4], task: tasks[i], runnerUser: runner, status: 'completed', paid: true, released: true, when: 20 - i * 4, extra: { completedAt: daysAgo(20 - i * 4, -6), completedBy: 'customer', deliveredAt: daysAgo(20 - i * 4, -5), collectedAt: daysAgo(20 - i * 4, -3), enRouteAt: daysAgo(20 - i * 4, -2) } });
  }
  await make('completedRunner2', { route: routes[1], task: tasks[1], customer: cust2, runnerUser: runner2, status: 'completed', paid: true, released: true, when: 9, extra: { completedAt: daysAgo(9, -6), completedBy: 'system' } });

  // Live pipeline
  await make('unpaid', { route: routes[0], task: tasks[0], status: 'pending', paid: false });
  await make('paidOpen', { route: routes[1], task: tasks[1], status: 'pending', paid: true });
  await make('paidOpen2', { route: routes[4], task: tasks[4], customer: cust2, status: 'pending', paid: true });
  await make('accepted', { route: routes[2], task: tasks[2], runnerUser: runner, status: 'accepted', paid: true });
  await make('enRoute', { route: routes[3], task: tasks[3], runnerUser: runner2, status: 'en_route', paid: true, extra: { enRouteAt: daysAgo(0, 1) } });
  await make('collected', { route: routes[0], task: tasks[3], runnerUser: runner, status: 'collected', paid: true, extra: { enRouteAt: daysAgo(0, 2), collectedAt: daysAgo(0, 1) } });
  await make('delivered', { route: routes[1], task: tasks[2], runnerUser: runner, status: 'delivered', paid: true, when: 1, extra: { enRouteAt: daysAgo(1, -1), collectedAt: daysAgo(1, -2), deliveredAt: daysAgo(1, -3) } });
  await make('cancelledRefunded', { route: routes[2], task: tasks[0], status: 'cancelled', refunded: true, when: 5, extra: { cancelledAt: daysAgo(5, -2), cancellationReason: 'Customer cancelled before pickup', cancelledBy: 'customer' } });

  return out;
}

// ------------------------------------------------------------
// Provider bookings — one in every stage, per country
// ------------------------------------------------------------
async function seedServiceBookings(country) {
  const c = getCountry(country);
  const P = PLACES[country];
  const gb = country === 'GB';
  const cust = gb ? U.ukCustomer : U.ngCustomer;
  const cust2 = gb ? U.ukCustomer2 : U.ngCustomer2;
  const prov = gb ? U.ukProvider : U.ngProvider;
  const prov2 = gb ? U.ukCarer : U.ngProviderAbuja;
  const gateway = gb ? 'stripe' : 'paystack';
  const pricing = await pricingService.getPricing(country);
  const price = gb ? { clean: 120, deep: 180, care: 90 } : { clean: 25000, deep: 40000, care: 18000 };
  const out = {};

  const make = async (label, { customer = cust, place = gb ? 'oxfordSt' : 'lekki', category = 'cleaning', serviceType, description, status, quotes = [], selected, paid, released, refunded, legacy, when = 0, extra = {} }) => {
    const p = P[place];
    const sr = new ServiceRequest({
      customerId: customer._id,
      country,
      currency: c.currency,
      category,
      serviceType,
      description,
      location: { address: p.address, street: p.street, area: p.area, lga: p.lga, town: p.town, state: p.state, postcode: p.postcode, coordinates: { lat: p.lat, lng: p.lng } },
      preferredDate: when > 0 ? daysAgo(when) : daysAhead(3),
      preferredTime: '09:00',
      budget: Math.round(price.deep * 1.1),
      serviceFee: pricing.connectionFee,
      platformFeePercentage: pricing.providerCommissionPercentage,
      status,
      isPublic: true,
      expiresAt: daysAhead(7),
      invitedProviders: quotes.map((q) => ({ providerId: q.provider._id, invitedAt: daysAgo(when, 2), status: 'quoted' })),
      ...extra,
    });
    sr.createdAt = daysAgo(when, 3);
    await sr.save();

    const quoteDocs = [];
    for (const q of quotes) {
      quoteDocs.push(
        await Quote.create({
          serviceRequestId: sr._id,
          providerId: q.provider._id,
          amount: q.amount,
          message: q.message || 'Happy to help — all supplies included.',
          estimatedDuration: q.duration || 3, // hours
          status: selected && q.provider === selected ? 'accepted' : selected ? 'rejected' : 'pending',
          isSelected: Boolean(selected && q.provider === selected),
          ...(selected && q.provider === selected ? { selectedAt: daysAgo(when, 1) } : {}),
          expiresAt: daysAhead(5),
        })
      );
      bump('quotes');
    }

    if (selected) {
      const q = quotes.find((x) => x.provider === selected);
      const chosen = quoteDocs[quotes.indexOf(q)];
      sr.selectedProviderId = selected._id;
      sr.selectedQuoteId = chosen._id;
      sr.finalPrice = q.amount;
      if (!legacy) {
        const split = await pricingService.splitServiceAmount(q.amount, country);
        sr.platformFee = split.platformFee;
        sr.providerAmount = split.providerAmount;
        sr.platformFeePercentage = split.platformFeePercentage;
        sr.paymentStatus = refunded ? 'refunded' : released ? 'released' : paid ? 'paid' : 'pending';
      }
      await sr.save();

      if (!legacy && (paid || refunded)) {
        const payment = await Payment.create({
          type: 'service',
          serviceRequestId: sr._id,
          customerId: customer._id,
          providerId: selected._id,
          amount: q.amount,
          platformFee: sr.platformFee,
          providerAmount: sr.providerAmount,
          currency: c.currency,
          country,
          gateway,
          reference: ref(gb ? 'cs' : 'SRV'),
          status: refunded ? 'refunded' : 'succeeded',
          isEscrow: true,
          paymentDate: daysAgo(when, 1),
          disbursementStatus: refunded ? 'not_applicable' : released ? 'completed' : 'pending',
          ...(released ? { disbursementDate: daysAgo(when, -8), releasedAt: daysAgo(when, -8), disbursementReference: ref('REL') } : {}),
          ...(refunded ? { refundedAt: daysAgo(when), refundAmount: q.amount, refundReason: 'Booking cancelled by customer' } : {}),
          metadata: { requestCode: sr.requestId, serviceType: sr.serviceType },
        });
        sr.paymentId = payment._id;
        sr.paidAt = daysAgo(when, 1);
        await sr.save();
        await Transaction.create({ userId: customer._id, type: 'payment', amount: -q.amount, currency: c.currency, status: 'completed', description: `Payment for ${sr.serviceType} #${sr.requestId}`, reference: payment.reference, completedAt: daysAgo(when, 1), metadata: { paymentId: payment._id, serviceRequestId: sr._id } });
        if (refunded) {
          await Transaction.create({ userId: customer._id, type: 'refund', amount: q.amount, currency: c.currency, status: 'completed', description: `Refund for ${sr.serviceType}`, reference: ref('RFD'), completedAt: daysAgo(when) });
        }
        if (released) {
          await workerEarns(selected, sr.providerAmount, c.currency, `Earnings for ${sr.serviceType} #${sr.requestId}`, { serviceRequestId: sr._id, paymentId: payment._id }, daysAgo(when, -8));
        }
        bump('payments');
      }

      if (legacy && status === 'completed') {
        const rate = pricing.providerCommissionPercentage;
        await Commission.create({
          providerId: selected._id,
          serviceRequestId: sr._id,
          amount: q.amount,
          currency: c.currency,
          commissionRate: rate,
          commissionAmount: round2((q.amount * rate) / 100),
          status: 'pending',
          dueDate: daysAhead(10),
        });
        bump('commissions');
      }
    }
    out[label] = sr;
    bump(`serviceRequests.${status}`);
    return sr;
  };

  const cleanQuotes = (a, b) => [
    { provider: prov, amount: a, message: 'Two cleaners, about 3 hours, supplies included.' },
    { provider: prov2, amount: b, message: 'Available this week.' },
  ];

  // History: completed & paid out to the main provider (2)
  await make('completed1', { serviceType: 'Deep cleaning', description: 'End-of-tenancy deep clean, 2-bed flat', status: 'completed', quotes: [{ provider: prov, amount: price.deep }], selected: prov, paid: true, released: true, when: 18, extra: { completedAt: daysAgo(18, -8), completedBy: 'customer', providerCompletedAt: daysAgo(18, -6), releasedAt: daysAgo(18, -8) } });
  await make('completed2', { customer: cust2, place: gb ? 'manchester' : 'wuse', serviceType: 'Home cleaning', description: 'Weekly home clean', status: 'completed', quotes: [{ provider: prov, amount: price.clean }], selected: prov, paid: true, released: true, when: 11, extra: { completedAt: daysAgo(11, -8), completedBy: 'system', providerCompletedAt: daysAgo(13), releasedAt: daysAgo(11, -8) } });

  // Live pipeline
  await make('inviting', { serviceType: 'Home cleaning', description: 'Regular fortnightly clean, 3-bed house', status: 'pending', extra: { invitedProviders: [{ providerId: prov._id, invitedAt: new Date(), status: 'invited' }, { providerId: prov2._id, invitedAt: new Date(), status: 'invited' }] } });
  await make('quotesIn', { serviceType: 'Deep cleaning', description: 'Kitchen and bathroom deep clean before guests arrive', status: 'quotes_received', quotes: cleanQuotes(price.clean, Math.round(price.clean * 1.15)) });
  await make('awaitingPayment', { serviceType: 'Home cleaning', description: 'Post-party clean-up, living room and kitchen', status: 'provider_selected', quotes: cleanQuotes(price.clean, Math.round(price.clean * 1.2)), selected: prov });
  await make('paid', { customer: cust2, place: gb ? 'manchester' : 'wuse', serviceType: 'Home cleaning', description: 'Move-in clean, empty flat', status: 'provider_selected', quotes: [{ provider: prov, amount: price.clean }], selected: prov, paid: true });
  await make('inProgress', { serviceType: 'Deep cleaning', description: 'Carpet and upholstery clean', status: 'in_progress', quotes: [{ provider: prov, amount: price.deep }], selected: prov, paid: true });
  await make('awaitingConfirmation', { serviceType: 'Home cleaning', description: 'Spring clean, all rooms', status: 'awaiting_confirmation', quotes: [{ provider: prov, amount: price.clean }], selected: prov, paid: true, when: 1, extra: { providerCompletedAt: daysAgo(0, 5) } });
  await make('legacyDirect', { serviceType: 'Home cleaning', description: 'Older booking paid to the provider in cash', status: 'completed', quotes: [{ provider: prov, amount: price.clean }], selected: prov, legacy: true, when: 25, extra: { completedAt: daysAgo(25), completedBy: 'customer' } });
  await make('cancelledRefunded', { serviceType: 'Deep cleaning', description: 'Oven clean — cancelled', status: 'cancelled', quotes: [{ provider: prov, amount: price.clean }], selected: prov, refunded: true, when: 4, extra: { cancelledAt: daysAgo(4), cancellationReason: 'Plans changed' } });

  // Care / second provider
  await make('care', {
    category: gb ? 'healthcare' : 'cleaning',
    serviceType: gb ? 'Caregiving Services' : 'Office cleaning',
    description: gb ? 'Companionship visits for my mum, 3 hours twice a week' : 'Office clean, Garki, 2 floors',
    place: gb ? 'camden' : 'garki',
    customer: gb ? cust : cust2,
    status: 'quotes_received',
    quotes: [{ provider: prov2, amount: price.care, message: gb ? 'DBS-checked carer available Tue & Thu.' : 'Team of 3, weekend available.' }],
    extra: { requiresDBS: gb },
  });

  return out;
}

// ------------------------------------------------------------
// Withdrawals: one completed + one pending per earning worker
// ------------------------------------------------------------
async function seedWithdrawals(country) {
  const c = getCountry(country);
  const gb = country === 'GB';
  const workers = gb ? [U.ukRunner, U.ukProvider] : [U.ngRunner, U.ngProvider];
  const pricing = await pricingService.getPricing(country);

  for (const w of workers) {
    const wallet = await Wallet.findOne({ userId: w._id });
    const earned = wallet.totalEarned;
    // keep at least the minimum withdrawal available so you can test a new request
    const done = round2(Math.max(0, Math.floor(earned * 0.35)));
    const pending = round2(Math.max(0, Math.floor(earned * 0.15)));
    if (earned - done - pending < pricing.minWithdrawal) continue;

    const bank = { bankName: w.bankDetails.bankName, sortCode: w.bankDetails.sortCode, accountNumber: w.bankDetails.accountNumber, bankCode: w.bankDetails.bankCode, accountName: w.bankDetails.accountName };
    if (done > 0) {
      const r = ref('WD');
      await Withdrawal.create({ userId: w._id, amount: done, currency: c.currency, country, gateway: gb ? 'manual' : 'paystack', status: 'completed', bankDetails: bank, reference: r, processedBy: U.admin._id, processedAt: daysAgo(6), ...(gb ? {} : { transferCode: 'TRF_seed_' + r.slice(-5) }) });
      await Transaction.create({ userId: w._id, type: 'payout', amount: -done, currency: c.currency, status: 'completed', description: gb ? 'Withdrawal to bank account' : 'Withdrawal via Paystack transfer', reference: r, completedAt: daysAgo(6) });
      await Wallet.updateOne({ userId: w._id }, { $inc: { balance: -done, totalWithdrawn: done }, $set: { lastPayoutDate: daysAgo(6) } });
      bump('withdrawals.completed');
    }
    if (pending > 0) {
      await Withdrawal.create({ userId: w._id, amount: pending, currency: c.currency, country, gateway: gb ? 'manual' : 'paystack', status: 'pending', bankDetails: bank, reference: ref('WD') });
      await Wallet.updateOne({ userId: w._id }, { $inc: { balance: -pending, pendingBalance: pending } });
      bump('withdrawals.pending');
    }
  }
}

// ------------------------------------------------------------
// Social: notifications, chats, reviews, subscriptions, Connect
// ------------------------------------------------------------
async function seedSocial(country, errands, bookings, catalogue) {
  const c = getCountry(country);
  const gb = country === 'GB';
  const cust = gb ? U.ukCustomer : U.ngCustomer;
  const runner = gb ? U.ukRunner : U.ngRunner;
  const prov = gb ? U.ukProvider : U.ngProvider;
  const money = (n) => `${c.currencySymbol || (gb ? '£' : '₦')}${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Notifications
  const notes = [
    [cust, 'payment_received', 'Payment received', `Your payment for errand #${errands.paidOpen.errandId} is held securely until you confirm delivery.`, { errandId: errands.paidOpen._id }],
    [cust, 'errand_delivered', 'Errand delivered', `Your errand #${errands.delivered.errandId} has been delivered. Please confirm.`, { errandId: errands.delivered._id }],
    [cust, 'quote_received', 'New quote', `You have new quotes for ${bookings.quotesIn.serviceType}.`, { serviceRequestId: bookings.quotesIn._id }],
    [cust, 'service_payment_required', 'Provider booked — payment needed', `Pay to confirm ${bookings.awaitingPayment.serviceType}.`, { serviceRequestId: bookings.awaitingPayment._id }],
    [cust, 'service_marked_done', 'Job marked as done', `Please confirm ${bookings.awaitingConfirmation.serviceType} is done.`, { serviceRequestId: bookings.awaitingConfirmation._id }],
    [runner, 'errand_accepted', 'Errand accepted', `You accepted errand #${errands.accepted.errandId}.`, { errandId: errands.accepted._id }],
    [runner, 'payment_released', 'Funds released', `${money(errands.completed0.providerAmount)} has been added to your wallet.`, { errandId: errands.completed0._id }],
    [prov, 'service_paid', 'Customer has paid', `The customer has paid for ${bookings.paid.serviceType}. You can start the job.`, { serviceRequestId: bookings.paid._id }],
    [prov, 'payment_released', 'Funds released', `${money(bookings.completed1.providerAmount)} has been added to your wallet.`, { serviceRequestId: bookings.completed1._id }],
    [prov, 'commission_generated', 'Commission invoice', `Commission is due for ${bookings.legacyDirect.serviceType} #${bookings.legacyDirect.requestId}.`, { serviceRequestId: bookings.legacyDirect._id }],
    [U.admin, 'withdrawal_requested', 'Withdrawal request', `${runner.fullName} requested a withdrawal.`, { userId: runner._id }],
  ];
  for (const [u, type, title, message, data] of notes) {
    await Notification.create({ userId: u._id, type, title, message, data, isRead: false });
    bump('notifications');
  }

  // Chat between customer and runner on the accepted errand
  const chat = await Chat.create({ participants: [{ userId: cust._id }, { userId: runner._id }], errandId: errands.accepted._id, isActive: true });
  const lines = gb
    ? [[cust, runner, 'Hi Oliver, the list is in the errand notes.'], [runner, cust, "Got it — I'll be at the shop in 15 minutes."], [cust, runner, 'Perfect, thank you!']]
    : [[cust, runner, 'Good afternoon Tunde, please call when you get to the gate.'], [runner, cust, 'No wahala ma, I dey come. 20 minutes.'], [cust, runner, 'Thank you!']];
  for (const [from, to, content] of lines) {
    await Message.create({ chatId: chat._id, errandId: errands.accepted._id, senderId: from._id, receiverId: to._id, content, messageType: 'text', deliveredAt: new Date() });
    bump('messages');
  }
  chat.lastMessage = { content: lines[lines.length - 1][2], senderId: lines[lines.length - 1][0]._id, sentAt: new Date() };
  await chat.save();

  // Open support ticket
  const support = await Chat.create({ participants: [{ userId: cust._id }, { userId: U.admin._id }], isSupportChat: true, supportStatus: 'open', priority: 'medium', category: 'payment', isActive: true });
  await Message.create({ chatId: support._id, senderId: cust._id, receiverId: U.admin._id, content: gb ? 'My refund for the cancelled errand has not arrived yet.' : 'I was debited twice on Paystack, please check.', messageType: 'text' });
  support.lastMessage = { content: 'Support request', senderId: cust._id, sentAt: new Date() };
  await support.save();
  bump('chats', 2);

  // Review (reviews hang off the Booking model)
  if (catalogue.cleaningService) {
    const booking = new Booking({
      customerId: cust._id,
      providerId: prov._id,
      serviceId: catalogue.cleaningService._id,
      serviceType: catalogue.cleaningService.name,
      date: daysAgo(18),
      time: '09:00',
      estimatedPrice: bookings.completed1.finalPrice,
      finalPrice: bookings.completed1.finalPrice,
      status: 'completed',
      paymentStatus: 'paid',
      completedAt: daysAgo(18),
    });
    await booking.save();
    await Review.create({ bookingId: booking._id, reviewerId: cust._id, revieweeId: prov._id, rating: 5, comment: gb ? 'Spotless flat, on time and friendly.' : 'Very thorough. The house was sparkling!', isPublic: true });
    bump('reviews');
  }

  // Subscription for the main customer
  const plan = catalogue.plans.month;
  const sub = await Subscription.create({
    userId: cust._id,
    gateway: gb ? 'stripe' : 'paystack',
    country,
    currency: c.currency,
    amount: gb ? plan.price : plan.priceNGN,
    plan: plan._id,
    status: 'active',
    currentPeriodStart: daysAgo(10),
    currentPeriodEnd: daysAhead(20),
    ...(gb ? { stripeCustomerId: 'cus_seed_emma', stripeSubscriptionId: 'sub_seed_emma' } : { paystackCustomerCode: 'CUS_seed_chiamaka', paystackSubscriptionCode: 'SUB_seed_chiamaka' }),
  });
  await User.updateOne(
    { _id: cust._id },
    {
      $set: {
        'subscription.isSubscribed': true,
        'subscription.gateway': gb ? 'stripe' : 'paystack',
        'subscription.subscriptionStatus': 'active',
        'subscription.subscriptionPlan': plan.name,
        'subscription.subscriptionId': String(sub._id),
        'subscription.subscribedAt': daysAgo(10),
        'subscription.subscriptionExpiresAt': daysAhead(20),
      },
    }
  );
  bump('subscriptions');

  // Connect: a meeting-venue post + connection requests
  const pricing = await pricingService.getPricing(country);
  const venue = gb
    ? { name: 'The British Library café', address: '96 Euston Road, London', postcode: 'NW1 2DB' }
    : { name: 'Terra Kulture', address: '1376 Tiamiyu Savage Street, Victoria Island, Lagos' };
  await ConnectPost.create({
    title: gb ? 'Monthly London meet-up for newcomers' : 'Lagos newcomers hangout',
    content: gb ? 'Meet other Geobuy members over coffee. First Saturday of every month.' : 'Network, make friends and find your way around Lagos. Every second Saturday.',
    type: 'meeting_venue',
    state: gb ? 'London' : 'Lagos',
    country,
    venue,
    date: daysAhead(10),
    time: '14:00',
    isActive: true,
    isFeatured: true,
    createdBy: U.admin._id,
    tags: ['community', 'newcomers'],
  });
  bump('connectPosts');

  const connectUsers = gb ? [U.ukCustomer, U.ukCustomer2] : [U.ngCustomer, U.ngCustomer2];
  for (const [i, u] of connectUsers.entries()) {
    const p = PLACES[country][gb ? (i ? 'manchester' : 'oxfordSt') : i ? 'wuse' : 'lekki'];
    const paidFee = i === 0;
    let feePayment;
    if (paidFee) {
      feePayment = await Payment.create({ type: 'connection_fee', customerId: u._id, amount: pricing.connectionFee, currency: c.currency, country, gateway: gb ? 'stripe' : 'paystack', reference: ref('CON'), status: 'succeeded', paymentDate: daysAgo(3), disbursementStatus: 'not_applicable' });
      await User.updateOne({ _id: u._id }, { $set: { hasPaidConnectionFee: true, connectionFeePaidAt: daysAgo(3), connectionFeePaymentId: feePayment._id } });
      bump('payments');
    }
    await Connection.create({
      userId: u._id,
      state: gb ? (i ? 'Manchester' : 'London') : i ? 'Federal Capital Territory' : 'Lagos',
      country,
      fullName: u.fullName,
      email: u.email,
      phoneNumber: u.phoneNumber,
      location: { ...geoPoint(p), address: p.address, town: p.town, postcode: p.postcode },
      purpose: i ? 'professional_networking' : 'friendship',
      interests: gb ? ['coffee', 'walking', 'tech'] : ['afrobeats', 'football', 'tech'],
      availability: { preferredDays: ['saturday', 'sunday'], preferredTimeSlot: 'afternoon' },
      message: gb ? 'New to the area and keen to meet people.' : 'Just relocated, would love to meet people.',
      status: paidFee ? 'active' : 'pending',
      fee: { amount: pricing.connectionFee, currency: c.currency, paid: paidFee, ...(paidFee ? { paymentId: feePayment._id, paidAt: daysAgo(3) } : {}) },
      userHasPaidConnectionFee: paidFee,
      meetingType: 'in_person',
      expiresAt: daysAhead(30),
      isActive: true,
    });
    bump('connections');
  }
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function seedTestData({ wipe = false, log = console.log } = {}) {
  if (wipe) {
    if (process.env.ALLOW_DB_RESET !== 'true') throw new Error('--wipe needs ALLOW_DB_RESET=true');
    log('Wiping the entire database…');
    await mongoose.connection.db.dropDatabase();
  }
  for (const k of Object.keys(counts)) delete counts[k];

  const removed = await removeOldTestData();
  if (removed) log(`Removed ${removed} previous test accounts and their data`);

  const catalogue = await seedCatalogue();
  await seedPeople();
  for (const country of ['GB', 'NG']) {
    const errands = await seedErrands(country);
    const bookings = await seedServiceBookings(country);
    await seedWithdrawals(country);
    await seedSocial(country, errands, bookings, catalogue);
  }

  const wallets = {};
  for (const key of ['ukRunner', 'ukRunnerBike', 'ukProvider', 'ngRunner', 'ngRunnerKeke', 'ngProvider']) {
    const w = await Wallet.findOne({ userId: U[key]._id }).lean();
    wallets[U[key].email] = { currency: w.currency, available: round2(w.balance), withdrawing: round2(w.pendingBalance), earned: round2(w.totalEarned), withdrawn: round2(w.totalWithdrawn) };
  }

  return {
    password: PASSWORD,
    adminLogin: { email: email('admin'), password: ADMIN_PASSWORD },
    accounts: Object.fromEntries(Object.entries(U).map(([k, u]) => [k, { email: u.email, role: u.role, country: u.country, verification: u.verificationStatus }])),
    wallets,
    counts: { ...counts, services: catalogue.services, categories: catalogue.categories },
  };
}

module.exports = { seedTestData };

if (require.main === module) {
  (async () => {
    if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
      console.error('Refusing to seed test data with NODE_ENV=production (use --force if you really mean it).');
      process.exit(1);
    }
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error('MONGODB_URI is not set');
      process.exit(1);
    }
    await mongoose.connect(uri);
    try {
      const summary = await seedTestData({ wipe: process.argv.includes('--wipe') });
      console.log('\n✅ Test data ready\n');
      console.log(`Password for every test account: ${summary.password}`);
      console.log(`Admin: ${summary.adminLogin.email} / ${summary.adminLogin.password}\n`);
      console.table(summary.accounts);
      console.log('Wallets:');
      console.table(summary.wallets);
      console.log('Created:', summary.counts);
    } catch (err) {
      console.error('❌ Seeding failed:', err);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}
