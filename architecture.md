# ShoppingLens Architecture Decision

## Summary
This system separates vision (Overshoot) from voice (LiveKit). The frontend detects pickup events and provides a structured search seed. The backend (LangGraph) uses that seed to research products and generate summaries. LiveKit is a voice interface that forwards user questions to the backend and speaks responses.

## Components
- **Frontend + Overshoot**
  - Captures camera input.
  - Detects pickup events.
  - Extracts product details (visible text, brand, category, visual description).
  - Sends pickup payloads to backend.
- **Backend (Express + LangGraph)**
  - Receives pickup events and questions.
  - Builds a query from the search seed.
  - Runs research and summary generation.
  - Returns `AgentPayload[]` responses.
- **LiveKit Agent**
  - Provides voice I/O.
  - Forwards questions (and optional pickup events) to backend.
  - Speaks backend responses.

## Data Flow
1. **Pickup detected (Frontend)** → `POST /agent/:sessionId/pickup`
2. **LangGraph orchestrator** builds query and runs research.
3. **Backend returns** `ResearchResults` + `ShoppingSummary`.
4. **LiveKit agent** speaks the results to the user.
5. **Follow-up question (Voice)** → `POST /agent/:sessionId/question`

```mermaid
flowchart LR
  User((User)) -->|Voice| LiveKit[LiveKit Agent]
  User -->|Camera| Overshoot[Frontend + Overshoot]
  Overshoot -->|Pickup event + search_seed| Backend[Backend (Express + LangGraph)]
  LiveKit -->|Question / pickup| Backend
  Backend -->|AgentPayload[]| LiveKit
  LiveKit -->|Spoken response| User
```

## Session Identity
Use the same `sessionId` across:
- LiveKit room name
- Overshoot pickup event payloads
- Backend session/thread store

This ensures the voice agent and pickup context stay aligned.

## Why Not LiveKit Camera
LiveKit camera is optional. The current design already gets vision data from the frontend via Overshoot. Unless you want the voice agent to process video directly, it is simpler to keep vision in the frontend and only send structured pickup data to the backend.

## Recommended Design
- **Frontend handles vision** and sends pickup events.
- **Backend handles reasoning** and returns structured payloads.
- **LiveKit handles voice** and forwards questions to the backend.


'''
WSS URL
wss://nexhacks-07gb3407.livekit.cloud
Room Token
eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6eyJyb29tIjoidGVzdC1yb29tLTUiLCJyb29tSm9pbiI6dHJ1ZSwiY2FuUHVibGlzaCI6dHJ1ZSwiY2FuU3Vic2NyaWJlIjp0cnVlLCJjYW5QdWJsaXNoRGF0YSI6dHJ1ZX0sImlzcyI6IkFQSTdQS1VWaENVTkFLUSIsImV4cCI6MTc2ODcyNDkyNywibmJmIjowLCJzdWIiOiJraG9hIn0.ZujIoe0Kh7j16Ly-55Yto70Qz_Okm64VClY9zp3TTaU
'''