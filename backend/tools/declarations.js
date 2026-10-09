/**
 * Tool 1: fetch_weather
 * Fetch current weather conditions for a destination.
 */
export const fetchWeatherDeclaration = {
  type: 'function',
  function: {
    name: 'fetch_weather',
    description: 'Fetch current weather and temperature for a city.',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'The city or destination name.',
        },
        date: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Optional date for weather (YYYY-MM-DD or today).',
        },
      },
      required: ['city'],
    },
  },
};

/**
 * Tool 2: search_places
 * Find curated spots with coordinates, descriptions, and ratings.
 */
export const searchPlacesDeclaration = {
  type: 'function',
  function: {
    name: 'search_places',
    description: 'Search points of interest or landmarks with coordinates [lng, lat].',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for spots or activities (e.g. cafes, historic fort).',
        },
        category: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Category filter (heritage, cafe, nature, food, landmark).',
        },
        city: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'City or region name.',
        },
        userCoordinates: {
          type: ['array', 'null'],
          items: { type: 'number' },
          description: 'Coordinates [longitude, latitude] for near me searches.',
        },
        userLocation: {
          anyOf: [
            {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
              },
            },
            { type: 'null' },
          ],
          description: 'Optional live user location object.',
        },
      },
      required: ['query'],
    },
  },
};

/**
 * Tool 3: calculate_route
 * Calculate distance, estimated duration, and order waypoints into an itinerary.
 */
export const calculateRouteDeclaration = {
  type: 'function',
  function: {
    name: 'calculate_route',
    description: 'Calculate spatial distance, transit duration, and order waypoints.',
    parameters: {
      type: 'object',
      properties: {
        locations: {
          type: 'array',
          description: 'Ordered list of waypoint locations.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the waypoint.',
              },
              coordinates: {
                type: 'array',
                description: '[longitude, latitude] coordinates.',
                items: {
                  type: 'number',
                },
              },
              category: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
                description: 'Category of waypoint.',
              },
              description: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
                description: 'Brief overview.',
              },
            },
            required: ['name', 'coordinates'],
          },
        },
      },
      required: ['locations'],
    },
  },
};

/**
 * Tool 4: propose_itinerary
 * Package finalized trip into GeoJSON format and request human approval.
 */
export const proposeItineraryDeclaration = {
  type: 'function',
  function: {
    name: 'propose_itinerary',
    description: 'Package finalized route into GeoJSON and trigger human oversight gatekeeper.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the proposed itinerary.',
        },
        locations: {
          type: 'array',
          description: 'Ordered list of locations with coordinates and names.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              category: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
              },
              coordinates: {
                type: 'array',
                items: { type: 'number' },
              },
              description: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
              },
            },
            required: ['name', 'coordinates'],
          },
        },
        totalDistanceKm: {
          type: 'number',
          description: 'Total distance in kilometers.',
        },
        estimatedDurationMinutes: {
          type: 'number',
          description: 'Total duration in minutes.',
        },
        weatherNote: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Weather advisory note.',
        },
        agentReasoning: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Explanation for itinerary route.',
        },
      },
      required: ['title', 'locations', 'totalDistanceKm', 'estimatedDurationMinutes'],
    },
  },
};

/**
 * Standard OpenAI / Groq tool declarations array
 */
export const agentTools = [
  fetchWeatherDeclaration,
  searchPlacesDeclaration,
  calculateRouteDeclaration,
  proposeItineraryDeclaration,
];
