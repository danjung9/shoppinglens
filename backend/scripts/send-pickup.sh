#!/usr/bin/env bash
set -euo pipefail

session_id="${1:-demo}"

curl -X POST "http://localhost:8080/sessions/${session_id}/overshoot" \
  -H "Content-Type: application/json" \
  -d "{\"event_id\":\"evt-1\",\"event_type\":\"PICKUP_DETECTED\",\"confidence\":0.92,\"frame_ref\":\"s3://mock/frame.jpg\",\"search_seed\":{\"visible_text\":[\"Acme\",\"Ceramic Mug\"],\"brand_hint\":\"Acme\",\"category_hint\":\"mug\",\"visual_description\":\"white ceramic mug\"}}"
