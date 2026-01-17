# shoppinglens

## Backend (prototype)

This repo now includes a TypeScript backend scaffold aligned with `Backend.md`.

### Quick start

```bash
npm install
npm run dev
```

### Endpoints

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

If you set LiveKit env vars, payloads are also published over LiveKit data channel to the room name matching `sessionId`:

```
LIVEKIT_HOST=https://<your-livekit-host>
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_DATA_TOPIC=shoppinglens (optional)
```

Overshoot tuning (optional):

```
OVERSHOOT_PICKUP_THRESHOLD=0.6
OVERSHOOT_DEBOUNCE_MS=1500
```
