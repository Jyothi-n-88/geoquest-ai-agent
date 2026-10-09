import { agentTools } from '../tools/declarations.js';
import { toolHandlers, buildGeoJSONFeatureCollection } from '../tools/handlers.js';
import { Route } from '../models/Route.js';
import { getDatabaseStatus } from '../config/db.js';

// Global staging store ensuring persistence across module reloads
if (!globalThis.__geoquest_staged_routes__) {
  globalThis.__geoquest_staged_routes__ = new Map();
}
export const stagedRoutesMemoryStore = globalThis.__geoquest_staged_routes__;

/**
 * Dynamically extract the core spatial intent and search query from user prompt.
 * Strips conversational filler like "find", "suggest", "spots", "near me", etc.
 */
export function extractSearchQuery(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'attractions';

  let cleaned = prompt
    .replace(/\b(can you|please|help me|find|suggest|search for|plan a|plan|curate|show me|discover|spots|places|trail|tour|walk|crawl)\b/gi, '')
    .replace(/\b(near me|nearby|around here|around me|close to me|in my area|close by)\b/gi, '')
    .replace(/\b(1-day|day trip|itinerary|with \d+ stops?|with \d+ curated spots?)\b/gi, '')
    .trim();

  // Strip leading/trailing punctuation and collapse multiple spaces
  cleaned = cleaned.replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '').replace(/\s+/g, ' ');

  return cleaned.length >= 2 ? cleaned : prompt;
}

/**
 * Helper to persist or stage route (MongoDB if online, Global Staging Memory if offline)
 */
