const axios = require("axios");

const senders = {
  admin: {
    email: process.env.EMAIL_ADMIN,
    name: "Geobuy Errands Admin",
  },

  support: {
    email: process.env.EMAIL_SUPPORT,
    name: "Geobuy Errands Support",
  },
  info: {
    email: process.env.EMAIL_INFO,
    name: "Geobuy Errands Info",
  },
};

const sendEmail = async ({
  to,
  subject = "New Mail",
  html,
  from = "info",
}) => {
  try {
    console.log("📧 Attempting to send email...");

    if (!to || !subject || !html) {
      console.error({
        success: false,
        message: "Please provide all email fields: to, subject, html",
      });

      return false;
    }

    // Check that the requested sender exists
    const sender = senders[from];

    if (!sender || !sender.email) {
      console.error({
        success: false,
        message: `Invalid sender "${from}". Use "admin" or "support".`,
      });

      return false;
    }

    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          email: sender.email,
          name: sender.name,
        },

        to: [
          {
            email: to,
          },
        ],

        subject,
        htmlContent: html,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `✅ Email sent via Brevo from ${sender.email}:`,
      response.data.messageId || "No ID returned"
    );

    return true;
  } catch (error) {
    console.error(
      "❌ Brevo email error:",
      error.response?.data || error.message
    );

    return false;
  }
};

module.exports = sendEmail;