// ============================================================
// AUTH TEMPLATES
// ============================================================

const sendEmail = require("../services/email.service");
const authTemplates = {
  // Customer registration welcome
  welcomeCustomer: (userName, email) => ({
    subject: "🎉 Welcome to GEOBUY Errands!",
    title: "Welcome to the Community! 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Thank you for joining GEOBUY Errands! We're excited to have you on board.</p>
        <div class="info-box">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Role:</strong> Customer</p>
          <p><strong>Status:</strong> <span class="badge">Active</span></p>
        </div>
        <p>You can now:</p>
        <ul>
          <li>🛒 Book errands and services</li>
          <li>🔗 Connect with people in your area</li>
          <li>💬 Chat with providers</li>
          <li>⭐ Rate and review services</li>
        </ul>
        <p>Ready to get started? Explore our services and find help today!</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/dashboard`,
      text: "Go to Dashboard",
    },
  }),

  // Provider registration welcome
  welcomeProvider: (userName, email) => ({
    subject: "🎉 Welcome to GEOBUY Errands - Provider",
    title: "Welcome to the Provider Community! 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Thank you for registering as a service provider on GEOBUY Errands!</p>
        <div class="info-box">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Role:</strong> Service Provider</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #f59e0b;">Pending Verification</span></p>
        </div>
        <p>What happens next:</p>
        <ul>
          <li>📋 Our team will review your application</li>
          <li>✅ You'll receive a verification email once approved</li>
          <li>💼 Start accepting jobs and earning money</li>
        </ul>
        <p>While you wait, complete your profile to get ready!</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/dashboard`,
      text: "Complete Profile",
    },
  }),

  // Errand Runner registration welcome
  welcomeErrandRunner: (userName, email) => ({
    subject: "🎉 Welcome to GEOBUY Errands - Errand Runner",
    title: "Welcome to the Runner Community! 🏃",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Thank you for registering as an errand runner on GEOBUY Errands!</p>
        <div class="info-box">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Role:</strong> Errand Runner</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #f59e0b;">Pending Verification</span></p>
        </div>
        <p>What happens next:</p>
        <ul>
          <li>📋 Our team will review your application</li>
          <li>✅ You'll receive a verification email once approved</li>
          <li>📦 Start accepting errands and earning money</li>
        </ul>
        <p>While you wait, complete your profile and set your availability!</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/runner/dashboard`,
      text: "Complete Profile",
    },
  }),

  // Password reset request
  passwordReset: (userName, resetLink) => ({
    subject: "🔐 Password Reset Request - GEOBUY Errands",
    title: "Reset Your Password 🔐",
    content: `
        <h2>Hi ${userName},</h2>
        <p>We received a request to reset your password for your GEOBUY Errands account.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p>To reset your password, click the button below. This link will expire in 1 hour.</p>
      `,
    button: {
      url: resetLink,
      text: "Reset Password",
    },
  }),

  // Password changed confirmation
  passwordChanged: (userName) => ({
    subject: "🔐 Password Changed - GEOBUY Errands",
    title: "Password Changed Successfully ✅",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your password has been changed successfully.</p>
        <p>If you didn't make this change, please contact our support team immediately.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/login`,
      text: "Login",
    },
  }),
};

