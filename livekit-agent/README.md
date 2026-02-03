# ShoppingLens LiveKit Voice Agent

This is the LiveKit voice agent that provides voice chat interface for ShoppingLens. It uses Gemini (Live API) for voice and calls the backend ShoppingLens agent as a tool.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example` if available) with:
```
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash-exp
GEMINI_VOICE=Puck
BACKEND_AGENT_URL=http://localhost:8080
```

3. Make sure the backend agent is running on the URL specified in `BACKEND_AGENT_URL`.

## Running

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## How it works

1. The agent joins a LiveKit room (room name = session ID)
2. User speaks → STT converts to text
3. LLM decides if shopping agent tool should be called
4. Tool calls backend API (`/agent/:sessionId/pickup|question|buy|end`)
5. Backend returns `AgentPayload[]` array
6. Agent converts payloads to speech and speaks them via TTS

## Testing

To test, you'll need:
- A LiveKit server running
- The backend agent running
- A client that joins the same room

The agent will automatically join rooms and start listening for voice input.
