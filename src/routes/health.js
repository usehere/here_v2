const express = require('express');
const router = express.Router();
const redisService = require('../services/redis');

router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  // Check Redis status - but don't fail health check if Redis is down
  let redisStatus = 'disconnected';
  try {
    const client = redisService.getClient();
    await client.ping();
    redisStatus = 'connected';
  } catch (err) {
    // Redis not connected, but app is still running
    redisStatus = 'disconnected';
  }
  
  const responseTime = Date.now() - startTime;
  
  // Always return 200 if the app is running, even if Redis is down
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      redis: redisStatus
    },
    uptime: process.uptime(),
    responseTimeMs: responseTime,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
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

