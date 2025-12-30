const express = require('express');
const router = express.Router();
const redisService = require('../services/redis');

router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check Redis
    const client = redisService.getClient();
    await client.ping();
    
    const responseTime = Date.now() - startTime;
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: 'connected'
      },
      uptime: process.uptime(),
      responseTimeMs: responseTime,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message,
      services: {
        redis: 'disconnected'
      }
    });
  }
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const checks = {};
  
  // Redis check
  try {
    const client = redisService.getClient();
    const start = Date.now();
    await client.ping();
    checks.redis = {
      status: 'ok',
      latencyMs: Date.now() - start
    };
  } catch (err) {
    checks.redis = {
      status: 'error',
      error: err.message
    };
  }
  
  // Memory check
  const memUsage = process.memoryUsage();
  checks.memory = {
    heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
    rssMB: Math.round(memUsage.rss / 1024 / 1024)
  };
  
  // Determine overall status
  const allOk = Object.values(checks).every(c => c.status === 'ok' || !c.status);
  
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
    uptime: process.uptime()
  });
});

module.exports = router;

