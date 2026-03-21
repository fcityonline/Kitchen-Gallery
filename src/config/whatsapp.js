/**
 * WhatsApp Configuration & Setup
 * Uses Twilio API for WhatsApp message delivery
 * 
 * Setup Instructions:
 * 1. Sign up at https://www.twilio.com
 * 2. Get WhatsApp Business Account (free sandbox available)
 * 3. Find these in Twilio Console:
 *    - Account SID
 *    - Auth Token
 *    - Twilio WhatsApp Number
 * 4. Add to .env:
 *    TWILIO_ACCOUNT_SID=xxxxx
 *    TWILIO_AUTH_TOKEN=xxxxx
 *    TWILIO_WHATSAPP_NUMBER=whatsapp:+1415xxxxxxx  (with whatsapp: prefix)
 * 5. Enable WhatsApp Sandbox (free testing)
 * 6. Verify user phone number at: https://www.twilio.com/console/sms/whatsapp/learn
 */

const twilio = require('twilio');
const logger = require('./logger');

let whatsappClient = null;

/**
 * Initialize Twilio WhatsApp client
 * Should be called once at server startup
 */
const initializeWhatsApp = () => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER;

    // Check if credentials are provided
    if (!accountSid || !authToken || !twilioWhatsApp) {
      logger.warn(
        'WhatsApp configuration incomplete. Some features will be disabled. ' +
        'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER to .env'
      );
      return null;
    }

    // Initialize Twilio client
    whatsappClient = twilio(accountSid, authToken);
    logger.info('✓ WhatsApp initialized successfully');
    logger.info(`  WhatsApp Number: ${twilioWhatsApp}`);

    return whatsappClient;
  } catch (error) {
    logger.error('Failed to initialize WhatsApp:', error.message);
    return null;
  }
};

/**
 * Get initialized WhatsApp client
 * @returns {twilio.Twilio|null}
 */
const getWhatsAppClient = () => {
  return whatsappClient;
};

/**
 * Check if WhatsApp is available
 * @returns {boolean}
 */
const isWhatsAppAvailable = () => {
  return whatsappClient !== null;
};

/**
 * Send WhatsApp message
 * @param {string} recipientPhone - Phone number with country code (e.g., '+917654321098')
 * @param {string} message - Message text
 * @returns {Promise<{messageSid, status}>}
 */
const sendWhatsAppMessage = async (recipientPhone, message) => {
  try {
    if (!isWhatsAppAvailable()) {
      logger.warn('WhatsApp not configured, message not sent');
      return { messageSid: null, status: 'disabled' };
    }

    // Normalize phone number
    let formattedPhone = recipientPhone;
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    // Add whatsapp: prefix for Twilio
    const twilioRecipient = `whatsapp:${formattedPhone}`;
    const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    // Send message
    const response = await whatsappClient.messages.create({
      from: twilioNumber,
      to: twilioRecipient,
      body: message
    });

    logger.info(`✓ WhatsApp message sent: ${response.sid}`);

    return {
      messageSid: response.sid,
      status: 'sent',
      timestamp: new Date()
    };
  } catch (error) {
    logger.error('Failed to send WhatsApp message:', error.message);
    throw error;
  }
};

/**
 * Send WhatsApp template message
 * For template-based messages (production use)
 * Requires template variables
 * @param {string} recipientPhone - Phone number
 * @param {string} templateSid - Template SID from Twilio
 * @param {Array<string>} variables - Template variables in order
 * @returns {Promise<{messageSid, status}>}
 */
const sendWhatsAppTemplate = async (recipientPhone, templateSid, variables = []) => {
  try {
    if (!isWhatsAppAvailable()) {
      logger.warn('WhatsApp not configured, template message not sent');
      return { messageSid: null, status: 'disabled' };
    }

    let formattedPhone = recipientPhone;
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    const twilioRecipient = `whatsapp:${formattedPhone}`;
    const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    const response = await whatsappClient.messages.create({
      from: twilioNumber,
      to: twilioRecipient,
      contentSid: templateSid,
      contentVariables: JSON.stringify({
        1: variables[0] || '',
        2: variables[1] || '',
        3: variables[2] || ''
      })
    });

    logger.info(`✓ WhatsApp template message sent: ${response.sid}`);

    return {
      messageSid: response.sid,
      status: 'sent',
      timestamp: new Date()
    };
  } catch (error) {
    logger.error('Failed to send WhatsApp template:', error.message);
    throw error;
  }
};

/**
 * Get message status
 * @param {string} messageSid - Twilio message SID
 * @returns {Promise<string>} - Status: 'queued', 'sent', 'delivered', 'failed', etc.
 */
const getMessageStatus = async (messageSid) => {
  try {
    if (!isWhatsAppAvailable()) {
      return 'unknown';
    }

    const message = await whatsappClient.messages(messageSid).fetch();
    return message.status;
  } catch (error) {
    logger.error('Failed to get message status:', error.message);
    return 'unknown';
  }
};

/**
 * Format phone number with country code
 * Ensures consistent format: +919876543210
 * @param {string} phone - Phone number
 * @param {string} countryCode - Country code (default: 91 for India)
 * @returns {string} - Formatted: +CC9876543210
 */
const formatPhoneNumber = (phone, countryCode = '91') => {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');

  // Remove country code if already present
  if (cleaned.startsWith(countryCode)) {
    cleaned = cleaned.slice(countryCode.length);
  }

  // Ensure it starts with +CC
  return `+${countryCode}${cleaned}`;
};

/**
 * Validate WhatsApp phone number format
 * @param {string} phone - Phone number
 * @returns {boolean} - Is valid format
 */
const isValidWhatsAppNumber = (phone) => {
  try {
    // Must be 10+ digits
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10;
  } catch {
    return false;
  }
};

module.exports = {
  initializeWhatsApp,
  getWhatsAppClient,
  isWhatsAppAvailable,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  getMessageStatus,
  formatPhoneNumber,
  isValidWhatsAppNumber
};
