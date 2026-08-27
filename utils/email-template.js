const sendEmail = require('./sendEmail');

/**
 * Email template builder with consistent styling
 */
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
          ${button ? `<div style="text-align: center;"><a href="${button.url}" class="button">${button.text}</a></div>` : ''}
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
const sendTemplateEmail = async (to, subject, title, content, button = null, from = 'info') => {
  const html = buildEmailTemplate(title, content, button);
  return await sendEmail({ to, subject, html, from });
};

// module.exports = {
//   buildEmailTemplate,
//   sendTemplateEmail,
// };