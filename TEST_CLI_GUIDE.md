# Test CLI Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Redis (if testing locally)
```bash
# Option 1: Docker
docker run -d -p 6379:6379 redis

# Option 2: Homebrew (Mac)
brew install redis
brew services start redis

# Option 3: Use Railway Redis (update .env with REDIS_URL)
```

### 3. Start the Server
```bash
# Terminal 1
npm run dev
```

### 4. Start the Test CLI
```bash
# Terminal 2
npm test
```

## Test CLI Commands

```
/help              - Show help message
/react <emoji>     - Send a reaction (e.g., /react ❤️)
/reset             - Start a new conversation
/history           - Show message history
/crisis            - Test crisis detection
/journal           - Test journaling feature
/quit              - Exit the CLI
```

## Test Scenarios

### 1. New User Onboarding
```
npm test
> Hey there!
```
You should see:
- Welcome message
- Onboarding stage: "welcome"

### 2. Crisis Detection
```
> I want to hurt myself
> I'm thinking about ending it all
> I don't want to be here anymore
```
You should see:
- Crisis resources (988, Crisis Text Line)
- Risk level indicator
- Supportive response

### 3. Journaling
```
> j: Today was a really tough day
> journal: Had a great conversation with my friend
```
You should see:
- Acknowledgment of journal entry
- Encouragement

### 4. Normal Conversation
```
> I'm feeling anxious today
> My girlfriend broke up with me yesterday
> (next day) How are you feeling about the breakup?
```
You should see:
- Contextual responses
- Remembers previous conversations
- Emotion detection

### 5. Commands
```
> help
> stop
> resume
> forget me
```

### 6. Reactions
```
> /react ❤️
> /react 👍
> /react 😢
```

## Testing Against Railway (Production)

```bash
# Set the Railway URL
export TEST_URL=https://web-production-80a2f.up.railway.app

# Run the CLI
npm test
```

## Environment Variables for Testing

```bash
# Test against production
TEST_URL=https://web-production-80a2f.up.railway.app npm test

# Use custom phone number
TEST_PHONE=+15555551234 npm test

# Use custom name
TEST_USER_NAME="Alice Smith" npm test
```

## Troubleshooting

### Server not running
```
✗ Server not running at http://localhost:3000
  Start it with: npm run dev
```
**Solution**: Open another terminal and run `npm run dev`

### Redis connection failed
```
Redis Client Error: ECONNREFUSED
```
**Solution**: 
- Start Redis locally: `redis-server`
- Or update `.env` with Railway Redis URL

### Connection timeout
```
✗ Error: timeout of 30000ms exceeded
```
**Solution**: Check if server is actually processing messages. Look at server logs.

## Advanced Testing

### Test with Multiple Users
Open multiple terminals and run the CLI with different phone numbers:

```bash
# Terminal 1
TEST_PHONE=+15551111111 TEST_USER_NAME="Alice" npm test

# Terminal 2
TEST_PHONE=+15552222222 TEST_USER_NAME="Bob" npm test
```

### Test Message History
```bash
# Send several messages
> Hello
> I'm feeling anxious
> Can you help me?
> /history
```

### Test Proactive Messages
Check your server logs for scheduled proactive messages:
```bash
# In the server terminal, watch for:
# "Sending proactive message to +15551234567"
```

## Example Session

```
=== iMessage Mental Health Friend - Test CLI ===

Commands:
  /help           - Show this help message
  /react <emoji>  - Send a reaction
  /reset          - Start a new conversation
  /history        - Show message history
  /crisis         - Test crisis detection
  /journal        - Test journaling feature
  /quit           - Exit the CLI

Server: http://localhost:3000
Phone: +1234567890

✓ Server is running

You: Hey, I'm feeling really down today

[Sending message to http://localhost:3000]

Bot: Hey there! I'm really glad you reached out. Feeling down is tough, and I want you to know it's completely okay to feel this way.

What's been weighing on you today? I'm here to listen.

[Detected emotion: sad]

You: My girlfriend broke up with me yesterday

[Sending message to http://localhost:3000]

Bot: I'm so sorry you're going through this. Breakups are incredibly painful, and what you're feeling right now is completely valid.

Take your time processing this. Want to talk about what happened, or would you prefer to just sit with these feelings for now?

[Detected emotion: heartbroken]

You: /quit

Goodbye! 👋
```

## Tips

1. **Use realistic messages** - The AI works best with natural language
2. **Test edge cases** - Try empty messages, very long messages, special characters
3. **Monitor server logs** - Keep an eye on the server terminal for detailed logging
4. **Test crisis detection carefully** - Remember these are real crisis keywords
5. **Clean up test data** - Use "forget me" command to delete test data

## Notes

- The CLI simulates LoopMessage webhook payloads
- Responses come back synchronously in test mode (vs async in production)
- Test mode skips idempotency checks to allow message replay
- Crisis detection works the same as production
- Conversation history is stored in Redis just like real users

