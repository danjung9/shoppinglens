# **Backend.md — Agentic Video-to-Product Intelligence (LiveKit \+ Overshoot)**

## **1\) Goal**

Transform a continuous live video stream into a real-time, interactive **product research and decision-support experience**.

When a user picks up an item, the system:

* Detects the interaction from video  
* Researches the product on the web  
* Presents structured results (image, price, alternatives)  
* Generates an AI-written summary and recommendations  
* Allows the user to continue asking questions until the session ends

**End-to-end:**  
`Live video → Overshoot (pickup detection) → Agent (web research + reasoning) → Frontend → User`

---

## **2\) System Overview**

### **2.1 Core Components**

1. **LiveKit Session Service**  
   * Hosts the live camera experience.  
   * Streams video and user interaction data.  
   * Pushes real-time agent outputs to the frontend.  
2. **Overshoot Vision Service**  
   * Observes the video stream.  
   * Detects when an item is picked up.  
   * Produces a *search seed* (not an authoritative product description).  
3. **Agent Orchestrator**  
   * Performs web research based on Overshoot’s search seed.  
   * Extracts prices, specs, images, and alternatives.  
   * Produces both structured research data and an AI-written summary.  
   * Handles user follow-up questions in the same product thread.  
4. **Session & Conversation State**  
   * Maintains context per LiveKit session.  
   * Tracks the active product and conversation history.  
   * Supports looping interactions until the user ends the session or picks up a new item.

---

## **3\) Data Flow**

### **3.1 High-Level Flow**

1. User joins LiveKit room and starts camera  
2. Frames are sampled and sent to Overshoot  
3. Overshoot detects a pickup event  
4. Overshoot emits a **product search seed**  
5. Agent performs web research using internal tools  
6. Backend streams research results \+ AI summary to frontend  
7. User may ask follow-up questions or pick up another item  
8. Loop continues until user ends the conversation

---

## **4\) Backend Services**

### **4.1 LiveKit Service (Streaming Layer)**

**Responsibilities**

* Manage room lifecycle.  
* Receive video and user messages.  
* Stream agent outputs to frontend in real time.

**Outputs**

* Video frames to Overshoot  
* Agent messages (research \+ AI summaries) to frontend

---

### **4.2 Overshoot Service (Vision Intelligence)**

**Responsibilities**

* Detect item pickup events.  
* Extract visual hints to guide product search.

**Important Constraint**  
Overshoot **does not** provide the final product description.  
It only provides **search seeds** derived from vision.

**Output Schema**

```json
{
  "event_id": "uuid",
  "event_type": "PICKUP_DETECTED",
  "confidence": 0.0,
  "frame_ref": "s3://.../best_frame.jpg",
  "search_seed": {
    "visible_text": ["string"],
    "brand_hint": "string",
    "category_hint": "string",
    "visual_description": "string"
  }
}
```

**Trigger Policy**

* Emit only when confidence exceeds threshold  
* Debounce repeated detections of the same object

---

### **4.3 Agent Orchestrator (Web Research \+ Reasoning)**

**Responsibilities**

* Convert the search seed into a concrete product query.  
* Perform web research using internal tools.  
* Extract structured, citeable product information.  
* Generate an AI-written summary and recommendations.  
* Answer user follow-up questions within the same context.

---

## **5\) Agent Tool Layer (No MCP)**

The agent calls backend-owned tools that return structured JSON.

### **Available Tools**

* `search_web(query)`  
* `fetch_page(url)`  
* `extract_product_fields(html)`  
* `compare_products(product_a, product_b)`  
* `buy_item(product_id)` (optional)

These tools are internal and deterministic; the agent only reasons over their outputs.

---

## **6\) Agent Outputs (Frontend Contracts)**

### **6.1 Research Results Payload**

Designed for UI rendering and inspection.

```json
{
  "type": "ResearchResults",
  "session_id": "uuid",
  "thread_id": "uuid",
  "query": "string",
  "top_match": {
    "title": "string",
    "image_url": "string",
    "price": { "amount": 0.0, "currency": "USD" },
    "specs": [{ "key": "string", "value": "string" }],
    "source_url": "string"
  },
  "alternatives": [
    {
      "title": "string",
      "price": { "amount": 0.0, "currency": "USD" },
      "image_url": "string",
      "reason": "string"
    }
  ]
}
```

---

### **6.2 AI Summary Payload**

Natural-language reasoning and guidance.

```json
{
  "type": "AISummary",
  "session_id": "uuid",
  "thread_id": "uuid",
  "summary": "string",
  "pros": ["string"],
  "cons": ["string"],
  "best_for": ["string"]
}
```

---

## **7\) Interaction Loop (Conversation Lifecycle)**

### **7.1 Loop Triggers**

* New pickup detected  
* User asks a question  
* User requests a comparison  
* User calls `buy_item()`  
* User explicitly ends the conversation

### **7.2 Threading Model**

* `session_id`: LiveKit room  
* `thread_id`: active product  
* New pickup starts a new thread automatically

### **7.3 Stop Conditions**

* User says “stop” / “end”  
* New item replaces the current thread  
* Idle timeout

---

## **8\) Real-Time Delivery to Frontend**

* Primary transport: **LiveKit Data Channel**  
* Messages are incremental and patchable  
* Research results may arrive before AI summary

---

## **9\) Reliability & Safety**

* Rate-limited inference and research  
* Clear confidence signaling when product match is uncertain  
* Source URLs preserved for transparency

---

## **10\) Minimal Event Sequence**

1. Video stream active  
2. Overshoot detects pickup  
3. Agent performs web research  
4. Research results streamed to UI  
5. AI summary streamed to UI  
6. User asks follow-up questions  
7. User ends session or picks up new item

