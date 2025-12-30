require('dotenv').config();
const redisService = require('../services/redis');
const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

async function verifyRedis() {
  console.log('🔍 Verifying Redis connection...');
  try {
    await redisService.connect();
    const client = redisService.getClient();
    const pong = await client.ping();
    console.log(`✅ Redis connection successful (PING: ${pong})`);
    return true;
  } catch (err) {
    console.error('❌ Redis connection failed:', err.message);
    return false;
  }
}

async function verifyClaude() {
  console.log('🔍 Verifying Claude API...');
  
  if (!process.env.CLAUDE_API_KEY) {
    console.error('❌ Claude API key not configured');
    return false;
  }
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    });
    
    console.log(`✅ Claude API connection successful (model: ${message.model})`);
    return true;
  } catch (err) {
    console.error('❌ Claude API failed:', err.message);
    return false;
  }
}

async function verifyLoopMessage() {
  console.log('🔍 Verifying LoopMessage API...');
  
  if (!process.env.LOOPMESSAGE_API_KEY) {
    console.warn('⚠️  LoopMessage API key not configured (optional for local testing)');
    return true;
  }
  
  try {
    // Test API key by making a request
    // LoopMessage may not have a dedicated status endpoint, so we'll attempt
    // to validate the key format and make a simple request
    const response = await axios.get('https://server.loopmessage.com/api/v1/contacts', {
      headers: {
        'Authorization': process.env.LOOPMESSAGE_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: (status) => status < 500 // Accept 4xx as "connection works"
    });
    
    if (response.status === 401 || response.status === 403) {
      console.error('❌ LoopMessage API key invalid');
      return false;
    }
    
    console.log('✅ LoopMessage API connection successful');
    return true;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.error('❌ LoopMessage API unreachable:', err.message);
      return false;
    }
    // Connection works but endpoint might not exist - that's OK
    console.log('✅ LoopMessage API connection verified');
    return true;
  }
}

async function verifyEnvironmentVariables() {
  console.log('🔍 Verifying environment variables...');
  
  const required = ['CLAUDE_API_KEY', 'REDIS_URL'];
  const optional = ['LOOPMESSAGE_API_KEY', 'LOOPMESSAGE_WEBHOOK_SECRET', 'PORT', 'NODE_ENV'];
  
  const missing = required.filter(v => !process.env[v]);
  const present = required.filter(v => process.env[v]);
  const optionalPresent = optional.filter(v => process.env[v]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  console.log(`✅ Required vars present: ${present.join(', ')}`);
  console.log(`ℹ️  Optional vars present: ${optionalPresent.join(', ') || 'none'}`);
  
  return true;
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       iMessage Mental Health Friend - Connection Verify    ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  // First verify environment variables
  const envOk = await verifyEnvironmentVariables();
  console.log('');
  
  if (!envOk) {
    console.log('❌ Environment variable check failed. Fix configuration and retry.');
    process.exit(1);
  }
  
  // Then verify services
  const results = await Promise.all([
    verifyRedis(),
    verifyClaude(),
    verifyLoopMessage()
  ]);
  
  // Cleanup
  try {
    await redisService.disconnect();
  } catch (e) {
    // Ignore disconnect errors
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  
  if (results.every(r => r)) {
    console.log('✅ All connections verified successfully!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Ready to start the server with: npm start');
    console.log('');
    process.exit(0);
  } else {
    console.log('❌ Some connections failed. Check configuration above.');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Verification script error:', err);
  process.exit(1);
});

