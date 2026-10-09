import { Type } from '@google/genai';

/**
 * Tool 1: fetch_weather
 * Fetch current weather, precipitation, and conditions for a destination.
 */
export const fetchWeatherDeclaration = {
  name: 'fetch_weather',
  description: 'Fetch current weather conditions, temperature, precipitation, and forecast recommendations for a target city or destination.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      city: {
        type: Type.STRING,
        description: 'The city or destination name (e.g., "Bengaluru", "Mumbai", "Delhi", "San Francisco").',
      },
      date: {
        type: Type.STRING,
        description: 'Optional date for forecasted weather (format: YYYY-MM-DD or "today").',
      },
    },
    required: ['city'],
  },
};

/**
 * Tool 2: search_places
 * Find curated spots with coordinates, descriptions, and ratings.
 */
export const searchPlacesDeclaration = {
  name: 'search_places',
  description: 'Search for curated points of interest, attractions, cafes, or landmarks with precise geospatial coordinates [lng, lat], category, and descriptions.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query for the place or type of activity (e.g., "botanical garden", "specialty coffee", "historic fort").',
      },
      category: {
        type: Type.STRING,
        description: 'Category filter for the spots: "heritage", "nature", "food", "cafe", or "landmark".',
      },
      city: {
        type: Type.STRING,
        description: 'The city where the search should be conducted.',
      },
    },
    required: ['query', 'city'],
  },
};

/**
 * Tool 3: calculate_route
 * Calculate distance, estimated duration, and order waypoints into an optimized itinerary.
 */
export const calculateRouteDeclaration = {
  name: 'calculate_route',
  description: 'Calculate spatial distance, estimated transit duration, and compile ordered waypoints into a validated GeoJSON spatial path.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      locations: {
        type: Type.ARRAY,
        description: 'Ordered list of waypoint locations to include in the itinerary route.',
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: 'Name of the waypoint or stop.',
            },
            coordinates: {
              type: Type.ARRAY,
              description: 'Geospatial coordinates as a [longitude, latitude] pair.',
              items: {
                type: Type.NUMBER,
              },
            },
            category: {
              type: Type.STRING,
              description: 'Category of the waypoint (e.g. heritage, cafe, nature).',
            },
            description: {
              type: Type.STRING,
              description: 'Brief overview or reason for visiting this waypoint.',
            },
          },
          required: ['name', 'coordinates'],
        },
      },
    },
    required: ['locations'],
  },
};

/**
 * Tool 4: propose_itinerary
 * Package finalized trip into GeoJSON format and request human approval.
 */
export const proposeItineraryDeclaration = {
  name: 'propose_itinerary',
  description: 'Package the finalized trip into an official GeoJSON FeatureCollection and trigger the Human Oversight gatekeeper for user approval before permanent database persistence.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'Title or theme of the proposed itinerary.',
      },
      locations: {
        type: Type.ARRAY,
        description: 'Final ordered list of locations with coordinates, names, and descriptions.',
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            coordinates: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
            },
            description: { type: Type.STRING },
          },
          required: ['name', 'coordinates'],
        },
      },
      totalDistanceKm: {
        type: Type.NUMBER,
        description: 'Total calculated route distance in kilometers.',
      },
      estimatedDurationMinutes: {
        type: Type.NUMBER,
        description: 'Total estimated transit and activity duration in minutes.',
      },
      weatherNote: {
        type: Type.STRING,
        description: 'Summary of destination weather conditions and trip advice.',
      },
      agentReasoning: {
        type: Type.STRING,
        description: 'Brief explanation of why this route was organized this way.',
      },
    },
    required: ['title', 'locations', 'totalDistanceKm', 'estimatedDurationMinutes'],
  },
};

/**
 * Combined tool declarations array to pass to Gemini API
 */
export const agentTools = [
  {
    functionDeclarations: [
      fetchWeatherDeclaration,
      searchPlacesDeclaration,
      calculateRouteDeclaration,
      proposeItineraryDeclaration,
    ],
  },
];