const connectionTemplates = {
  // When user pays connection fee
  connectionFeePaid: (userName, amount, connectionId) => ({
    subject: "✅ Connection Fee Paid - Welcome to GEOBUY Connect!",
    title: "Welcome to GEOBUY Connect! 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Great news! Your one-time connection fee of <strong>£${amount}</strong> has been successfully paid.</p>
        <div class="info-box">
          <p><strong>Connection ID:</strong> ${connectionId}</p>
          <p><strong>Status:</strong> <span class="badge">Active</span></p>
        </div>
        <p>You now have full access to:</p>
        <ul>
          <li>Weekly Sunday group meetups in your area</li>
          <li>Individual meetups any day of the week</li>
          <li>Community posts and announcements</li>
          <li>Connect with like-minded people</li>
        </ul>
        <p>Your next connection could be closer than you think! 🌟</p>
        <p>Check your dashboard for upcoming meetup spots and activities.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/connect-dashboard`,
      text: "Go to Connect Dashboard",
    },
  }),

  // When user creates a connection profile
  connectionCreated: (userName, connectionId, state) => ({
    subject: "🔗 Your GEOBUY Connect Profile is Ready!",
    title: "Your Connect Profile is Live 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your GEOBUY Connect profile has been created successfully!</p>
        <div class="info-box">
          <p><strong>Connection ID:</strong> ${connectionId}</p>
          <p><strong>Your State:</strong> ${state}</p>
          <p><strong>Status:</strong> <span class="badge">Active</span></p>
        </div>
        <p>Here's what happens next:</p>
        <ul>
          <li>📅 <strong>Sunday Group Dates:</strong> Every Sunday, we'll share a meetup spot near you</li>
          <li>📍 <strong>Local Connections:</strong> Meet people in your area</li>
          <li>📢 <strong>Community Updates:</strong> Stay informed about activities and events</li>
        </ul>
        <p>Ready to start connecting? Check your dashboard for the latest meetup spots!</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/connect-dashboard`,
      text: "View Connect Dashboard",
    },
  }),

  // When new post is created in user's state
  newPostInState: (userName, postTitle, postType, state) => ({
    subject: `📢 New ${postType} in ${state} - ${postTitle}`,
    title: `New ${postType} in Your Area 📢`,
    content: `
        <h2>Hi ${userName},</h2>
        <p>There's a new <strong>${postType}</strong> in your area (${state}):</p>
        <div class="info-box">
          <h3 style="margin-top: 0;">${postTitle}</h3>
          <p>Check your dashboard for full details.</p>
        </div>
        <p>Don't miss out on this opportunity to connect with others in your community!</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/connect-dashboard`,
      text: "View Details",
    },
  }),

  // Sunday meetup reminder
  sundayMeetupReminder: (
    userName,
    venueName,
    venueAddress,
    date,
    time,
    state
  ) => ({
    subject: `✨ Sunday Group Meetup in ${state} - Tomorrow!`,
    title: "Sunday Group Meetup Tomorrow ✨",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Don't forget! Our weekly Sunday group meetup is happening tomorrow.</p>
        <div class="info-box">
          <p><strong>📍 Venue:</strong> ${venueName}</p>
          <p><strong>📞 Address:</strong> ${venueAddress}</p>
          <p><strong>📅 Date:</strong> ${date}</p>
          <p><strong>🕐 Time:</strong> ${time}</p>
          <p><strong>📍 State:</strong> ${state}</p>
        </div>
        <p>Come mingle, meet new people, and make meaningful connections!</p>
        <p>Your next connection could be just around the corner. See you there! 🌟</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/connect-dashboard`,
      text: "View Event Details",
    },
  }),
  meetupReminder: (userName, venueName, venueAddress, date, time, state) => ({
    subject: `📍 Meetup Reminder - ${venueName} in ${state}`,
    title: "Upcoming Meetup Reminder 📍",
    content: `
          <h2>Hi ${userName},</h2>
          <p>This is a reminder for your upcoming meetup:</p>
          <div class="info-box">
            <p><strong>📍 Venue:</strong> ${venueName}</p>
            <p><strong>📞 Address:</strong> ${venueAddress}</p>
            <p><strong>📅 Date:</strong> ${date}</p>
            <p><strong>🕐 Time:</strong> ${time}</p>
            <p><strong>📍 State:</strong> ${state}</p>
          </div>
          <p>We hope you have a great time connecting with new people!</p>
        `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/connect-dashboard`,
      text: "View Details",
    },
  }),

  // Connection status update
  connectionStatusUpdate: (userName, connectionId, status) => ({
    subject: `📋 Connection Status Updated - ${connectionId}`,
    title: "Connection Status Updated",
    content: `
          <h2>Hi ${userName},</h2>
          <p>Your connection request status has been updated.</p>
          <div class="info-box">
            <p><strong>Connection ID:</strong> ${connectionId}</p>
            <p><strong>Status:</strong> <span class="badge">${status}</span></p>
          </div>
          <p>Log in to your dashboard for more details.</p>
        `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/connections`,
      text: "View Connections",
    },
  }),
};

// ============================================================
// BOOKING/ERRAND TEMPLATES
// ============================================================

const bookingTemplates = {
  // Booking created
  bookingCreated: (userName, bookingId, serviceType, date, amount) => ({
    subject: "📋 Booking Confirmation - GEOBUY Errands",
    title: "Booking Confirmed! ✅",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your booking has been created successfully!</p>
        <div class="info-box">
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Service:</strong> ${serviceType}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Amount:</strong> £${amount}</p>
        </div>
        <p>We'll notify you when a provider accepts your booking.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/booking-history`,
      text: "View Booking",
    },
  }),

  // Booking accepted by provider
  bookingAccepted: (userName, bookingId, providerName, date) => ({
    subject: "✅ Booking Accepted - Provider Assigned",
    title: "Provider Assigned! 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Great news! <strong>${providerName}</strong> has accepted your booking.</p>
        <div class="info-box">
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Provider:</strong> ${providerName}</p>
          <p><strong>Date:</strong> ${date}</p>
        </div>
        <p>You can now track your booking status in real-time.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/booking-history`,
      text: "Track Booking",
    },
  }),

  // Booking completed
  bookingCompleted: (userName, bookingId, providerName) => ({
    subject: "✅ Booking Completed - Thank You!",
    title: "Booking Completed! 🌟",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your booking with <strong>${providerName}</strong> has been completed.</p>
        <div class="info-box">
          <p><strong>Booking ID:</strong> ${bookingId}</p>
        </div>
        <p>We hope you had a great experience! Please take a moment to rate your provider.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/booking-history`,
      text: "Rate Provider",
    },
  }),

  // Booking cancelled
  bookingCancelled: (userName, bookingId, reason) => ({
    subject: "❌ Booking Cancelled",
    title: "Booking Cancelled",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your booking (${bookingId}) has been cancelled.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        <p>If you have any questions, please contact our support team.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/booking-history`,
      text: "View Details",
    },
  }),
};

// ============================================================
// PAYMENT TEMPLATES
// ============================================================

const paymentTemplates = {
  // Payment successful
  paymentSuccessful: (userName, amount, serviceType, transactionId) => ({
    subject: "💰 Payment Successful - GEOBUY Errands",
    title: "Payment Confirmed! ✅",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your payment of <strong>£${amount}</strong> has been successfully processed.</p>
        <div class="info-box">
          <p><strong>Amount:</strong> £${amount}</p>
          <p><strong>Service:</strong> ${serviceType}</p>
          <p><strong>Transaction ID:</strong> ${transactionId}</p>
        </div>
        <p>Your payment is now complete. Thank you for using GEOBUY Errands!</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/payments`,
      text: "View Payments",
    },
  }),

  // Payment failed
  paymentFailed: (userName, amount, errorMessage) => ({
    subject: "❌ Payment Failed - Please Try Again",
    title: "Payment Failed ❌",
    content: `
        <h2>Hi ${userName},</h2>
        <p>We were unable to process your payment of <strong>£${amount}</strong>.</p>
        <div class="info-box" style="border-left-color: #dc3545;">
          <p><strong>Error:</strong> ${
            errorMessage ||
            "Please try again or use a different payment method."
          }</p>
        </div>
        <p>Please check your payment details and try again.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/payments`,
      text: "Try Again",
    },
  }),

  // Payment refunded
  paymentRefunded: (userName, amount, reason) => ({
    subject: "💰 Payment Refunded - GEOBUY Errands",
    title: "Payment Refunded 💰",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your payment of <strong>£${amount}</strong> has been refunded.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        <p>The refund will appear in your account within 3-5 business days.</p>
      `,
  }),
};

// ============================================================
// PROVIDER TEMPLATES
// ============================================================

const providerTemplates = {
  // New job available
  newJobAvailable: (providerName, jobTitle, amount, location) => ({
    subject: "📋 New Job Available - GEOBUY Errands",
    title: "New Job Available! 💼",
    content: `
        <h2>Hi ${providerName},</h2>
        <p>A new job is available in your area:</p>
        <div class="info-box">
          <p><strong>Job:</strong> ${jobTitle}</p>
          <p><strong>Amount:</strong> £${amount}</p>
          <p><strong>Location:</strong> ${location}</p>
        </div>
        <p>Log in to your dashboard to view and accept this job.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/available-jobs`,
      text: "View Job",
    },
  }),

  // Provider verification approved
  verificationApproved: (providerName) => ({
    subject: "✅ Provider Verification Approved",
    title: "Verification Approved! 🎉",
    content: `
        <h2>Hi ${providerName},</h2>
        <p>Congratulations! Your provider account has been verified and approved.</p>
        <p>You can now start accepting jobs and earning money.</p>
        <p>Welcome to the GEOBUY provider community! 🌟</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/dashboard`,
      text: "Go to Dashboard",
    },
  }),

  // Provider verification rejected
  verificationRejected: (providerName, reason) => ({
    subject: "❌ Provider Verification Update",
    title: "Verification Update",
    content: `
        <h2>Hi ${providerName},</h2>
        <p>Your provider verification has been reviewed.</p>
        <div class="info-box" style="border-left-color: #dc3545;">
          <p><strong>Status:</strong> Rejected</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        </div>
        <p>Please update your documents and resubmit for verification.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/verification`,
      text: "Update Documents",
    },
  }),
};

// ============================================================
// SUBSCRIPTION TEMPLATES
// ============================================================

const subscriptionTemplates = {
  // Subscription started
  subscriptionStarted: (userName, planName, trialDays) => ({
    subject: "🎉 Subscription Started - GEOBUY Errands",
    title: "Subscription Active! 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your <strong>${planName}</strong> subscription has been activated!</p>
        ${
          trialDays
            ? `<p>You have <strong>${trialDays} days</strong> of free trial.</p>`
            : ""
        }
        <p>Enjoy the benefits of your subscription plan.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/subscriptions`,
      text: "View Subscription",
    },
  }),

  // Subscription cancelled
  subscriptionCancelled: (userName, planName) => ({
    subject: "❌ Subscription Cancelled",
    title: "Subscription Cancelled",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your <strong>${planName}</strong> subscription has been cancelled.</p>
        <p>You will continue to have access until the end of your current billing period.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/subscriptions`,
      text: "View Details",
    },
  }),

  // Subscription expiring
  subscriptionExpiring: (userName, planName, daysLeft) => ({
    subject: "⏰ Subscription Expiring Soon",
    title: "Subscription Expiring Soon ⏰",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your <strong>${planName}</strong> subscription will expire in <strong>${daysLeft} days</strong>.</p>
        <p>Renew now to continue enjoying the benefits.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/subscriptions`,
      text: "Renew Subscription",
    },
  }),
};

