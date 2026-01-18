# Testing the LiveKit Voice Agent

## Prerequisites

1. **Backend agent running**: Start the backend on port 8080
   ```bash
   cd backend
   npm run dev
   ```

2. **LiveKit server**: You need a LiveKit server running. You can:
   - Use LiveKit Cloud (free tier available)
   - Run LiveKit server locally via Docker
   - Use a self-hosted instance

3. **Environment variables**: Set up `.env` in `livekit-agent/` with:
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - `OPENAI_API_KEY` (for STT/LLM/TTS)
   - `BACKEND_AGENT_URL=http://localhost:8080`

## Manual Testing Steps

### 1. Start the LiveKit Agent

```bash
cd livekit-agent
npm install
npm run dev
```

The agent will start and wait for rooms to be assigned.

### 2. Create a Test Room

You can use the LiveKit CLI or create a room via API:

```bash
# Using LiveKit CLI (if installed)
livekit-cli create-room test-session-123
```

Or use the LiveKit REST API to create a room named `test-session-123`.

### 3. Join the Room with a Client

You can use:
- LiveKit's web demo client
- A mobile app
- Or create a simple test client

The room name should match the `sessionId` you want to use.

### 4. Test Voice Interactions

Once connected, try speaking:

- **Pickup**: "I just picked up a Sony WH-1000XM5 headphone"
- **Question**: "Is this a good price?"
- **Buy**: "I want to buy this product"
- **End**: "End the session"

The agent should:
1. Convert your speech to text (STT)
2. Decide to call the shopping agent tool
3. Call the backend API
4. Receive AgentPayload responses
5. Speak the results back (TTS)

## Expected Behavior

- **Pickup**: Should trigger research and return ShoppingSummary
- **Question**: Should return updated research/summary based on the question
- **Buy**: Should attempt purchase and return confirmation
- **End**: Should end the session gracefully

## Troubleshooting

- Check backend logs to see if API calls are received
- Check LiveKit agent logs for tool calls and responses
- Verify OpenAI API key is valid
- Ensure backend is accessible from the agent (check `BACKEND_AGENT_URL`)

## Automated Testing (Future)

For automated testing, you could:
1. Mock the LiveKit room
2. Send test transcripts directly to the agent
3. Verify tool calls and responses

This would require additional test infrastructure.
