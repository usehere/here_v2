const crypto = require('crypto');

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a unique ID
 */
function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Get current timestamp in milliseconds
 */
function now() {
  return Date.now();
}

/**
 * Format phone number for storage (remove non-digits)
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  return phone.replace(/\D/g, '');
}

/**
 * Mask phone number for logging (show only last 4 digits)
 */
function maskPhoneNumber(phone) {
  if (!phone || phone.length < 4) return '****';
  return `****${phone.slice(-4)}`;
}

/**
 * Truncate text to a maximum length
 */
function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get greeting based on time of day
 */
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Hey there';
}

/**
 * Calculate days between two timestamps
 */
function daysBetween(timestamp1, timestamp2) {
  const diff = Math.abs(timestamp1 - timestamp2);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

/**
 * Check if a string contains any of the keywords (case insensitive)
 */
function containsKeyword(text, keywords) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Parse JSON safely, return default on error
 */
function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * Validate webhook signature
 */
function validateWebhookSignature(payload, signature, secret) {
  if (!secret) return true; // Skip validation if no secret configured
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEquals(
    Buffer.from(signature || ''),
    Buffer.from(expectedSignature)
  );
}

/**
 * Retry an operation with exponential backoff
 */
async function withRetry(operation, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Extract message type from LoopMessage webhook
 */
function getMessageType(webhookData) {
  if (webhookData.attachment_url) return 'voice';
  if (webhookData.reaction) return 'reaction';
  return 'text';
}

module.exports = {
  sleep,
  generateId,
  now,
  normalizePhoneNumber,
  maskPhoneNumber,
  truncate,
  getTimeBasedGreeting,
  daysBetween,
  formatTimestamp,
  containsKeyword,
  safeJsonParse,
  validateWebhookSignature,
  withRetry,
  getMessageType
};