// ============================================================
// VERIFICATION TEMPLATES
// ============================================================

const verificationTemplates = {
  // Documents submitted
  documentsSubmitted: (userName) => ({
    subject: "📄 Documents Submitted - Under Review",
    title: "Documents Submitted 📄",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your verification documents have been submitted successfully.</p>
        <p>Our team will review them within 1-2 business days.</p>
        <p>We'll notify you once the review is complete.</p>
      `,
  }),

  // Verification completed
  verificationCompleted: (userName, status) => ({
    subject: `✅ ${
      status === "approved" ? "Verification Approved" : "Verification Update"
    }`,
    title:
      status === "approved"
        ? "Verification Approved! 🎉"
        : "Verification Update",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your verification has been <strong>${status}</strong>.</p>
        ${
          status === "approved"
            ? "<p>You now have full access to all platform features.</p>"
            : "<p>Please check your dashboard for more details.</p>"
        }
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/profile`,
      text: "View Profile",
    },
  }),
};

// ============================================================
// SUPPORT TEMPLATES
// ============================================================

const supportTemplates = {
  // Support ticket created
  ticketCreated: (userName, ticketId, subject) => ({
    subject: `🎫 Support Ticket Created - #${ticketId}`,
    title: "Support Ticket Created 🎫",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your support ticket has been created successfully.</p>
        <div class="info-box">
          <p><strong>Ticket ID:</strong> ${ticketId}</p>
          <p><strong>Subject:</strong> ${subject}</p>
        </div>
        <p>Our team will respond within 24 hours.</p>
      `,
  }),

  // Support ticket resolved
  ticketResolved: (userName, ticketId) => ({
    subject: `✅ Support Ticket Resolved - #${ticketId}`,
    title: "Support Ticket Resolved ✅",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your support ticket (#${ticketId}) has been resolved.</p>
        <p>If you have any further questions, feel free to reply to this email.</p>
      `,
  }),

  ticketAssigned: (adminName, ticketId, subject) => ({
    subject: `🎫 Support Ticket Assigned - #${ticketId}`,
    title: "Support Ticket Assigned 🎫",
    content: `
      <h2>Hi ${adminName},</h2>
      <p>A support ticket has been assigned to you.</p>
      <div class="info-box">
        <p><strong>Ticket ID:</strong> ${ticketId}</p>
        <p><strong>Subject:</strong> ${subject}</p>
      </div>
      <p>Please review and respond to the customer as soon as possible.</p>
    `,
    button: {
      url: `${process.env.FRONTEND_URL}/admin/support`,
      text: "View Ticket",
    },
  }),
};

// ============================================================
// ERRAND TEMPLATES (Complete)
// ============================================================
const errandTemplates = {
  // Errand created (customer)
  errandCreated: (userName, errandId, serviceType, date, amount) => ({
    subject: "📋 Errand Created - GEOBUY Errands",
    title: "Errand Created! ✅",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your errand has been created successfully!</p>
        <div class="info-box">
          <p><strong>Errand ID:</strong> ${errandId}</p>
          <p><strong>Service:</strong> ${serviceType}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Amount:</strong> £${amount}</p>
          <p><strong>Status:</strong> <span class="badge">Pending</span></p>
        </div>
        <p>We'll notify you when a provider accepts your errand.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/errands/${errandId}`,
      text: "View Errand",
    },
  }),

  // Errand accepted (customer notification)
  errandAccepted: (userName, errandId, providerName, date) => ({
    subject: "✅ Errand Accepted - Provider Assigned",
    title: "Provider Assigned! 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Great news! <strong>${providerName}</strong> has accepted your errand.</p>
        <div class="info-box">
          <p><strong>Errand ID:</strong> ${errandId}</p>
          <p><strong>Provider:</strong> ${providerName}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #22c55e;">Accepted</span></p>
        </div>
        <p>You can now track your errand status in real-time and chat with your provider.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/errands/${errandId}`,
      text: "Track Errand",
    },
  }),

  // Errand accepted (provider notification)
  youAcceptedErrand: (userName, errandId, serviceType, location) => ({
    subject: "✅ You Accepted an Errand - GEOBUY Errands",
    title: "You Accepted an Errand! 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>You have successfully accepted an errand on GEOBUY Errands.</p>
        <div class="info-box">
          <p><strong>Errand ID:</strong> ${errandId}</p>
          <p><strong>Service:</strong> ${serviceType}</p>
          <p><strong>Pickup Location:</strong> ${location}</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #22c55e;">Accepted</span></p>
        </div>
        <p>Please review the details and contact the customer if needed.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/errands/${errandId}`,
      text: "View Errand",
    },
  }),

  // Errand completed (customer)
  errandCompleted: (userName, errandId, providerName) => ({
    subject: "✅ Errand Completed - Thank You!",
    title: "Errand Completed! 🌟",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your errand with <strong>${providerName}</strong> has been completed.</p>
        <div class="info-box">
          <p><strong>Errand ID:</strong> ${errandId}</p>
          <p><strong>Provider:</strong> ${providerName}</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #22c55e;">Completed</span></p>
        </div>
        <p>We hope you had a great experience! Please take a moment to rate your provider.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/errands/${errandId}/rate`,
      text: "Rate Provider",
    },
  }),

  // Errand completed (provider)
  errandCompletedProvider: (userName, errandId, customerName) => ({
    subject: "✅ Errand Completed - Payment Processing",
    title: "Errand Completed! 💰",
    content: `
        <h2>Hi ${userName},</h2>
        <p>You have successfully completed an errand for <strong>${customerName}</strong>.</p>
        <div class="info-box">
          <p><strong>Errand ID:</strong> ${errandId}</p>
          <p><strong>Customer:</strong> ${customerName}</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #22c55e;">Completed</span></p>
        </div>
        <p>Your payment is being processed and will be added to your wallet shortly.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/errands/${errandId}`,
      text: "View Details",
    },
  }),

  // Errand cancelled
  errandCancelled: (userName, errandId, reason) => ({
    subject: "❌ Errand Cancelled - GEOBUY Errands",
    title: "Errand Cancelled",
    content: `
        <h2>Hi ${userName},</h2>
        <p>An errand has been cancelled.</p>
        <div class="info-box" style="border-left-color: #dc3545;">
          <p><strong>Errand ID:</strong> ${errandId}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p><strong>Status:</strong> <span class="badge" style="background-color: #dc3545;">Cancelled</span></p>
        </div>
        <p>If you have any questions, please contact our support team.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/errands`,
      text: "View Errands",
    },
  }),

  // New offer received (customer)
  newOfferReceived: (userName, errandId, providerName, amount) => ({
    subject: "💰 New Offer Received - GEOBUY Errands",
    title: "New Offer Received! 💰",
    content: `
        <h2>Hi ${userName},</h2>
        <p><strong>${providerName}</strong> has submitted an offer for your errand.</p>
        <div class="info-box">
          <p><strong>Errand ID:</strong> ${errandId}</p>
          <p><strong>Provider:</strong> ${providerName}</p>
          <p><strong>Offer Amount:</strong> £${amount}</p>
        </div>
        <p>Review the offer and accept or negotiate the price.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/customer/errands/${errandId}`,
      text: "Review Offer",
    },
  }),

  // Offer accepted (provider)
  offerAccepted: (userName, errandId, amount) => ({
    subject: "🎉 Your Offer Was Accepted! - GEOBUY Errands",
    title: "Offer Accepted! 🎉",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Congratulations! Your offer has been accepted.</p>
        <div class="info-box">
          <p><strong>Errand ID:</strong> ${errandId}</p>
          <p><strong>Accepted Amount:</strong> £${amount}</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #22c55e;">Accepted</span></p>
        </div>
        <p>You are now assigned to this errand. Please contact the customer to arrange details.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/errands/${errandId}`,
      text: "View Errand",
    },
  }),
};

