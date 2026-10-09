/**
 * Tool 1: fetch_weather
 * Fetch current weather, precipitation, and conditions for a destination.
 */
export const fetchWeatherDeclaration = {
  type: 'function',
  function: {
    name: 'fetch_weather',
    description: 'Fetch current weather conditions, temperature, precipitation, and forecast recommendations for a target city or destination.',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'The city or destination name (e.g., "Bengaluru", "Mumbai", "Delhi", "San Francisco").',
        },
        date: {
          type: 'string',
          description: 'Optional date for forecasted weather (format: YYYY-MM-DD or "today").',
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
    description: 'Search for curated points of interest, attractions, cafes, or landmarks with precise geospatial coordinates [lng, lat], category, and descriptions.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for the place or type of activity (e.g., "botanical garden", "specialty coffee", "historic fort").',
        },
        category: {
          type: 'string',
          description: 'Category filter for the spots: "heritage", "nature", "food", "cafe", or "landmark".',
        },
        city: {
          type: 'string',
          description: 'The city or region where the search should be conducted.',
        },
        userCoordinates: {
          type: 'array',
          description: 'Optional current coordinates [longitude, latitude] of the user for "near me" or proximity searches.',
          items: {
            type: 'number',
          },
        },
        userLocation: {
          type: 'object',
          description: 'Optional live user location object with lat and lng properties.',
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' },
          },
        },
      },
      required: ['query'],
    },
  },
};

/**
 * Tool 3: calculate_route
 * Calculate distance, estimated duration, and order waypoints into an optimized itinerary.
 */
export const calculateRouteDeclaration = {
  type: 'function',
  function: {
    name: 'calculate_route',
    description: 'Calculate spatial distance, estimated transit duration, and compile ordered waypoints into a validated GeoJSON spatial path.',
    parameters: {
      type: 'object',
      properties: {
        locations: {
          type: 'array',
          description: 'Ordered list of waypoint locations to include in the itinerary route.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the waypoint or stop.',
              },
              coordinates: {
                type: 'array',
                description: 'Geospatial coordinates as a [longitude, latitude] pair.',
                items: {
                  type: 'number',
                },
              },
              category: {
                type: 'string',
                description: 'Category of the waypoint (e.g. heritage, cafe, nature).',
              },
              description: {
                type: 'string',
                description: 'Brief overview or reason for visiting this waypoint.',
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
    description: 'Package the finalized trip into an official GeoJSON FeatureCollection and trigger the Human Oversight gatekeeper for user approval before permanent database persistence.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title or theme of the proposed itinerary.',
        },
        locations: {
          type: 'array',
          description: 'Final ordered list of locations with coordinates, names, and descriptions.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              coordinates: {
                type: 'array',
                items: { type: 'number' },
              },
              description: { type: 'string' },
            },
            required: ['name', 'coordinates'],
          },
        },
        totalDistanceKm: {
          type: 'number',
          description: 'Total calculated route distance in kilometers.',
        },
        estimatedDurationMinutes: {
          type: 'number',
          description: 'Total estimated transit and activity duration in minutes.',
        },
        weatherNote: {
          type: 'string',
          description: 'Summary of destination weather conditions and trip advice.',
        },
        agentReasoning: {
          type: 'string',
          description: 'Brief explanation of why this route was organized this way.',
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
