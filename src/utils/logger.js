const winston = require('winston');

const config = {
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development'
};

// Custom format for development
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} ${level}: ${message} ${metaStr}`;
  })
);

// Custom format for production (JSON)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: config.logLevel,
  format: config.nodeEnv === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console()
  ]
});

// Add helper methods for structured logging
logger.logMessage = (direction, phoneNumber, content, meta = {}) => {
  logger.info(`Message ${direction}`, {
    direction,
    phoneNumber: phoneNumber.slice(-4), // Only log last 4 digits for privacy
    contentLength: content.length,
    ...meta
  });
};

logger.logError = (context, error, meta = {}) => {
  logger.error(`Error in ${context}`, {
    context,
    error: error.message,
    stack: error.stack,
    ...meta
  });
};

logger.logCrisis = (phoneNumber, riskLevel, meta = {}) => {
  logger.warn('Crisis detected', {
    phoneNumber: phoneNumber.slice(-4),
    riskLevel,
    ...meta
  });
};

module.exports = logger;

