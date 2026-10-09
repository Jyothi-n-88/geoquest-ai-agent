import mongoose from 'mongoose';

/**
 * Individual waypoint/location in the generated itinerary
 */
const LocationItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'landmark',
    },
    coordinates: {
      type: [Number], // [longitude, latitude] per GeoJSON / Mapbox specification
      required: [true, 'Coordinates [longitude, latitude] are required'],
      validate: {
        validator: function (val) {
          return (
            Array.isArray(val) &&
            val.length === 2 &&
            typeof val[0] === 'number' &&
            typeof val[1] === 'number' &&
            val[0] >= -180 &&
            val[0] <= 180 && // Longitude range
            val[1] >= -90 &&
            val[1] <= 90 // Latitude range
          );
        },
        message: 'Coordinates must be valid [longitude, latitude] pair: lng between -180 and 180, lat between -90 and 90',
      },
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);

/**
 * GeoQuest Route / Spatial Itinerary Schema
 */
const RouteSchema = new mongoose.Schema(
  {
    userPrompt: {
      type: String,
      required: [true, 'Original user prompt is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['pending_approval', 'approved', 'rejected'],
        message: '{VALUE} is not a valid Route status',
      },
      default: 'pending_approval',
      index: true,
    },
    locations: {
      type: [LocationItemSchema],
      default: [],
    },
    // GeoJSON FeatureCollection or Geometry object (FeatureCollection / LineString / Point) for direct Mapbox GL JS rendering
    geojson: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'GeoJSON representation is required for Mapbox rendering'],
      validate: {
        validator: function (val) {
          return val && typeof val === 'object' && typeof val.type === 'string';
        },
        message: 'Must be a valid GeoJSON object with a "type" attribute',
      },
    },
    metadata: {
      totalDistanceKm: { type: Number, default: 0 },
      estimatedDurationMinutes: { type: Number, default: 0 },
      weatherSummary: { type: String, default: '' },
      agentThoughts: { type: String, default: '' },
      approvalNotes: { type: String, default: '' },
      approvedAt: { type: Date },
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Indexes for high-frequency queries
RouteSchema.index({ status: 1, createdAt: -1 });
RouteSchema.index({ createdAt: -1 });

export const Route = mongoose.models.Route || mongoose.model('Route', RouteSchema);
export default Route;
