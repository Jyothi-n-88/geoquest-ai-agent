import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Maps Mongoose readyState numbers to human-readable strings
 */
export const ConnectionStates = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * Returns current database connection status
 */
export const getDatabaseStatus = () => {
  const stateCode = mongoose.connection.readyState;
  return {
    stateCode,
    status: ConnectionStates[stateCode] || 'unknown',
    isConnected: stateCode === 1,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
};

/**
 * Connects to MongoDB Atlas with retry configuration and event monitoring
 */
export const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri || uri.includes('<username>') || uri === 'MY_MONGO_URI') {
    console.warn(
      '⚠️  [GeoQuest DB] MONGO_URI is missing or unconfigured in environment variables. Database operations will be mocked or queued until MongoDB Atlas is connected.'
    );
    return null;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ [GeoQuest DB] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`❌ [GeoQuest DB] Connection error: ${error.message}`);
    // Non-fatal warning on local dev so server stays alive for health diagnostics
    return null;
  }
};

// Mongoose Connection Event Listeners
mongoose.connection.on('connected', () => {
  console.log('📡 [GeoQuest DB] Connection established to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error(`❌ [GeoQuest DB] Runtime error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  [GeoQuest DB] Disconnected from MongoDB');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 [GeoQuest DB] Reconnected to MongoDB');
});

/**
 * Graceful shutdown for MongoDB connection
 */
export const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🔒 [GeoQuest DB] MongoDB connection closed gracefully');
    }
  } catch (err) {
    console.error('❌ [GeoQuest DB] Error during graceful database disconnect:', err.message);
  }
};

export default connectDB;