// ============================================================
// WALLET TEMPLATES
// ============================================================

const walletTemplates = {
  // Wallet credited
  walletCredited: (userName, amount, source) => ({
    subject: "💰 Wallet Credited - GEOBUY Errands",
    title: "Wallet Credited! 💰",
    content: `
        <h2>Hi ${userName},</h2>
        <p><strong>£${amount}</strong> has been added to your wallet.</p>
        <div class="info-box">
          <p><strong>Amount:</strong> £${amount}</p>
          <p><strong>Source:</strong> ${source || "Payment"}</p>
        </div>
        <p>Your current balance has been updated.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/wallet`,
      text: "View Wallet",
    },
  }),

  // Withdrawal request submitted
  withdrawalRequested: (userName, amount, reference) => ({
    subject: "💸 Withdrawal Requested - GEOBUY Errands",
    title: "Withdrawal Requested 💸",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your withdrawal request has been submitted.</p>
        <div class="info-box">
          <p><strong>Amount:</strong> £${amount}</p>
          <p><strong>Reference:</strong> ${reference}</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #f59e0b;">Pending</span></p>
        </div>
        <p>We'll process your withdrawal within 1-2 business days.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/withdrawals`,
      text: "View Withdrawals",
    },
  }),

  // Withdrawal completed
  withdrawalCompleted: (userName, amount, reference) => ({
    subject: "✅ Withdrawal Completed - GEOBUY Errands",
    title: "Withdrawal Completed! ✅",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your withdrawal of <strong>£${amount}</strong> has been processed.</p>
        <div class="info-box">
          <p><strong>Amount:</strong> £${amount}</p>
          <p><strong>Reference:</strong> ${reference}</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #22c55e;">Completed</span></p>
        </div>
        <p>The funds should appear in your bank account within 3-5 business days.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/withdrawals`,
      text: "View Withdrawals",
    },
  }),

  // Withdrawal failed
  withdrawalFailed: (userName, amount, reason) => ({
    subject: "❌ Withdrawal Failed - GEOBUY Errands",
    title: "Withdrawal Failed ❌",
    content: `
        <h2>Hi ${userName},</h2>
        <p>Your withdrawal of <strong>£${amount}</strong> could not be processed.</p>
        <div class="info-box" style="border-left-color: #dc3545;">
          <p><strong>Amount:</strong> £${amount}</p>
          <p><strong>Reason:</strong> ${
            reason || "Please check your bank details and try again."
          }</p>
          <p><strong>Status:</strong> <span class="badge" style="background-color: #dc3545;">Failed</span></p>
        </div>
        <p>The funds have been returned to your wallet balance.</p>
      `,
    button: {
      url: `${process.env.FRONTEND_URL}/provider/withdrawals`,
      text: "Try Again",
    },
  }),
};

// ============================================================
// EXPORT ALL TEMPLATES
// ============================================================

const buildEmailTemplate = (title, content, button = null) => {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #1B6E43; }
          .header h1 { color: #1B6E43; font-size: 28px; margin: 0; }
          .header p { color: #666; font-size: 14px; margin: 5px 0 0; }
          .content { padding: 30px 0; color: #333; line-height: 1.6; }
          .content h2 { color: #1B6E43; font-size: 22px; margin-top: 0; }
          .button { display: inline-block; background-color: #1B6E43; color: #ffffff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 15px; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
          .footer a { color: #1B6E43; text-decoration: none; }
          .badge { display: inline-block; background-color: #1B6E43; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
          .info-box { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #1B6E43; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>GEOBUY Errands</h1>
            <p>${title}</p>
          </div>
          <div class="content">
            ${content}
            ${
              button
                ? `<div style="text-align: center;">
    <a 
      href="${button.url}" 
      style="
        display: inline-block;
        text-decoration: none;
        color: #ffffff;
        background-color: #2563eb;
        padding: 12px 24px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 14px;
      "
    >
      ${button.text}
    </a>
  </div>`
                : ""
            }
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} GEOBUY Errands. All rights reserved.</p>
            <p>Need help? <a href="mailto:support@geobuy.com">support@geobuy.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
};

/**
 * Send email with template
 */
const sendTemplateEmail = async (
  to,
  subject,
  title,
  content,
  button = null,
  from = "info"
) => {
  const html = buildEmailTemplate(title, content, button);
  return await sendEmail({ to, subject, html, from });
};
module.exports = {
  // Main template functions
  buildEmailTemplate,
  sendTemplateEmail,

  // Template collections
  connectionTemplates,
  bookingTemplates,
  paymentTemplates,
  providerTemplates,
  subscriptionTemplates,
  verificationTemplates,
  supportTemplates,
  authTemplates,
  errandTemplates,
  walletTemplates,
};
