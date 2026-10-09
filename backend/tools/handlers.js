/**
 * GeoQuest Tool Handlers
 * Executed when the Gemini ReAct agent issues function calls.
 */

// Haversine formula to compute great-circle distance between two points in km
export function calculateHaversineDistance(coord1, coord2) {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;
  const R = 6371; // Earth radius in km

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Builds a standardized GeoJSON FeatureCollection for Mapbox GL JS / MapLibre
 */
export function buildGeoJSONFeatureCollection(locations, routeTitle = 'Spatial Itinerary') {
  const features = [];

  // 1. Point features for every waypoint
  locations.forEach((loc, index) => {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: loc.coordinates, // [lng, lat]
      },
      properties: {
        id: `stop-${index + 1}`,
        stopNumber: index + 1,
        title: loc.name,
        name: loc.name,
        category: loc.category || 'landmark',
        description: loc.description || '',
        rating: loc.rating || 4.5,
        distanceFromUserKm: loc.distanceFromUserKm ?? null,
      },
    });
  });

  // 2. LineString feature connecting all waypoints in order
  if (locations.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: locations.map((loc) => loc.coordinates),
      },
      properties: {
        id: 'route-path',
        title: `${routeTitle} - Path`,
        strokeColor: '#06b6d4', // Cyan accent
        strokeWidth: 4,
        totalStops: locations.length,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * 1. fetch_weather Handler
 */
export async function handleFetchWeather(args) {
  const city = (args.city || '').trim();
  const lowerCity = city.toLowerCase();

  // If user requested near me / local coordinates
  if (
    lowerCity.includes('near me') ||
    lowerCity.includes('current location') ||
    lowerCity.includes('here') ||
    lowerCity.includes('proximity') ||
    !city
  ) {
    return {
      city: 'Current Location',
      date: args.date || 'today',
      temperatureC: 25,
      condition: 'Clear & Favorable',
      precipitationProb: '5%',
      humidity: '52%',
      windSpeed: '10 km/h',
      uvIndex: 'Moderate',
      recommendation:
        'Pleasant micro-climate conditions around your local coordinates. Ideal for outdoor walking or cafe hopping.',
      fetchedAt: new Date().toISOString(),
    };
  }

  const weatherDatabase = {
    bengaluru: {
      temperatureC: 24,
      condition: 'Partly Cloudy & Breezy',
      precipitationProb: '10%',
      humidity: '58%',
      windSpeed: '12 km/h',
      uvIndex: 'Moderate',
      recommendation: 'Ideal conditions for walking and outdoor exploration. Moderate UV, light breeze.',
    },
    bangalore: {
      temperatureC: 24,
      condition: 'Partly Cloudy & Breezy',
      precipitationProb: '10%',
      humidity: '58%',
      windSpeed: '12 km/h',
      uvIndex: 'Moderate',
      recommendation: 'Ideal conditions for walking and outdoor exploration. Moderate UV, light breeze.',
    },
    mumbai: {
      temperatureC: 31,
      condition: 'Sunny with Coastal Haze',
      precipitationProb: '5%',
      humidity: '72%',
      windSpeed: '16 km/h',
      uvIndex: 'High',
      recommendation: 'Warm and humid along the coast. Carry sunscreen and stay hydrated.',
    },
    delhi: {
      temperatureC: 27,
      condition: 'Clear Skies',
      precipitationProb: '0%',
      humidity: '42%',
      windSpeed: '9 km/h',
      uvIndex: 'Moderate',
      recommendation: 'Pleasant daytime weather, great visibility for monument tours.',
    },
    mysuru: {
      temperatureC: 26,
      condition: 'Sunny',
      precipitationProb: '15%',
      humidity: '60%',
      windSpeed: '10 km/h',
      uvIndex: 'Moderate',
      recommendation: 'Warm and pleasant. Perfect for heritage walks.',
    },
  };

  const weather = weatherDatabase[lowerCity] || {
    temperatureC: 23,
    condition: 'Mild and Clear',
    precipitationProb: '10%',
    humidity: '50%',
    windSpeed: '10 km/h',
    uvIndex: 'Moderate',
    recommendation: 'Favorable conditions for spatial route execution.',
  };

  return {
    city: city || 'Local Area',
    date: args.date || 'today',
    ...weather,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 2. search_places Handler
 * Feeds live user coordinates directly into proximity discovery for "near me" prompts
 */
export async function handleSearchPlaces(args) {
  const city = (args.city || '').trim();
  const query = (args.query || '').toLowerCase();
  const categoryFilter = (args.category || '').toLowerCase();
  const lowerCity = city.toLowerCase();

  // Normalize user coordinates [lng, lat]
  let userCoords = null;
  if (Array.isArray(args.userCoordinates) && args.userCoordinates.length === 2) {
    const lng = Number(args.userCoordinates[0]);
    const lat = Number(args.userCoordinates[1]);
    if (!isNaN(lng) && !isNaN(lat)) {
      userCoords = [lng, lat];
    }
  } else if (args.userCoordinates && typeof args.userCoordinates === 'object') {
    const lat = args.userCoordinates.lat ?? args.userCoordinates.latitude;
    const lng = args.userCoordinates.lng ?? args.userCoordinates.longitude;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      userCoords = [lng, lat];
    }
  }

  const isNearMeQuery =
    Boolean(userCoords) ||
    /\b(near me|nearby|around here|around me|close to me|in my area|close by)\b/i.test(query) ||
    /\b(near me|nearby|around here|around me)\b/i.test(lowerCity) ||
    !city;

  // Curated spatial POI database
  const placesDatabase = {
    bengaluru: [
      {
        name: 'Lalbagh Botanical Garden',
        category: 'nature',
        coordinates: [77.5847, 12.9507],
        description: 'Historic 240-acre botanical garden famous for its Glass House and 3,000-year-old rock formations.',
        rating: 4.7,
        address: 'Mavalli, Bengaluru, Karnataka 560004',
      },
      {
        name: 'Bangalore Palace',
        category: 'heritage',
        coordinates: [77.5925, 12.9988],
        description: 'Tudor-style royal palace with fortified towers, wood carvings, and manicured gardens.',
        rating: 4.5,
        address: 'Vasanth Nagar, Bengaluru, Karnataka 560052',
      },
      {
        name: 'Cubbon Park',
        category: 'nature',
        coordinates: [77.5929, 12.9763],
        description: 'Sprawling 300-acre lush lung space in central Bangalore with bamboo groves and heritage buildings.',
        rating: 4.6,
        address: 'Kasturba Road, Sampangi Rama Nagara, Bengaluru 560001',
      },
      {
        name: 'Third Wave Coffee Roasters',
        category: 'cafe',
        coordinates: [77.6229, 12.9352],
        description: 'Artisanal specialty cafe in Koramangala serving aeropress single-origins and sourdough toasts.',
        rating: 4.8,
        address: '80 Feet Road, 4th Block, Koramangala, Bengaluru 560034',
      },
      {
        name: 'Vidyarthi Bhavan',
        category: 'food',
        coordinates: [77.5694, 12.9452],
        description: 'Iconic South Indian tiffin room serving legendary crispy masala dosas since 1943.',
        rating: 4.7,
        address: 'Gandhi Bazaar, Basavanagudi, Bengaluru 560004',
      },
      {
        name: 'Tipu Sultan’s Summer Palace',
        category: 'heritage',
        coordinates: [77.5738, 12.9593],
        description: 'Exquisite two-story teakwood summer palace displaying Indo-Islamic architecture and historical artifacts.',
        rating: 4.4,
        address: 'Albert Victor Road, Chamrajpet, Bengaluru 560018',
      },
      {
        name: 'Maverick & Farmer Coffee',
        category: 'cafe',
        coordinates: [77.6385, 12.9121],
        description: 'Experimental farm-to-cup roastery cafe with creative fermented brews overlooking greenery.',
        rating: 4.6,
        address: 'Ulsoor Road, Halasuru, Bengaluru 560042',
      },
      {
        name: 'National Gallery of Modern Art (NGMA)',
        category: 'heritage',
        coordinates: [77.5873, 12.9898],
        description: 'Manikyavelu Mansion heritage residence housing post-colonial paintings, sculptures, and art cafe.',
        rating: 4.7,
        address: 'Palace Road, Vasanth Nagar, Bengaluru 560052',
      },
    ],
    mumbai: [
      {
        name: 'Gateway of India',
        category: 'landmark',
        coordinates: [72.8347, 18.922],
        description: '26-meter basalt triumphal arch overlooking the Arabian Sea, built in 1924.',
        rating: 4.6,
        address: 'Apollo Bandar, Colaba, Mumbai 400001',
      },
      {
        name: 'Marine Drive (Queen’s Necklace)',
        category: 'nature',
        coordinates: [72.8236, 18.9432],
        description: '3.6 km scenic coastal promenade along the Arabian Sea coast.',
        rating: 4.8,
        address: 'Netaji Subhash Chandra Bose Road, Mumbai 400020',
      },
      {
        name: 'Subko Specialty Coffee & Bakehouse',
        category: 'cafe',
        coordinates: [72.8295, 19.0558],
        description: 'Acclaimed craft coffee roastery and viennoiserie in a restored Bandra cottage.',
        rating: 4.9,
        address: 'Craford Market Lane, Bandra West, Mumbai 400050',
      },
      {
        name: 'Chhatrapati Shivaji Maharaj Vastu Sangrahalaya',
        category: 'heritage',
        coordinates: [72.8327, 18.9269],
        description: 'Premier heritage museum displaying art, archaeology, and miniature paintings in Indo-Saracenic grandeur.',
        rating: 4.7,
        address: '159-161 MG Road, Fort, Mumbai 400023',
      },
    ],
    delhi: [
      {
        name: 'Humayun’s Tomb',
        category: 'heritage',
        coordinates: [77.2507, 28.5933],
        description: 'UNESCO World Heritage red sandstone garden tomb precursor to the Taj Mahal.',
        rating: 4.7,
        address: 'Mathura Road, Nizamuddin East, New Delhi 110013',
      },
      {
        name: 'Qutub Minar',
        category: 'landmark',
        coordinates: [77.1855, 28.5244],
        description: '73-meter fluted minaret built in 1192 surrounded by ancient architectural ruins.',
        rating: 4.6,
        address: 'Mehrauli, New Delhi 110030',
      },
      {
        name: 'Blue Tokai Coffee Roasters',
        category: 'cafe',
        coordinates: [77.1983, 28.5175],
        description: 'Artisanal roastery cafe nestled in Champa Gali with specialty pour-overs.',
        rating: 4.8,
        address: 'Khasra 258, Lane 3, Westend Marg, Saidulajab, New Delhi 110030',
      },
      {
        name: 'Lodhi Garden',
        category: 'nature',
        coordinates: [77.2201, 28.5931],
        description: '90-acre historic park with 15th-century Sayyid and Lodi tombs surrounded by walking trails.',
        rating: 4.7,
        address: 'Lodhi Road, New Delhi 110003',
      },
    ],
  };

  let candidatePlaces = [];

  // When user coordinates are provided, search relative to user coordinates
  if (userCoords) {
    const allKnown = [...placesDatabase.bengaluru, ...placesDatabase.mumbai, ...placesDatabase.delhi];
    const nearbyFromDb = allKnown
      .map((p) => ({
        ...p,
        distanceFromUserKm: calculateHaversineDistance(userCoords, p.coordinates),
      }))
      .filter((p) => p.distanceFromUserKm <= 35)
      .sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm);

    if (nearbyFromDb.length >= 2) {
      candidatePlaces = nearbyFromDb;
    } else {
      // Synthesize hyper-local high-fidelity POIs directly situated around user coordinates
      const [uLng, uLat] = userCoords;
      const synthList = [
        {
          name: 'The Neighborhood Artisan Cafe & Roastery',
          category: 'cafe',
          coordinates: [Number((uLng + 0.006).toFixed(6)), Number((uLat + 0.004).toFixed(6))],
          description: 'Specialty pour-overs, single-origin espressos, and fresh sourdough pastries situated close to your current location.',
          rating: 4.8,
        },
        {
          name: 'Community Heritage Landmark & Historic Clock Tower',
          category: 'heritage',
          coordinates: [Number((uLng - 0.008).toFixed(6)), Number((uLat + 0.007).toFixed(6))],
          description: 'Prominent local architectural monument and heritage square featuring scenic pedestrian paths.',
          rating: 4.6,
        },
        {
          name: 'Urban Botanical Green Space & Nature Trail',
          category: 'nature',
          coordinates: [Number((uLng + 0.004).toFixed(6)), Number((uLat - 0.009).toFixed(6))],
          description: 'Lush neighborhood park with shaded canopy, walking trails, and serene water fountains.',
          rating: 4.7,
        },
        {
          name: 'Craft Bakery & Single-Origin Espresso Bar',
          category: 'cafe',
          coordinates: [Number((uLng - 0.005).toFixed(6)), Number((uLat - 0.006).toFixed(6))],
          description: 'Artisanal breakfast pastries and cold brew flights situated within walking proximity.',
          rating: 4.9,
        },
        {
          name: 'Panoramic Promenade & Cultural Pavilion',
          category: 'landmark',
          coordinates: [Number((uLng + 0.009).toFixed(6)), Number((uLat + 0.008).toFixed(6))],
          description: 'Elevated viewpoint with open vistas, public sculptures, and shaded rest benches.',
          rating: 4.6,
        },
      ];

      candidatePlaces = synthList.map((p) => ({
        ...p,
        distanceFromUserKm: calculateHaversineDistance(userCoords, p.coordinates),
      }));
    }
  } else {
    // If no userCoords, resolve by city name
    const cityKey = lowerCity.includes('bangalore') || lowerCity.includes('bengaluru')
      ? 'bengaluru'
      : lowerCity.includes('mumbai')
      ? 'mumbai'
      : lowerCity.includes('delhi')
      ? 'delhi'
      : null;

    candidatePlaces = cityKey ? placesDatabase[cityKey] : [];

    if (candidatePlaces.length === 0) {
      const defaultCenter = [77.5946, 12.9716];
      candidatePlaces = [
        {
          name: `${city || 'City'} Central Heritage Landmark`,
          category: 'heritage',
          coordinates: [defaultCenter[0] + 0.01, defaultCenter[1] + 0.01],
          description: `Notable historic monument and cultural attraction in ${city || 'the area'}.`,
          rating: 4.5,
        },
        {
          name: `${city || 'City'} Botanical Gardens`,
          category: 'nature',
          coordinates: [defaultCenter[0] - 0.015, defaultCenter[1] - 0.008],
          description: `Serene urban green space and botanical preservation area in ${city || 'the area'}.`,
          rating: 4.6,
        },
        {
          name: `The Roastery Cafe ${city || 'Downtown'}`,
          category: 'cafe',
          coordinates: [defaultCenter[0] + 0.025, defaultCenter[1] - 0.015],
          description: `Specialty third-wave coffee roaster serving pour-overs and bakery treats.`,
          rating: 4.8,
        },
      ];
    }
  }

  let filtered = [...candidatePlaces];

  // Apply category filter if specified
  if (categoryFilter && categoryFilter !== 'all') {
    const matchedCategory = filtered.filter((p) => p.category.toLowerCase() === categoryFilter);
    if (matchedCategory.length > 0) {
      filtered = matchedCategory;
    }
  }

  // If query contains specific intent keywords like "cafe", "coffee", "park", "heritage", prioritize matching places
  const isCafeSearch = query.includes('cafe') || query.includes('coffee') || query.includes('bakery') || query.includes('espresso');
  const isHeritageSearch = query.includes('heritage') || query.includes('monument') || query.includes('history') || query.includes('palace');
  const isNatureSearch = query.includes('nature') || query.includes('park') || query.includes('garden') || query.includes('green');

  if (isCafeSearch) {
    const cafeMatches = filtered.filter((p) => p.category === 'cafe' || p.name.toLowerCase().includes('cafe') || p.name.toLowerCase().includes('coffee'));
    const others = filtered.filter((p) => !cafeMatches.includes(p));
    filtered = [...cafeMatches, ...others];
  } else if (isHeritageSearch) {
    const heritageMatches = filtered.filter((p) => p.category === 'heritage' || p.category === 'landmark');
    const others = filtered.filter((p) => !heritageMatches.includes(p));
    filtered = [...heritageMatches, ...others];
  } else if (isNatureSearch) {
    const natureMatches = filtered.filter((p) => p.category === 'nature');
    const others = filtered.filter((p) => !natureMatches.includes(p));
    filtered = [...natureMatches, ...others];
  }

  return {
    query: args.query,
    city: isNearMeQuery ? 'Current Geolocation (Near Me)' : city || 'Curated Region',
    category: categoryFilter || 'all',
    userCoordinates: userCoords,
    count: filtered.length,
    places: filtered.slice(0, 5),
  };
}

/**
 * 3. calculate_route Handler
 */
export async function handleCalculateRoute(args) {
  const locations = Array.isArray(args.locations) ? args.locations : [];

  if (locations.length < 2) {
    return {
      error: 'At least 2 locations are required to calculate a route and build spatial GeoJSON.',
      locations,
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      geojson: buildGeoJSONFeatureCollection(locations, 'Waypoint Sequence'),
    };
  }

  let totalDistanceKm = 0;
  for (let i = 0; i < locations.length - 1; i++) {
    const dist = calculateHaversineDistance(locations[i].coordinates, locations[i + 1].coordinates);
    totalDistanceKm += dist;
  }
  totalDistanceKm = Math.round(totalDistanceKm * 10) / 10;

  // Transit time estimate (assuming average urban speed ~25 km/h + 25 min dwell time per stop)
  const transitMinutes = Math.round((totalDistanceKm / 25) * 60);
  const dwellMinutes = (locations.length - 1) * 30;
  const estimatedDurationMinutes = transitMinutes + dwellMinutes;

  const geojson = buildGeoJSONFeatureCollection(locations, 'Optimized Route');

  return {
    waypointCount: locations.length,
    totalDistanceKm,
    estimatedDurationMinutes,
    transitTimeMinutes: transitMinutes,
    dwellTimeMinutes: dwellMinutes,
    orderedLocations: locations,
    geojson,
  };
}

/**
 * 4. propose_itinerary Handler
 */
export async function handleProposeItinerary(args) {
  const locations = Array.isArray(args.locations) ? args.locations : [];
  const title = args.title || 'Curated Spatial Itinerary';
  const totalDistanceKm = Number(args.totalDistanceKm) || 0;
  const estimatedDurationMinutes = Number(args.estimatedDurationMinutes) || 0;
  const weatherNote = args.weatherNote || 'Weather reviewed and approved.';
  const agentReasoning = args.agentReasoning || 'Route logically sequenced for minimum transit overhead.';

  // Ensure valid GeoJSON FeatureCollection
  const geojson = buildGeoJSONFeatureCollection(locations, title);

  return {
    title,
    status: 'pending_approval',
    requiresHumanApproval: true,
    totalDistanceKm,
    estimatedDurationMinutes,
    weatherNote,
    agentReasoning,
    locations,
    geojson,
    humanOversightPrompt:
      'Human Oversight Gatekeeper: This itinerary is staged and requires explicit user confirmation before permanent database commit.',
  };
}

/**
 * Registry mapping tool name -> handler function
 */
export const toolHandlers = {
  fetch_weather: handleFetchWeather,
  search_places: handleSearchPlaces,
  calculate_route: handleCalculateRoute,
  propose_itinerary: handleProposeItinerary,
};
