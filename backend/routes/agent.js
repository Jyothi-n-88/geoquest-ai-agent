import express from 'express';
import { Route } from '../models/Route.js';
import { getDatabaseStatus } from '../config/db.js';
import {
  handleAgentCommand,
  handleAgentApproval,
  stagedRoutesMemoryStore,
} from '../controllers/agentController.js';
import { agentTools } from '../tools/declarations.js';

const router = express.Router();

/**
 * GET /api/agent
 * Agent status, capabilities, and tool schemas
 */
router.get('/', (req, res) => {
  res.json({
    name: 'GeoQuest Autonomous Spatial Planning ReAct Agent',
    version: '2.5.0-groq',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    status: 'active',
    capabilities: [
      'Groq Llama-3.3-70B Native Function Calling',
      'Multi-Turn ReAct Cognitive Loop',
      'Spatial Geocoding & Weather Telemetry',
      'GeoJSON Path & Waypoint Generation',
      'Human Oversight Gatekeeper',
    ],
    tools: agentTools.map((d) => ({
      name: d.function?.name || d.name,
      description: d.function?.description || d.description,
    })),
    humanOversightPolicy: 'Strict approval required before finalizing irreversible spatial writes to database',
  });
});

/**
 * POST /api/agent/command
 * Autonomous ReAct Cognitive Loop with Gemini Function Calling
 */
router.post('/command', handleAgentCommand);

/**
 * POST /api/agent/approve
 * Human Oversight Confirmation Endpoint
 */
router.post('/approve', handleAgentApproval);

/**
 * GET /api/agent/routes
 * List all generated and staged routes (MongoDB + in-memory fallback)
 */
router.get('/routes', async (req, res) => {
  try {
    const { status } = req.query;
    const dbStatus = getDatabaseStatus();

    let routes = [];

    if (dbStatus.isConnected) {
      const filter = status ? { status } : {};
      routes = await Route.find(filter).sort({ createdAt: -1 }).limit(25).lean();
    } else {
      // Fallback from memory store
      routes = Array.from(stagedRoutesMemoryStore.values());
      if (status) {
        routes = routes.filter((r) => r.status === status);
      }
      routes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    res.json({
      success: true,
      count: routes.length,
      storage: dbStatus.isConnected ? 'mongodb' : 'in-memory-staging',
      routes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agent/routes/:id
 * Retrieve a single route by ID
 */
router.get('/routes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dbStatus = getDatabaseStatus();

    if (dbStatus.isConnected) {
      try {
        const route = await Route.findById(id);
        if (route) {
          return res.json({ success: true, route });
        }
      } catch {
        // Ignore cast error and check memory store
      }
    }

    const staged = stagedRoutesMemoryStore.get(id);
    if (staged) {
      return res.json({ success: true, route: staged });
    }

    return res.status(404).json({
      success: false,
      error: `Route not found with ID ${id}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
