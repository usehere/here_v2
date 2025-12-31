#!/usr/bin/env node

/**
 * Interactive CLI for testing the iMessage Mental Health Friend
 * Simulates LoopMessage webhook payloads locally
 */

const readline = require('readline');
const axios = require('axios');
const crypto = require('crypto');

// Use built-in crypto.randomUUID (Node 18+)
const uuidv4 = () => crypto.randomUUID();

// Configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_PHONE = process.env.TEST_PHONE || '+1234567890';
const USER_NAME = process.env.TEST_USER_NAME || 'Test User';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

class TestCLI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.cyan}You${colors.reset}: `,
    });
    
    this.conversationId = uuidv4();
    this.messageHistory = [];
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async sendMessage(text) {
    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    // Simulate LoopMessage webhook payload
    const payload = {
      type: 'message',
      message: {
        id: messageId,
        conversationId: this.conversationId,
        sender: {
          phone: TEST_PHONE,
          name: USER_NAME,
        },
        recipient: {
          phone: '+19999999999', // Bot's number (doesn't matter for testing)
        },
        text: text,
        timestamp: timestamp,
        direction: 'incoming',
      },
    };

    try {
      this.log(`\n${colors.dim}[Sending message to ${BASE_URL}]${colors.reset}`, 'dim');
      
      const response = await axios.post(`${BASE_URL}/webhook/message`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Mode': 'true', // Flag for test mode
        },
        timeout: 30000, // 30 second timeout
      });

      // Extract the bot's response
      if (response.data && response.data.success) {
        this.log(`\n${colors.green}Bot${colors.reset}: ${response.data.response || 'Message received'}`, 'green');
        
        // Show additional info if available
        if (response.data.emotion) {
          this.log(`${colors.dim}[Detected emotion: ${response.data.emotion}]${colors.reset}`, 'dim');
        }
        if (response.data.crisisDetected) {
          this.log(`${colors.red}[⚠️  Crisis indicators detected]${colors.reset}`, 'red');
        }
        if (response.data.onboardingStage) {
          this.log(`${colors.yellow}[Onboarding: ${response.data.onboardingStage}]${colors.reset}`, 'yellow');
        }
      } else {
        this.log('\n✓ Message sent successfully', 'green');
      }

      this.messageHistory.push({ role: 'user', text, timestamp });

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        this.log(`\n${colors.red}✗ Server not running at ${BASE_URL}${colors.reset}`, 'red');
        this.log(`  Start the server with: ${colors.cyan}npm run dev${colors.reset}`, 'yellow');
      } else if (error.response) {
        this.log(`\n${colors.red}✗ Error: ${error.response.status} - ${error.response.statusText}${colors.reset}`, 'red');
        if (error.response.data) {
          this.log(`  ${JSON.stringify(error.response.data, null, 2)}`, 'dim');
        }
      } else {
        this.log(`\n${colors.red}✗ Error: ${error.message}${colors.reset}`, 'red');
      }
    }
  }

  async sendReaction(emoji) {
    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    const payload = {
      type: 'reaction',
      reaction: {
        messageId: this.messageHistory.length > 0 ? this.messageHistory[this.messageHistory.length - 1].id : messageId,
        conversationId: this.conversationId,
        sender: {
          phone: TEST_PHONE,
          name: USER_NAME,
        },
        emoji: emoji,
        timestamp: timestamp,
      },
    };

    try {
      await axios.post(`${BASE_URL}/webhook/message`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      this.log(`\n✓ Reaction sent: ${emoji}`, 'green');
    } catch (error) {
      this.log(`\n✗ Error sending reaction: ${error.message}`, 'red');
    }
  }

  printHelp() {
    console.log(`
${colors.bright}${colors.cyan}=== iMessage Mental Health Friend - Test CLI ===${colors.reset}

${colors.bright}Commands:${colors.reset}
  ${colors.cyan}/help${colors.reset}           - Show this help message
  ${colors.cyan}/react <emoji>${colors.reset}  - Send a reaction (e.g., /react ❤️)
  ${colors.cyan}/reset${colors.reset}          - Start a new conversation
  ${colors.cyan}/history${colors.reset}        - Show message history
  ${colors.cyan}/crisis${colors.reset}         - Test crisis detection
  ${colors.cyan}/journal${colors.reset}        - Test journaling feature
  ${colors.cyan}/quit${colors.reset}           - Exit the CLI

${colors.bright}Test Scenarios:${colors.reset}
  ${colors.yellow}Crisis:${colors.reset}         "I want to hurt myself"
  ${colors.yellow}Journaling:${colors.reset}     "journal" or "I want to write"
  ${colors.yellow}Onboarding:${colors.reset}     (First message triggers onboarding)
  ${colors.yellow}Normal chat:${colors.reset}    "How are you?" or "I'm feeling anxious"

${colors.dim}Server: ${BASE_URL}
Phone: ${TEST_PHONE}${colors.reset}
`);
  }

  showHistory() {
    if (this.messageHistory.length === 0) {
      this.log('\nNo messages yet', 'dim');
      return;
    }

    this.log('\n=== Message History ===', 'bright');
    this.messageHistory.forEach((msg, i) => {
      const color = msg.role === 'user' ? 'cyan' : 'green';
      const role = msg.role === 'user' ? 'You' : 'Bot';
      this.log(`${i + 1}. ${role}: ${msg.text}`, color);
    });
    console.log('');
  }

  reset() {
    this.conversationId = uuidv4();
    this.messageHistory = [];
    this.log('\n✓ Conversation reset', 'green');
  }

  async start() {
    this.printHelp();
    
    // Check if server is running
    try {
      await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
      this.log(`${colors.green}✓ Server is running${colors.reset}\n`, 'green');
    } catch (error) {
      this.log(`${colors.red}✗ Server not running at ${BASE_URL}${colors.reset}`, 'red');
      this.log(`${colors.yellow}  Start it with: npm run dev${colors.reset}\n`, 'yellow');
    }

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const input = line.trim();

      if (!input) {
        this.rl.prompt();
        return;
      }

      // Handle commands
      if (input.startsWith('/')) {
        const [command, ...args] = input.slice(1).split(' ');

        switch (command.toLowerCase()) {
          case 'help':
          case 'h':
            this.printHelp();
            break;

          case 'react':
            if (args.length === 0) {
              this.log('Usage: /react <emoji>', 'yellow');
            } else {
              await this.sendReaction(args[0]);
            }
            break;

          case 'reset':
            this.reset();
            break;

          case 'history':
            this.showHistory();
            break;

          case 'crisis':
            await this.sendMessage('I feel like ending it all');
            break;

          case 'journal':
            await this.sendMessage('I want to journal');
            break;

          case 'quit':
          case 'exit':
          case 'q':
            this.log('\nGoodbye! 👋\n', 'cyan');
            process.exit(0);
            break;

          default:
            this.log(`Unknown command: ${command}. Type /help for available commands.`, 'yellow');
        }
      } else {
        // Regular message
        await this.sendMessage(input);
      }

      console.log('');
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.log('\nGoodbye! 👋\n', 'cyan');
      process.exit(0);
    });
  }
}

// Start the CLI
const cli = new TestCLI();
cli.start();

