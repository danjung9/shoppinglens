# shoppinglens

## Backend (prototype)

This repo now includes a TypeScript backend scaffold aligned with `Backend.md`.

### Quick start

```bash
npm install
npm run dev
```

### Live video test

1) Fill `backend/.env` with Overshoot API values.
2) Run the server.
3) Open `http://localhost:8080/` in your browser.
4) Click **Start Camera** and watch the live logs. (The test page loads the SDK from a CDN.)

### Endpoints

- `GET /overshoot/config` (returns Overshoot config from env)
- `POST /sessions/:sessionId/overshoot` (pickup event payload)
- `POST /sessions/:sessionId/overshoot/result` (Overshoot SDK result payload)
- `POST /webhooks/overshoot` `{ "session_id": "...", "event": { ...pickupEvent } }`
- `POST /sessions/:sessionId/question` `{ "question": "..." }`
- `POST /sessions/:sessionId/buy` `{ "product_id": "..." }`
- `POST /sessions/:sessionId/end`
- `GET /health`

### Streaming

Connect to `ws://localhost:8080/ws?sessionId=YOUR_SESSION_ID` to receive `ResearchResults` and `AISummary` payloads.

### Overshoot SDK -> Backend

The backend accepts raw Overshoot `onResult` output at:

`POST /sessions/:sessionId/overshoot/result`

Body shape (example):

```json
{
  "result": "{\"pickup_detected\":true,\"confidence\":0.92,\"visible_text\":[\"Acme\"],\"brand_hint\":\"Acme\",\"category_hint\":\"mug\",\"visual_description\":\"white ceramic mug\"}"
}
```

If you already parse JSON on the client, send the object directly as `result`.

### Overshoot Config

Provide the Overshoot API details via env and fetch them from the client:

```
GET /overshoot/config
```

Response:

```json
{
  "api_url": "https://cluster1.overshoot.ai/api/v0.2",
  "api_key": "...",
  "model": "...",
  "prompt": "..."
}
```
If you set LiveKit env vars, payloads are also published over LiveKit data channel to the room name matching `sessionId`:

```
LIVEKIT_HOST=https://<your-livekit-host>
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_DATA_TOPIC=shoppinglens (optional)
LIVEKIT_INPUT_TOPIC=questions (optional)
LIVEKIT_LISTENER_ENABLED=true (optional)
LIVEKIT_LISTENER_IDENTITY_PREFIX=shoppinglens-backend (optional)
LIVEKIT_LISTENER_NAME=ShoppingLens Backend (optional)
```

### LiveKit questions (data channel)

If LiveKit env vars are set, the backend will join any room after the first pickup and listen for data messages.
Send JSON like:

```json
{ "type": "question", "question": "Is this sugar free?" }
```

If you set `LIVEKIT_INPUT_TOPIC`, the backend will only accept messages on that topic.

### LiveKit voice agent (worker + dispatch)

This repo includes a LiveKit Agents worker at `backend/src/agent/agent.ts`. Run it in a
separate process, and the backend will dispatch it into the room after pickup.

```bash
cd backend
pnpm install
pnpm run agent
```

Env (agent + dispatcher):

```
LIVEKIT_AGENT_ENABLED=true
LIVEKIT_AGENT_NAME=shoppinglens-voice-agent (optional)
LIVEKIT_AGENT_LLM_MODEL=openai/gpt-4.1-mini (optional)
LIVEKIT_AGENT_STT_MODEL=assemblyai/universal-streaming:en (optional)
LIVEKIT_AGENT_TTS_MODEL=cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc (optional)
LIVEKIT_AGENT_INSTRUCTIONS="You are ShoppingLens, a concise in-room voice assistant for shoppers." (optional)
LIVEKIT_AGENT_GREETING= (optional)
```

The backend uses `LIVEKIT_AGENT_NAME` when calling the Agent Dispatch API, so the worker and
backend must match on the same name.

### Barebones LiveKit frontend

Open `http://localhost:8080/voice-test.html` to join a room, enable mic, and trigger a pickup
event that dispatches the agent into the room.

By default, the agent uses LiveKit Cloud inference. If you need separate inference credentials:

```
LIVEKIT_INFERENCE_API_KEY=...
LIVEKIT_INFERENCE_API_SECRET=...
LIVEKIT_INFERENCE_URL=https://agent-gateway.livekit.cloud/v1 (optional)
```

Overshoot tuning (optional):

```
OVERSHOOT_PICKUP_THRESHOLD=0.6
OVERSHOOT_DEBOUNCE_MS=1500
```
