const QRCode = require('qrcode');
const crypto = require('crypto');

class QRCodeService {
  /**
   * Generate a QR code for an errand
   * @param {string} errandId - The errand ID
   * @param {string} errandCode - The errand code
   * @param {Object} options - QR code options
   * @returns {Promise<string>} - Base64 encoded QR code
   */
  async generateErrandQRCode(errandId, errandCode, options = {}) {
    try {
      // Generate a unique verification token
      const verificationToken = this.generateVerificationToken(errandId);
      
      // Create QR code data payload
      const qrData = {
        errandId: errandId,
        errandCode: errandCode,
        verificationToken: verificationToken,
        timestamp: new Date().toISOString(),
        type: 'errand_verification',
      };

      // Convert to JSON string
      const qrString = JSON.stringify(qrData);

      // Generate QR code as base64
      const qrCodeBuffer = await QRCode.toBuffer(qrString, {
        type: 'png',
        width: options.width || 300,
        margin: options.margin || 2,
        color: {
          dark: options.color || '#1B6E43',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H', // High error correction
      });

      // Convert to base64
      const base64QR = qrCodeBuffer.toString('base64');
      
      // Also generate a text version for display
      const qrText = await QRCode.toString(qrString, { type: 'terminal' });

      return {
        base64: base64QR,
        dataUrl: `data:image/png;base64,${base64QR}`,
        text: qrText,
        verificationToken: verificationToken,
        payload: qrData,
      };
    } catch (error) {
      console.error('QR Code generation error:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate a verification token
   */
  generateVerificationToken(errandId) {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    return `${errandId}-${timestamp}-${random}`;
  }

  /**
   * Verify a scanned QR code
   */
  async verifyQRCode(qrData, errandId) {
    try {
      // Parse the QR data
      const data = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
      
      // Check if it's an errand verification
      if (data.type !== 'errand_verification') {
        return { valid: false, error: 'Invalid QR code type' };
      }

      // Verify the errand ID matches
      if (data.errandId !== errandId) {
        return { valid: false, error: 'QR code does not match this errand' };
      }

      // Check if the token is still valid (24 hours expiry)
      const tokenAge = Date.now() - new Date(data.timestamp).getTime();
      if (tokenAge > 24 * 60 * 60 * 1000) {
        return { valid: false, error: 'QR code has expired' };
      }

      return { 
        valid: true, 
        data: data,
        errandId: data.errandId,
        verificationToken: data.verificationToken,
      };
    } catch (error) {
      return { valid: false, error: 'Invalid QR code format' };
    }
  }

  /**
   * Generate a unique errand code
   */
  generateErrandCode() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `E-${year}${month}${day}-${random}`;
  }
}

module.exports = new QRCodeService();