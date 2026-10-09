# GeoQuest — Autonomous Spatial Planning ReAct Agent

> **Production-grade Autonomous Spatial Planning Agent** that translates natural language multi-stop travel requests into verified, weather-aware, interactive geospatial itineraries using the **ReAct (Reasoning + Acting)** paradigm.

---

## 1. Problem Statement & Core Innovation

Traditional navigation tools require users to manually search individual destinations, independently verify opening hours and meteorological forecasts, and manually assemble coordinates into arbitrary sequences.

**GeoQuest** automates this spatial planning workflow into an autonomous, closed-loop agent:
* **Natural Language Spatial Disambiguation:** Understands multi-intent prompts (e.g., *"Find 4 cafes and historic parks near me"*).
* **Multi-Tool Autonomous Execution:** Calls real-time geocoding, meteorological telemetry, and POI services to retrieve ground-truth coordinates `[longitude, latitude]`.
* **Proximity-First Routing:** Enforces strict Haversine distance computations to filter and sort candidate venues relative to user live GPS coordinates.
* **Human-in-the-Loop Governance:** Restricts irreversible database mutations behind explicit user confirmation while staging interactive GeoJSON previews.

---

## 2. Architecture & ReAct Pipeline

GeoQuest combines Large Language Model function calling (**Groq Llama-3.3-70B** / **Google Gemini**) with resilient deterministic fallback execution.

```
[User Query + Live GPS]
          │
          ▼
   [Express Server]
          │
          ▼
   [ReAct Engine] ◄──────────────┐
          │                      │
    ┌─────┴────────────────┐     │ (Multi-Turn Observation)
    ▼                      ▼     │
[fetch_weather]    [search_places]
                           │
                 [Haversine Sort]
                           │
          ┌────────────────┘
          ▼
[Staged Itinerary (pending_approval)]
          │
    ┌─────┴────────────────┐
    ▼                      ▼
[Mapbox / MapLibre]  [Human Approval Gate]
                           │ (Approved)
                           ▼
                  [MongoDB Atlas Store]
```

### The ReAct Execution Loop
1. **Thought:** Decomposes user query into destination constraints, category filters, and geographic bounding boxes.
2. **Action (`search_places`):** Queries OpenStreetMap Nominatim and curated spatial datasets for candidate waypoints with coordinates.
3. **Action (`fetch_weather`):** Conditionally retrieves temperature and atmospheric conditions for outdoor activities, avoiding redundant queries for indoor venues.
4. **Observation:** Parses coordinates, ratings, and distance deltas back into agent context.
5. **Final Output:** Synthesizes an ordered GeoJSON `FeatureCollection` staged in memory.

### Resilient Deterministic Fallback Engine
If external LLM APIs experience rate limits (HTTP 429), quotas, or transient network timeouts, GeoQuest automatically switches to its **Deterministic ReAct Spatial Planner**:
* Parses location entities and keywords directly from the prompt.
* Directly executes live tool handlers (`search_places`, `fetch_weather`, and Haversine distance sorting).
* Generates identical GeoJSON FeatureCollections without service interruption.

---

## 3. Live Geolocation & Haversine Proximity Sorting

### Live GPS Integration
* Accesses browser `navigator.geolocation.getCurrentPosition` with high accuracy mode.
* Falls back gracefully to Bengaluru centroid `[77.5946, 12.9716]` when permissions are denied.
* Renders real-time user location with animated pulse indicators and a **"Center My GPS"** camera fly-to trigger (`zoom: 14`).

### Strict Proximity Sorting Algorithm
To prevent distant landmarks from appearing in local searches, GeoQuest calculates great-circle distance via the Haversine formula:

$$\Delta\sigma = 2 \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$

```javascript
// Strict ascending sort ensuring absolute nearest POIs appear first
results.sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm);
return results.slice(0, 5); // Nearest matches only
```