async function stageRouteForApproval({ userPrompt, proposedRoute, thoughts }) {
  const dbStatus = getDatabaseStatus();
  const routePayload = {
    userPrompt,
    status: 'pending_approval',
    locations: proposedRoute.locations || [],
    geojson: proposedRoute.geojson || buildGeoJSONFeatureCollection(proposedRoute.locations || []),
    metadata: {
      totalDistanceKm: proposedRoute.totalDistanceKm || 0,
      estimatedDurationMinutes: proposedRoute.estimatedDurationMinutes || 0,
      weatherSummary: proposedRoute.weatherNote || '',
      agentThoughts: Array.isArray(thoughts) ? thoughts.join('\n---\n') : String(thoughts || ''),
      approvalNotes: '',
    },
  };

  if (dbStatus.isConnected) {
    try {
      const newRoute = new Route(routePayload);
      const saved = await newRoute.save();
      const obj = saved.toObject();
      stagedRoutesMemoryStore.set(saved._id.toString(), obj);
      return { routeId: saved._id.toString(), route: obj, storage: 'mongodb' };
    } catch (dbErr) {
      console.warn('⚠️ [GeoQuest Agent] Mongo write error, falling back to staging store:', dbErr.message);
    }
  }

  // Resilient memory staging fallback
  const mockId = `route_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const memoryDoc = {
    _id: mockId,
    ...routePayload,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  stagedRoutesMemoryStore.set(mockId, memoryDoc);
  return { routeId: mockId, route: memoryDoc, storage: 'in-memory-staging' };
}

/**
 * Deterministic ReAct cognitive runner (executes full tool pipeline if API key missing or transient API spike)
 * Dynamically queries OpenStreetMap / live handlers using the extracted user intent
 */
async function executeDeterministicReAct({ prompt, userCoordinates, thoughts, toolCallsMade, reason = '' }) {
  if (reason) {
    thoughts.push(`Reasoning Note: ${reason} - executing resilient ReAct spatial planning loop.`);
  }

  const isNearMe =
    /\b(near me|nearby|around here|around me|close to me|in my area|close by)\b/i.test(prompt);

  const cityMatch = prompt.match(/\b(bengaluru|bangalore|mumbai|delhi|mysuru)\b/i);

  // If user requested near me:
  // If userCoordinates are provided, use them directly; otherwise use default city
  const effectiveCoords = userCoordinates || (isNearMe ? [77.5946, 12.9716] : null);
  const targetCity = isNearMe
    ? (userCoordinates ? `Current GPS [${userCoordinates[0].toFixed(3)}, ${userCoordinates[1].toFixed(3)}]` : 'City Default (Proximity Fallback)')
    : cityMatch
    ? cityMatch[1]
    : 'Bengaluru';

  // DYNAMIC SEARCH QUERY: extracted directly from user prompt (no hardcoded 'heritage and cafe')
  const dynamicQuery = extractSearchQuery(prompt);

  thoughts.push(
    isNearMe
      ? `Spatial ReAct Goal: Proximity discovery for "${dynamicQuery}" around live coordinates [${effectiveCoords[0].toFixed(4)}, ${effectiveCoords[1].toFixed(4)}].`
      : `Spatial ReAct Goal: Discovering "${dynamicQuery}" in ${targetCity}.`
  );

  // Check if prompt specifically asks about weather
  const userAskedForWeather = /\b(weather|rain|temperature|forecast|sunny|cloudy|umbrella|climate)\b/i.test(prompt);

  // 1. Fetch Weather (OPTIONAL: only if user explicitly asks for weather)
  let weatherNote = 'Weather check not requested';
  if (userAskedForWeather) {
    const weatherRes = await toolHandlers.fetch_weather({
      city: isNearMe ? 'Current Location' : targetCity,
    });
    toolCallsMade.push({
      tool: 'fetch_weather',
      args: { city: isNearMe ? 'Current Location' : targetCity },
      output: weatherRes,
      id: `call_${Date.now()}_1`,
    });
    thoughts.push(`Observed Weather: ${weatherRes.condition}, ${weatherRes.temperatureC}°C (${weatherRes.recommendation})`);
    weatherNote = `${weatherRes.condition}, ${weatherRes.temperatureC}°C. ${weatherRes.recommendation}`;
  } else {
    thoughts.push('Skipping weather check (weather not explicitly requested by user).');
  }

  // 2. Search Places - Dynamic live search via OpenStreetMap Nominatim with real userLocation
  const placesRes = await toolHandlers.search_places({
    query: dynamicQuery,
    category: '',
    city: isNearMe ? '' : targetCity,
    userCoordinates: effectiveCoords,
    userLocation: effectiveCoords ? { lng: effectiveCoords[0], lat: effectiveCoords[1] } : null,
  });
  toolCallsMade.push({
    tool: 'search_places',
    args: {
      query: dynamicQuery,
      city: isNearMe ? '' : targetCity,
      userCoordinates: effectiveCoords,
      userLocation: effectiveCoords ? { lng: effectiveCoords[0], lat: effectiveCoords[1] } : null,
    },
    output: placesRes,
    id: `call_${Date.now()}_2`,
  });
  thoughts.push(
    `Identified ${placesRes.count} spatial waypoints for "${dynamicQuery}" (Source: ${placesRes.source || 'OpenStreetMap'}). Selecting optimal sequence.`
  );

  const selectedPlaces = placesRes.places.slice(0, 3);

  // 3. Calculate Route - Feeding discovered locations into route calculation
  const routeRes = await toolHandlers.calculate_route({ locations: selectedPlaces });
  toolCallsMade.push({
    tool: 'calculate_route',
    args: { locations: selectedPlaces },
    output: routeRes,
    id: `call_${Date.now()}_3`,
  });
  thoughts.push(`Calculated optimal spatial sequence: ${routeRes.totalDistanceKm} km, ~${routeRes.estimatedDurationMinutes} mins.`);

  // 4. Propose Itinerary (Human Oversight Gatekeeper)
  const proposalTitle = isNearMe
    ? `${dynamicQuery.charAt(0).toUpperCase() + dynamicQuery.slice(1)} Discovery Trail (Near Me)`
    : `${targetCity.charAt(0).toUpperCase() + targetCity.slice(1)}: ${dynamicQuery.charAt(0).toUpperCase() + dynamicQuery.slice(1)} Tour`;

  const proposalRes = await toolHandlers.propose_itinerary({
    title: proposalTitle,
    locations: selectedPlaces,
    totalDistanceKm: routeRes.totalDistanceKm,
    estimatedDurationMinutes: routeRes.estimatedDurationMinutes,
    weatherNote,
    agentReasoning: isNearMe
      ? `Curated an optimized exploration sequence for "${dynamicQuery}" around your active coordinates.`
      : `Organized an optimal trail from ${selectedPlaces[0]?.name || 'start'} to ${selectedPlaces[selectedPlaces.length - 1]?.name || 'finish'}.`,
  });
  toolCallsMade.push({
    tool: 'propose_itinerary',
    args: proposalRes,
    output: proposalRes,
    id: `call_${Date.now()}_4`,
  });
  thoughts.push('Human Oversight Gatekeeper: Packaging route into GeoJSON FeatureCollection and requesting user approval.');

  const staged = await stageRouteForApproval({
    userPrompt: prompt,
    proposedRoute: proposalRes,
    thoughts,
  });

  return {
    success: true,
    thoughts,
    toolCallsMade,
    proposedRoute: proposalRes,
    routeId: staged.routeId,
    status: 'requires_approval',
    message: 'Route proposal staged. Requires human confirmation before final database write.',
  };
}

/**
 * Execute Groq completions API call using native fetch
 */
async function callGroqChat({ apiKey, model, messages, tools, temperature = 0.2 }) {
  const payload = {
    model,
    messages,
    tools,
    tool_choice: 'auto',
    temperature,
  };

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'GeoQuest-Agent/1.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let retryAfterSeconds = null;
    const retryHeader = response.headers.get('retry-after');
    if (retryHeader) {
      retryAfterSeconds = parseFloat(retryHeader);
    }
    const match = errorText.match(/try again in ([0-9.]+)s/i);
    if (match && match[1]) {
      retryAfterSeconds = parseFloat(match[1]);
    }

    const err = new Error(`Groq API returned HTTP ${response.status}: ${errorText}`);
    err.status = response.status;
    err.retryAfter = retryAfterSeconds;
    throw err;
  }

  return await response.json();
}

/**
 * Execute Groq model call with transient error retry and exponential backoff
 */
async function callGroqWithBackoff(callFn, maxRetries = 2) {
  let attempt = 0;
  while (true) {
    try {
      return await callFn();
    } catch (err) {
      attempt++;
      const isTransient =
        err.status === 503 ||
        err.status === 429 ||
        err.status === 500 ||
        err.status === 502 ||
        String(err.message || '').includes('503') ||
        String(err.message || '').includes('429') ||
        String(err.message || '').includes('rate_limit') ||
        String(err.message || '').includes('UNAVAILABLE') ||
        String(err.message || '').includes('overloaded');

      const waitMatch = String(err.message || '').match(/try again in ([0-9.]+)s/i);
      const suggestedWait = err.retryAfter || (waitMatch ? parseFloat(waitMatch[1]) : null);

      if (isTransient && attempt <= maxRetries && (!suggestedWait || suggestedWait <= 4.0)) {
        const delayMs = suggestedWait
          ? Math.ceil(suggestedWait * 1000) + 700
          : Math.max(attempt * 2000, 2000);
        console.warn(`⚠️ [GeoQuest Agent] Groq API transient rate limit. Retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * POST /api/agent/command
 * Autonomous ReAct Cognitive Loop powered by Groq (Llama-3.3-70B)
 * Accepts prompt and userLocation { lat, lng } from request body
 */
export async function handleAgentCommand(req, res) {
  const { prompt, history = [], userLocation } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Prompt string is required in request body.',
    });
  }

  // Parse user coordinates [lng, lat]
  let userCoords = null;
  if (userLocation && typeof userLocation === 'object') {
    const lat = Number(userLocation.lat ?? userLocation.latitude);
    const lng = Number(userLocation.lng ?? userLocation.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      userCoords = [lng, lat]; // [longitude, latitude] GeoJSON format
    }
  }

  // Check if prompt contains proximity phrases like "near me", "nearby", "around here"
  const isNearMe =
    /\b(near me|nearby|around here|around me|close to me|in my area|close by)\b/i.test(prompt);

  const thoughts = [];
  const toolCallsMade = [];
  let proposedRoute = null;
  let stagedResult = null;

  const apiKey = process.env.GROQ_API_KEY;
  const isKeyConfigured = apiKey && !apiKey.includes('MY_GROQ_API_KEY') && apiKey.length > 10;

  // Primary model target: configured GROQ_MODEL or openai/gpt-oss-120b
  const primaryModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  // Available models to fall back on if primary model hits TPM limit
  const fallbackModels = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'].filter((m) => m !== primaryModel);

  // SYSTEM INSTRUCTION for GeoQuest ReAct Agent
  let systemInstruction = `You are GeoQuest, an elite Autonomous Spatial Planning ReAct Agent powered by Groq.
Your mission is to interpret user trip commands, reason about spatial constraints, and use function calling tools to assemble an optimal itinerary.

OPERATIONAL PROTOCOL (ReAct Loop):
1. Reason about user intent, target destination, theme, and time constraints.
2. OPTIONAL: Call 'fetch_weather' ONLY IF the user explicitly asks about weather, rain, temperature, or requests a weather-perfect day. If not mentioned, skip this step entirely.
3. Call 'search_places' to find relevant, curated spots with exact coordinates [lng, lat].
4. Call 'calculate_route' to compute transit distance, time, and assemble ordered waypoints.
5. Call 'propose_itinerary' to package the finalized GeoJSON and request Human Oversight approval. (If you skipped the weather check, simply pass "Weather check not requested" for the weatherNote parameter).
6. STRICT RULE: Every spatial itinerary write is irreversible and MUST conclude by invoking 'propose_itinerary' to trigger human approval. NEVER fabricate coordinates; always use search_places.
7. TOOL ARGS: Omit optional parameters if not available rather than passing null values.`;

  if (isNearMe || userCoords) {
    const coordsToUse = userCoords || [77.5946, 12.9716];
    systemInstruction += `\n8. PROXIMITY & "NEAR ME" DIRECTIVE: The user's active coordinates are [longitude: ${coordsToUse[0]}, latitude: ${coordsToUse[1]}].
The user prompt asks for spots 'near me', 'nearby', or 'around here'.
You MUST pass userCoordinates: [${coordsToUse[0]}, ${coordsToUse[1]}] to 'search_places' and leave the 'city' parameter blank so the system discovers venues situated directly around their live coordinates via OpenStreetMap instead of searching a hardcoded city center.
Then pass those discovered proximity waypoints into 'calculate_route' and 'propose_itinerary'.`;
  }

  if (!isKeyConfigured) {
    const fallbackResponse = await executeDeterministicReAct({
      prompt,
      userCoordinates: userCoords,
      thoughts,
      toolCallsMade,
      reason: 'GROQ_API_KEY not configured',
    });
    return res.json(fallbackResponse);
  }

  // --- Real Groq Function Calling Loop via Native Fetch ---
  try {
    const messages = [
      { role: 'system', content: systemInstruction },
    ];

    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-4);
      for (const h of recentHistory) {
        if (h.role && (h.content || h.parts)) {
          messages.push({
            role: h.role === 'model' ? 'assistant' : h.role,
            content: typeof h.content === 'string' ? h.content : (h.parts?.[0]?.text || ''),
          });
        }
      }
    }

    messages.push({ role: 'user', content: prompt });

    const maxIterations = 8;
    let iteration = 0;
    let finalMessage = '';
    let currentModel = primaryModel;

    while (iteration < maxIterations) {
      iteration++;

      let completion;
      try {
        // Execute with transient retry and exponential backoff
        completion = await callGroqWithBackoff(() =>
          callGroqChat({
            apiKey,
            model: currentModel,
            messages,
            tools: agentTools,
            temperature: 0.2,
          })
        );
      } catch (groqError) {
        const isRateLimit = groqError.status === 429 || String(groqError.message || '').includes('429');
        let fallbackSucceeded = false;

        // If rate limited, attempt fallback models before failing to deterministic
        if (isRateLimit && fallbackModels.length > 0) {
          for (const altModel of fallbackModels) {
            try {
              console.warn(`⚠️ [GeoQuest Agent] Model ${currentModel} rate limited. Switching to ${altModel}...`);
              currentModel = altModel;
              completion = await callGroqWithBackoff(() =>
                callGroqChat({
                  apiKey,
                  model: currentModel,
                  messages,
                  tools: agentTools,
                  temperature: 0.2,
                })
              );
              fallbackSucceeded = true;
              break;
            } catch (altErr) {
              console.warn(`⚠️ [GeoQuest Agent] Fallback model ${altModel} failed:`, altErr.message);
            }
          }
        }

        if (!fallbackSucceeded) {
          console.warn(`⚠️ [GeoQuest Agent] Groq call failed after retry (${groqError.message}). Fallback to resilient ReAct pipeline.`);
          const fallbackResponse = await executeDeterministicReAct({
            prompt,
            userCoordinates: userCoords,
            thoughts,
            toolCallsMade,
            reason: `Groq API temporary spike (${groqError.message})`,
          });
          return res.json(fallbackResponse);
        }
      }

      const choice = completion.choices?.[0];
      if (!choice || !choice.message) {
        break;
      }

      const assistantMessage = choice.message;

      if (assistantMessage.content) {
        thoughts.push(assistantMessage.content);
      }

      const toolCalls = assistantMessage.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        finalMessage = assistantMessage.content || 'Planning completed.';
        break;
      }

      // Append assistant message with tool calls to conversation history
      messages.push({
        role: 'assistant',
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      });

      for (const call of toolCalls) {
        const toolName = call.function.name;
        let toolArgs = {};
        try {
          toolArgs = typeof call.function.arguments === 'string'
            ? JSON.parse(call.function.arguments)
            : (call.function.arguments || {});
        } catch (parseErr) {
          console.warn(`Failed to parse arguments for tool ${toolName}:`, parseErr);
        }

        // Clean out any null fields from toolArgs so handlers receive clean input
        if (toolArgs && typeof toolArgs === 'object') {
          for (const key of Object.keys(toolArgs)) {
            if (toolArgs[key] === null) {
              delete toolArgs[key];
            }
          }
        }

        // If "near me" prompt or userCoords available, feed userCoordinates directly into search_places and override hardcoded city
        if (toolName === 'search_places') {
          if (isNearMe) {
            toolArgs.userCoordinates = userCoords || [77.5946, 12.9716];
            toolArgs.userLocation = userCoords ? { lng: userCoords[0], lat: userCoords[1] } : null;
            toolArgs.city = ''; // Prevent searching hardcoded city center
          } else if (userCoords && !toolArgs.userCoordinates) {
            toolArgs.userCoordinates = userCoords;
            toolArgs.userLocation = { lng: userCoords[0], lat: userCoords[1] };
          }
        }

        const handler = toolHandlers[toolName];

        let toolOutput;
        if (handler) {
          try {
            toolOutput = await handler(toolArgs);
          } catch (err) {
            toolOutput = { error: `Failed to execute ${toolName}: ${err.message}` };
          }
        } else {
          toolOutput = { error: `Unknown tool: ${toolName}` };
        }

        toolCallsMade.push({
          tool: toolName,
          args: toolArgs,
          output: toolOutput,
          id: call.id,
        });

        if (toolName === 'propose_itinerary') {
          proposedRoute = toolOutput;
        }

        // OpenAI/Groq standard tool response message
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(toolOutput),
        });
      }

      if (proposedRoute) {
        thoughts.push('Human Oversight Gatekeeper Activated: Staging proposed itinerary for user review.');
        break;
      }
    }

    if (proposedRoute) {
      stagedResult = await stageRouteForApproval({
        userPrompt: prompt,
        proposedRoute,
        thoughts,
      });
    }

    return res.json({
      success: true,
      thoughts,
      toolCallsMade,
      proposedRoute,
      routeId: stagedResult ? stagedResult.routeId : null,
      status: proposedRoute ? 'requires_approval' : 'completed',
      message: proposedRoute
        ? 'Route proposal staged. Requires human confirmation before final write.'
        : finalMessage || 'Agent completed reasoning.',
    });
  } catch (error) {
    console.error('❌ [GeoQuest Agent Fatal Error]:', error);
    const fallbackResponse = await executeDeterministicReAct({
      prompt,
      userCoordinates: userCoords,
      thoughts,
      toolCallsMade,
      reason: `Groq API temporary spike (${error.message})`,
    });
    return res.json(fallbackResponse);
  }
}

