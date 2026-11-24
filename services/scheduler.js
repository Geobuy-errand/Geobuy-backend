// ============================================================
// Lightweight background jobs (no extra dependencies)
//  - Auto-complete errands left in "delivered" for N hours, so runners
//    are paid even if the customer forgets to confirm.
//  - Same for provider jobs left in "awaiting_confirmation".
// If you run more than one server instance, set RUN_SCHEDULER=false on all
// but one of them.
// ============================================================

const Errand = require('../models/Errand.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const Settings = require('../models/Setting.model');
const { releaseErrandFunds, releaseServiceFunds } = require('./escrowService');
const createNotification = require('../utils/create-notification');

const INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes

async function autoCompleteDeliveredErrands(app) {
  const settings = await Settings.getSettings();
  const hours = Number(settings.features?.autoCompleteHours ?? 48);
  if (!hours || hours <= 0) return;

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const errands = await Errand.find({ status: 'delivered', deliveredAt: { $lte: cutoff } }).limit(100);

  for (const errand of errands) {
    const claimed = await Errand.findOneAndUpdate(
      { _id: errand._id, status: 'delivered' },
      { $set: { status: 'completed', completedAt: new Date(), completedBy: 'system' } },
      { new: true }
    );
    if (!claimed) continue;
    try {
      await releaseErrandFunds(claimed, { io: app?.get('io'), releasedBy: 'auto-complete' });
      await createNotification(
        claimed.customerId,
        'errand_completed',
        'Errand completed',
        `Errand #${claimed.errandId} was completed automatically ${hours} hours after delivery.`,
        { errandId: claimed._id }
      );
    } catch (e) {
      console.error(`[scheduler] Auto-complete release failed for ${claimed.errandId}:`, e.message);
    }
  }
}

async function autoCompleteServiceJobs(app) {
  const settings = await Settings.getSettings();
  const hours = Number(settings.features?.autoCompleteHours ?? 48);
  if (!hours || hours <= 0) return;

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const jobs = await ServiceRequest.find({ status: 'awaiting_confirmation', providerCompletedAt: { $lte: cutoff } }).limit(100);

  for (const job of jobs) {
    const claimed = await ServiceRequest.findOneAndUpdate(
      { _id: job._id, status: 'awaiting_confirmation' },
      { $set: { status: 'completed', completedAt: new Date(), completedBy: 'system' } },
      { new: true }
    );
    if (!claimed) continue;
    try {
      if (['paid', 'released'].includes(claimed.paymentStatus)) {
        await releaseServiceFunds(claimed, { io: app?.get('io'), releasedBy: 'auto-complete' });
      }
      await createNotification(
        claimed.customerId,
        'request_completed',
        'Job completed',
        `${claimed.serviceType} was confirmed automatically ${hours} hours after the provider marked it done.`,
        { serviceRequestId: claimed._id }
      );
    } catch (e) {
      console.error(`[scheduler] Auto-complete release failed for service ${claimed.requestId}:`, e.message);
    }
  }
}

async function runAll(app) {
  await autoCompleteDeliveredErrands(app);
  await autoCompleteServiceJobs(app);
}

function startScheduledJobs(app) {
  if (process.env.RUN_SCHEDULER === 'false') return;
  const run = () => runAll(app).catch((e) => console.error('[scheduler]', e.message));
  setTimeout(run, 60 * 1000);
  setInterval(run, INTERVAL_MS).unref();
}

module.exports = { startScheduledJobs, autoCompleteDeliveredErrands, autoCompleteServiceJobs, runAll };
