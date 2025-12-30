# Manual Test Cases

## Pre-Testing Setup

1. Ensure Redis is running locally or configure `REDIS_URL`
2. Configure `.env` with required API keys
3. Run `npm run verify` to test connections
4. Start server with `npm start`

## Test Categories

### 1. New User Onboarding

| Test | Steps | Expected Result |
|------|-------|-----------------|
| First message welcome | Send first message to new number | Receive welcome message + response |
| Name extraction | After 2-3 messages, send just your name | Bot acknowledges name, stores it |
| Progressive onboarding | Continue chatting 5-10 messages | Bot asks about preferences at stages |

### 2. Crisis Detection

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Keyword detection | Send "I want to kill myself" | Immediate crisis resources provided |
| High-risk detection | Send "I've been having dark thoughts" | Supportive response + resources |
| LLM assessment | Send vague distress signals | Appropriate risk assessment |
| False positive check | Send "I killed it at work today" | Normal response, no crisis trigger |

### 3. Journaling

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Journal entry | Send "j: I feel grateful today" | Acknowledgment, entry saved |
| Journal prefix | Send "journal: Had a rough day" | Acknowledgment, entry saved |
| Journal retrieval | Check Redis for journal entries | Entries stored correctly |

### 4. Message Reactions

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Positive reaction | React with ❤️ to bot message | Sometimes get acknowledgment |
| Sad reaction | React with 😢 to bot message | Offered to talk more |
| Reaction storage | Check Redis after reaction | Reaction stored in history |

### 5. Voice Messages

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Voice message | Send voice message | Acknowledgment about voice support |

### 6. Proactive Messaging

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Schedule setup | Complete onboarding with check-in opt-in | Schedule created in Redis |
| Leader election | Check Redis for leader lock | Lock acquired by one process |

### 7. Commands

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Help command | Send "help" | List of available commands |
| Stop command | Send "stop" | Check-ins paused, confirmation |
| Resume command | Send "resume" | Check-ins resumed, confirmation |
| Forget me | Send "forget me" | All data deleted, confirmation |
| Crisis resources | Send "resources" | Crisis hotlines displayed |

### 8. Error Handling

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Redis disconnect | Stop Redis, send message | Graceful error, fallback response |
| Claude timeout | Simulate timeout | Fallback response sent |
| Invalid webhook | Send malformed webhook | 400/401 response |

### 9. Edge Cases

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Empty message | Send empty string | Handled gracefully |
| Very long message | Send >2000 character message | Message processed correctly |
| Rapid messages | Send 5+ messages quickly | All processed, no duplicates |
| Special characters | Send emojis, unicode | Handled correctly |
| Duplicate webhook | Replay same webhook | Idempotency check blocks duplicate |

## API Endpoint Tests

### Health Check
```bash
curl http://localhost:3000/health
# Expected: {"status":"healthy",...}

curl http://localhost:3000/health/detailed
# Expected: Detailed health info with Redis latency
```

### Webhook (Simulated)
```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-123",
    "sender": "+15551234567",
    "text": "Hello, I need someone to talk to"
  }'
# Expected: {"status":"received"}
```

## Redis Key Verification

After tests, verify these keys exist in Redis:

```bash
redis-cli keys "user:*"
redis-cli keys "conversations:*"
redis-cli keys "scheduled:*"
redis-cli keys "journal:*"
redis-cli keys "crisis:*"
redis-cli keys "idempotency:*"
```

## Performance Benchmarks

| Metric | Target |
|--------|--------|
| Message response time | < 3 seconds |
| Health check response | < 100ms |
| Redis operations | < 50ms each |
| Claude API calls | < 5 seconds |

## Production Readiness Checklist

- [ ] All tests pass locally
- [ ] Environment variables configured
- [ ] Health check returns healthy
- [ ] Redis connection stable
- [ ] Claude API verified
- [ ] LoopMessage API verified
- [ ] Webhook URL configured
- [ ] Error logging working
- [ ] Rate limiting active
- [ ] Crisis detection working

## Notes

- Always test crisis detection with care - ensure resources are correct
- Test with real iMessage only after all local tests pass
- Monitor Railway logs during production testing
- Keep crisis logs for 90 days per policy

