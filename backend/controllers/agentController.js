import { GoogleGenAI } from '@google/genai';
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

  thoughts.push(
    isNearMe
      ? `Spatial ReAct Goal: Proximity discovery requested ("near me"). Anchoring search to coordinates: [${effectiveCoords[0]}, ${effectiveCoords[1]}].`
      : `Spatial ReAct Goal: Planning itinerary for destination "${targetCity}".`
  );

  // 1. Fetch Weather
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

  // 2. Search Places - Feeding userCoordinates directly rather than a hardcoded city center
  const placesRes = await toolHandlers.search_places({
    query: prompt,
    category: '',
    city: isNearMe ? '' : targetCity,
    userCoordinates: effectiveCoords,
  });
  toolCallsMade.push({
    tool: 'search_places',
    args: {
      query: prompt,
      city: isNearMe ? '' : targetCity,
      userCoordinates: effectiveCoords,
    },
    output: placesRes,
    id: `call_${Date.now()}_2`,
  });
  thoughts.push(
    isNearMe && effectiveCoords
      ? `Located ${placesRes.count} venues situated within immediate proximity of coordinates [${effectiveCoords[0].toFixed(4)}, ${effectiveCoords[1].toFixed(4)}].`
      : `Identified ${placesRes.count} candidate waypoints in ${targetCity}. Selecting optimal stops.`
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
    ? 'Local Proximity Discovery Trail (Near Me)'
    : `${targetCity.charAt(0).toUpperCase() + targetCity.slice(1)} Curated Spatial Tour`;

  const proposalRes = await toolHandlers.propose_itinerary({
    title: proposalTitle,
    locations: selectedPlaces,
    totalDistanceKm: routeRes.totalDistanceKm,
    estimatedDurationMinutes: routeRes.estimatedDurationMinutes,
    weatherNote: `${weatherRes.condition}, ${weatherRes.temperatureC}°C.`,
    agentReasoning: isNearMe
      ? `Curated an optimized walking and exploration loop relative to your current coordinates.`
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
 * POST /api/agent/command
 * Autonomous ReAct Cognitive Loop
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

  const apiKey = process.env.GEMINI_API_KEY;
  const isKeyConfigured = apiKey && !apiKey.includes('MY_GEMINI_API_KEY') && apiKey.length > 10;

  // SYSTEM INSTRUCTION for GeoQuest ReAct Agent
  let systemInstruction = `You are GeoQuest, an elite Autonomous Spatial Planning ReAct Agent.
Your mission is to interpret user trip commands, reason about spatial constraints, and use function calling tools to assemble an optimal itinerary.

OPERATIONAL PROTOCOL (ReAct Loop):
1. Thought: Reason about user intent, target destination, theme, and time constraints.
2. Action: Call 'fetch_weather' to inspect weather at destination.
3. Action: Call 'search_places' to find relevant, curated spots with exact coordinates [lng, lat].
4. Action: Call 'calculate_route' to compute transit distance, time, and assemble ordered waypoints.
5. Action: Call 'propose_itinerary' to package the finalized GeoJSON and request Human Oversight approval.
6. STRICT RULE: Every spatial itinerary write is irreversible and MUST conclude by invoking 'propose_itinerary' to trigger human approval. NEVER fabricate coordinates; always use search_places.`;

  if (isNearMe || userCoords) {
    const coordsToUse = userCoords || [77.5946, 12.9716];
    systemInstruction += `\n7. PROXIMITY & "NEAR ME" DIRECTIVE: The user's active coordinates are [longitude: ${coordsToUse[0]}, latitude: ${coordsToUse[1]}].
The user prompt asks for spots 'near me', 'nearby', or 'around here'.
You MUST pass userCoordinates: [${coordsToUse[0]}, ${coordsToUse[1]}] to 'search_places' and leave the 'city' parameter blank so the system discovers venues situated directly around their live coordinates instead of searching a hardcoded city center.
Then pass those discovered proximity waypoints into 'calculate_route' and 'propose_itinerary'.`;
  }

  if (!isKeyConfigured) {
    const fallbackResponse = await executeDeterministicReAct({
      prompt,
      userCoordinates: userCoords,
      thoughts,
      toolCallsMade,
      reason: 'GEMINI_API_KEY not configured',
    });
    return res.json(fallbackResponse);
  }

  // --- Real Gemini Function Calling Loop via @google/genai SDK ---
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const contents = [];

    if (Array.isArray(history) && history.length > 0) {
      history.forEach((h) => contents.push(h));
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const maxIterations = 8;
    let iteration = 0;
    let finalMessage = '';

    while (iteration < maxIterations) {
      iteration++;

      let response;
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            tools: agentTools,
            temperature: 0.2,
          },
        });
      } catch (geminiError) {
        console.warn(`⚠️ [GeoQuest Agent] Gemini call failed (${geminiError.message}). Fallback to resilient ReAct pipeline.`);
        const fallbackResponse = await executeDeterministicReAct({
          prompt,
          userCoordinates: userCoords,
          thoughts,
          toolCallsMade,
          reason: `Gemini API temporary spike (${geminiError.message})`,
        });
        return res.json(fallbackResponse);
      }

      if (response.text) {
        thoughts.push(response.text);
      }

      const functionCalls = response.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        finalMessage = response.text || 'Planning completed.';
        break;
      }

      const candidateContent = response.candidates?.[0]?.content;
      if (candidateContent) {
        contents.push(candidateContent);
      }

      const functionResponseParts = [];

      for (const call of functionCalls) {
        const toolName = call.name;
        const toolArgs = { ...(call.args || {}) };

        // If "near me" prompt or userCoords available, feed userCoordinates directly into search_places and override hardcoded city
        if (toolName === 'search_places') {
          if (isNearMe) {
            toolArgs.userCoordinates = userCoords || [77.5946, 12.9716];
            toolArgs.city = ''; // Prevent searching hardcoded city center
          } else if (userCoords && !toolArgs.userCoordinates) {
            toolArgs.userCoordinates = userCoords;
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

        functionResponseParts.push({
          functionResponse: {
            name: toolName,
            response: toolOutput,
            id: call.id,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });

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
      reason: error.message,
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