### On-Demand Reverse Geocoding
Clicking any waypoint marker on the WebGL map sends an asynchronous reverse-geocoding request to OpenStreetMap Nominatim (`/reverse?lat={lat}&lon={lon}`), dynamically presenting verified street addresses instead of raw numbers.

---

## 4. Human Oversight Gatekeeper

GeoQuest implements a strict human-in-the-loop governance mechanism to ensure safety and prevent unverified database corruption:

```
[Agent Generates Route] ──► [Status: pending_approval]
                                    │
                                    ├── Staged in Global In-Memory Store
                                    ├── Visualized on WebGL Canvas (fitBounds)
                                    ▼
                          [User Review in Terminal]
                           ┌────────┴────────┐
                           ▼                 ▼
                      [Approve]           [Reject]
                           │                 │
             POST /api/agent/approve    Discard route
                           │
                           ▼
          [Persisted to MongoDB Atlas]
          [Status: approved]
```

1. **Pre-Commit Staging:** Generated itineraries receive `status: "pending_approval"` and are rendered as interactive vector layers.
2. **Explicit User Signature:** The user reviews waypoints, weather advisories, and path metrics before authorizing.
3. **Database Write:** Only upon explicit user approval via `POST /api/agent/approve` is the document permanently committed to MongoDB Atlas.

---

## 5. Tech Stack & Cloud Deployment

| Layer | Technologies | Role |
| :--- | :--- | :--- |
| **Frontend** | React 19, Tailwind CSS v4, Lucide Icons | Responsive spatial terminal & approval interface |
| **Mapping Engine** | Mapbox GL JS v3, MapLibre GL v6, Carto Dark | High-performance WebGL vector tile rendering |
| **Backend** | Node.js 22, Express 4, TypeScript (TSX) | RESTful ReAct agent orchestrator & tool execution |
| **Database** | MongoDB Atlas, Mongoose 9 ODM | Persistent storage with global in-memory staging fallback |
| **AI & NLP** | Groq (`llama-3.3-70b-versatile`), Google Gemini API | Multi-turn reasoning and tool function calling |
| **Deployment** | Google Cloud Run / Render | Containerized full-stack deployment (`npm start`) |

---

## 6. Core API Reference

### `POST /api/agent/command`
Executes autonomous spatial planning for a user prompt.
* **Payload:**
  ```json
  {
    "prompt": "Find 3 cafes and parks near me",
    "userCoordinates": [77.5946, 12.9716]
  }
  ```
* **Response:** Returns `routeId`, `status: "pending_approval"`, `proposedRoute` (with GeoJSON), `thoughts`, and `toolCalls`.

### `POST /api/agent/approve`
Authorizes and commits a staged route to the permanent database.
* **Payload:**
  ```json
  {
    "routeId": "route_171266...",
    "approved": true,
    "notes": "Verified waypoints and transit distance"
  }
  ```
* **Response:** Returns `status: "approved"` and confirmed database record.

### `GET /api/agent/routes`
Lists saved itineraries with optional `?status=approved` filter.

---

## 7. Code Quality, Security & Efficiency Matrix

* **Code Quality:** Strict TypeScript typing (`tsc --noEmit`), modular MVC structure, and comprehensive error handling.
* **Security:** API keys strictly isolated server-side. Coordinates validated within standard geographic bounds ($[-180, 180]$ longitude, $[-90, 90]$ latitude).
* **Efficiency:** Memoized map markers, debounced GPS listeners, conditional weather tool querying, and sub-50ms deterministic fallbacks.
* **Accessibility:** Semantic HTML5, high-contrast dark theme (Slate 900 / Cyan), and keyboard-navigable controls.

---

## 8. Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional, app runs with built-in fallbacks)
# PORT=3000
# MONGODB_URI=mongodb+srv://...
# GROQ_API_KEY=gsk_...

# 3. Start development server
npm run dev
```
Open `http://localhost:3000` to interact with GeoQuest.
