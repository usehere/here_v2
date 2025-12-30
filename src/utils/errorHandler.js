const logger = require('./logger');

/**
 * Custom application error
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Specific error types
 */
class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, true);
    this.name = 'ValidationError';
  }
}

class RedisError extends AppError {
  constructor(message) {
    super(message, 503, true);
    this.name = 'RedisError';
  }
}

class ClaudeError extends AppError {
  constructor(message) {
    super(message, 502, true);
    this.name = 'ClaudeError';
  }
}

class LoopMessageError extends AppError {
  constructor(message) {
    super(message, 502, true);
    this.name = 'LoopMessageError';
  }
}

/**
 * Express error handling middleware
 */
function errorMiddleware(err, req, res, next) {
  // Log the error
  logger.logError('Express', err, {
    path: req.path,
    method: req.method
  });

  // Default values
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'An unexpected error occurred';

  // Send response
  res.status(statusCode).json({
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err.message
      })
    }
  });
}

/**
 * Handle uncaught exceptions
 */
function handleUncaughtException(error) {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  
  // Give logger time to write, then exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(reason, promise) {
  logger.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
}

/**
 * Setup global error handlers
 */
function setupGlobalErrorHandlers() {
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
}

/**
 * Wrap async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Get fallback response for when Claude fails
 */
function getFallbackResponse() {
  const fallbacks = [
    "I'm having a moment - give me a sec and try again?",
    "Sorry, I got a bit mixed up there. Mind saying that again?",
    "My mind wandered for a second. What were you saying?",
    "I'm here for you, just had a little hiccup. Try again?"
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

module.exports = {
  AppError,
  ValidationError,
  RedisError,
  ClaudeError,
  LoopMessageError,
  errorMiddleware,
  setupGlobalErrorHandlers,
  asyncHandler,
  getFallbackResponse
};

