import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, disconnectDB, getDatabaseStatus } from './backend/config/db.js';
import agentRouter from './backend/routes/agent.js';

// Load environment variables
dotenv.config();

const app = express();

// Google Cloud Run automatically assigns PORT (typically 8080); default to 3000 for local Vite dev
const PORT = Number(process.env.PORT) || 3000;

// CORS configuration for local development and Cloud Run deployment
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
  process.env.APP_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, cURL, or server-to-server)
      if (!origin) return callback(null, true);
      // Allow if explicit match or Cloud Run domain
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost')
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev/hackathon environment
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body Parsers for JSON and URL-encoded requests
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint
// Returns server status, uptime, environment, and MongoDB connection status
app.get('/api/health', (req, res) => {
  const dbStatus = getDatabaseStatus();

  const isHealthy = true; // Server is alive and handling requests
  res.status(isHealthy ? 200 : 503).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    database: {
      status: dbStatus.status,
      isConnected: dbStatus.isConnected,
      stateCode: dbStatus.stateCode,
      host: dbStatus.host,
      databaseName: dbStatus.name,
    },
    googleCloudRun: {
      service: process.env.K_SERVICE || 'local',
      revision: process.env.K_REVISION || 'none',
    },
  });
});

// Mount Agent API Routes
app.use('/api/agent', agentRouter);

export { app, PORT };

// Standalone execution support (e.g. `node server.js` in containerized Cloud Run deployment)
if (process.env.STANDALONE === 'true' || process.argv[1]?.endsWith('server.js')) {
  (async () => {
    await connectDB();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 [GeoQuest Backend] Server listening on port ${PORT} (Cloud Run compatible)`);
    });

    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        await disconnectDB();
        process.exit(0);
      });

      // Force exit after 10s if connections refuse to close
      setTimeout(() => {
        console.error('Forcefully terminating server.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  })();
}
