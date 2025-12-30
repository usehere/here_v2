# iMessage Mental Health Friend

An iMessage-based mental health companion that provides supportive conversations, journaling, and proactive check-ins.

## Features

- **Conversational Support**: AI-powered friend that remembers past conversations
- **Crisis Detection**: Two-layer safety system with keyword matching and LLM analysis
- **Journaling**: Free-form and prompted journaling via messages
- **Proactive Check-ins**: Time-based, emotional state-based, and inactivity-based outreach
- **Progressive Onboarding**: Natural, non-intrusive user onboarding
- **Message Reactions**: Contextual responses to user reactions

## Tech Stack

- **Server**: Express.js (Node.js) on Railway
- **LLM**: Claude API (Anthropic)
- **Database**: Redis (Railway)
- **iMessage**: LoopMessage API
- **Scheduler**: node-cron with leader election

## Setup

### Prerequisites

- Node.js >= 18.0.0
- Redis (local or Railway)
- LoopMessage API account
- Anthropic API key

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd imessage-mental-health-friend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` file with your API keys

5. Verify connections:
   ```bash
   npm run verify
   ```

6. Start the server:
   ```bash
   npm start
   ```

### Railway Deployment

1. Push to GitHub
2. Create Railway project and connect repo
3. Add Redis database in Railway
4. Configure environment variables
5. Generate public domain
6. Configure LoopMessage webhook to: `https://your-app.up.railway.app/webhook/message`

## API Endpoints

- `GET /health` - Health check
- `POST /webhook/message` - Receive messages from LoopMessage
- `POST /webhook/status` - Message delivery status
- `POST /webhook/reaction` - Message reactions

## Safety

This app includes important safety features:
- Crisis detection with immediate resource provision
- Clear disclaimers that this is not therapy
- Crisis hotline information (988 in US)
- Data privacy and encryption

## Disclaimer

This is a supportive friend, not a licensed therapist. It is not a replacement for professional mental health care. If you're in crisis, please call 988 (US) or your local emergency number.

## License

MIT

