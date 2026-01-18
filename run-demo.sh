#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/khoadangnguyen/Desktop/shoppinglens"
ROOM="${ROOM:-test-room-5}"
PARTICIPANT="${PARTICIPANT:-khoa}"
AGENT_NAME="${AGENT_NAME:-shoppinglens}"

echo "Starting backend..."
cd "$ROOT/backend"
npm run dev >/tmp/shoppinglens-backend.log 2>&1 &
BACKEND_PID=$!

sleep 2
echo "Starting LiveKit agent..."
cd "$ROOT/livekit-agent"
npm run dev >/tmp/shoppinglens-agent.log 2>&1 &
AGENT_PID=$!

sleep 3
echo "Dispatching agent to room..."
curl -s -X POST "http://localhost:8080/livekit/dispatch" \
  -H "Content-Type: application/json" \
  -d "{\"room\":\"${ROOM}\",\"agentName\":\"${AGENT_NAME}\"}" | python3 -m json.tool

echo "Generating token..."
curl -s "http://localhost:8080/livekit/token?room=${ROOM}&participant=${PARTICIPANT}" | python3 -m json.tool

echo ""
echo "Backend log: /tmp/shoppinglens-backend.log"
echo "Agent log:   /tmp/shoppinglens-agent.log"
echo ""
echo "Use the token above in https://agents-playground.livekit.io"
echo "To stop: kill $BACKEND_PID $AGENT_PID"
