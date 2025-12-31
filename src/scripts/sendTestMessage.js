#!/usr/bin/env node

/**
 * Simple one-shot test message sender
 * Usage: node src/scripts/sendTestMessage.js "Your message here"
 */

const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_PHONE = process.env.TEST_PHONE || '+1234567890';
const message = process.argv[2];

if (!message) {
  console.error('Usage: node sendTestMessage.js "Your message"');
  console.error('Example: node sendTestMessage.js "Hello, how are you?"');
  process.exit(1);
}

async function sendTestMessage() {
  const payload = {
    type: 'message',
    message: {
      id: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      sender: {
        phone: TEST_PHONE,
        name: 'Test User',
      },
      recipient: {
        phone: '+19999999999',
      },
      text: message,
      timestamp: new Date().toISOString(),
      direction: 'incoming',
    },
  };

  try {
    console.log(`Sending to ${BASE_URL}/webhook/message...`);
    console.log(`Message: "${message}"\n`);

    const response = await axios.post(`${BASE_URL}/webhook/message`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Mode': 'true',
      },
      timeout: 30000,
    });

    if (response.data.success) {
      console.log('✓ Success!\n');
      console.log('Response:', response.data.response);
      
      if (response.data.emotion) {
        console.log('\nEmotion:', response.data.emotion);
      }
      if (response.data.crisisDetected) {
        console.log('⚠️  Crisis detected - Risk level:', response.data.riskLevel);
      }
      if (response.data.onboardingStage) {
        console.log('Onboarding stage:', response.data.onboardingStage);
      }
      console.log('\nProcessing time:', response.data.processingTimeMs + 'ms');
    } else {
      console.log('✓ Message sent');
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    process.exit(1);
  }
}

sendTestMessage();

