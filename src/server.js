require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const redisService = require('./services/redis');
const logger = require('./utils/logger');
const { errorMiddleware, setupGlobalErrorHandlers } = require('./utils/errorHandler');
const config = require('./config');

// Setup global error handlers
setupGlobalErrorHandlers();

const app = express();

// Trust proxy (needed for Railway)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') { // Don't log health checks
      logger.info('Request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration
      });
    }
  });
  next();
});

// Routes
const webhookRoutes = require('./routes/webhook');
const healthRoutes = require('./routes/health');

app.use('/webhook', webhookRoutes);
app.use('/health', healthRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'iMessage Mental Health Friend',
    version: '1.0.0',
    status: 'running',
    docs: '/health for status'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use(errorMiddleware);

// Get webhook URL from Railway environment
const getWebhookUrl = () => {
  const domain = config.railwayPublicDomain || 
                 config.railwayStaticUrl ||
                 `localhost:${config.port}`;
  
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${domain}/webhook/message`;
};

// Startup
async function start() {
  try {
    logger.info('Starting iMessage Mental Health Friend...');
    
    // Start server first so health checks can pass
    const PORT = config.port;
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${config.nodeEnv}`);
    });
    
    // Connect to Redis - but don't crash if it fails
    logger.info('Connecting to Redis...');
    try {
      await redisService.connect();
      logger.info('✅ Redis connected successfully');
      
      // Log webhook URL for easy configuration
      const webhookUrl = getWebhookUrl();
      logger.info(`📱 Configure LoopMessage webhook to: ${webhookUrl}`);
      
      // Start proactive messaging scheduler
      const proactiveMessaging = require('./services/proactiveMessaging');
      proactiveMessaging.startScheduler();
      
      logger.info('✅ Ready to receive messages');
    } catch (err) {
      logger.error('Redis connection failed - app will run but some features unavailable', { 
        error: err.message 
      });
      logger.warn('Please check REDIS_URL environment variable');
      // Don't exit - let the app run without Redis for now
    }
    
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  try {
    // Stop proactive messaging
    const proactiveMessaging = require('./services/proactiveMessaging');
    await proactiveMessaging.shutdown();
    
    // Disconnect from Redis
    await redisService.disconnect();
    
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the server
start();

module.exports = app; // Export for testing

