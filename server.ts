import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, disconnectDB, getDatabaseStatus } from './backend/config/db.js';
import agentRouter from './backend/routes/agent.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS configuration for local dev and Google Cloud Run
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
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = getDatabaseStatus();

  res.status(200).json({
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

// Agent Route Mount
app.use('/api/agent', agentRouter);

async function startServer() {
  await connectDB();

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [GeoQuest Server] Listening on http://localhost:${PORT}`);
    console.log(`🔍 [Health Check]   http://localhost:${PORT}/api/health`);
    console.log(`🤖 [Agent Routes]   http://localhost:${PORT}/api/agent`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      await disconnectDB();
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Force closing server.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

export { app, PORT };