/**
 * POST /api/agent/approve
 * Human Oversight Confirmation Endpoint
 */
export async function handleAgentApproval(req, res) {
  const { routeId, action, notes = '' } = req.body;

  if (!routeId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: routeId',
    });
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'Action must be either "approve" or "reject"',
    });
  }

  const targetStatus = action === 'approve' ? 'approved' : 'rejected';
  const dbStatus = getDatabaseStatus();

  // 1. Try to find and update in MongoDB if connected
  if (dbStatus.isConnected) {
    try {
      const updatedRoute = await Route.findByIdAndUpdate(
        routeId,
        {
          $set: {
            status: targetStatus,
            'metadata.approvalNotes': notes,
            'metadata.approvedAt': new Date(),
          },
        },
        { new: true }
      );

      if (updatedRoute) {
        stagedRoutesMemoryStore.set(routeId, updatedRoute.toObject());
        return res.json({
          success: true,
          message: `Route successfully ${targetStatus}.`,
          route: updatedRoute,
          storage: 'mongodb',
        });
      }
    } catch (err) {
      console.warn('⚠️ [GeoQuest Approval] Mongo query failed, checking memory store:', err.message);
    }
  }

  // 2. Check global staging store
  const staged = stagedRoutesMemoryStore.get(routeId);
  if (!staged) {
    return res.status(404).json({
      success: false,
      error: `Route with ID "${routeId}" not found.`,
      availableRouteIds: Array.from(stagedRoutesMemoryStore.keys()),
    });
  }

  staged.status = targetStatus;
  staged.metadata = staged.metadata || {};
  staged.metadata.approvalNotes = notes;
  staged.metadata.approvedAt = new Date();
  staged.updatedAt = new Date();
  stagedRoutesMemoryStore.set(routeId, staged);

  return res.json({
    success: true,
    message: `Route successfully ${targetStatus} (Human Oversight Confirmed).`,
    route: staged,
    storage: 'in-memory-staging',
  });
}
