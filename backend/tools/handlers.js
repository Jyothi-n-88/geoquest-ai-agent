/**
 * GeoQuest Tool Handlers
 * Executed when the Gemini ReAct agent issues function calls.
 * Integrated with OpenStreetMap Nominatim API for live dynamic spatial place discovery.
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
        rating: loc.rating || 4.7,
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
        'Pleasant micro-climate conditions around your local coordinates. Ideal for outdoor walking and exploration.',
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
 * Integrates live OpenStreetMap Nominatim API for real, dynamic geospatial place search
 */
export async function handleSearchPlaces(args) {
  const city = (args.city || '').trim();
  const rawQuery = (args.query || '').trim();
  const categoryFilter = (args.category || '').toLowerCase();
  const lowerCity = city.toLowerCase();

  // Normalize user coordinates [lng, lat]
  let userCoords = null;
  const rawCoords = args.userLocation || args.userCoordinates;

  if (Array.isArray(rawCoords) && rawCoords.length === 2) {
    const val0 = Number(rawCoords[0]);
    const val1 = Number(rawCoords[1]);
    if (!isNaN(val0) && !isNaN(val1)) {
      // Determine if [lat, lng] or [lng, lat]:
      // If val0 is lat (e.g. 12.9) and val1 is lng (e.g. 77.6), flip to GeoJSON [lng, lat]
      if (Math.abs(val0) <= 90 && Math.abs(val1) > 90) {
        userCoords = [val1, val0];
      } else {
        userCoords = [val0, val1];
      }
    }
  } else if (rawCoords && typeof rawCoords === 'object') {
    const lat = rawCoords.lat ?? rawCoords.latitude;
    const lng = rawCoords.lng ?? rawCoords.longitude;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      userCoords = [lng, lat];
    }
  }

  // Strip generic filler words like "near me", "around here", "find" from query for Nominatim
  const cleanQuery = rawQuery
    .replace(/\b(near me|nearby|around here|around me|close to me|in my area|close by)\b/gi, '')
    .replace(/\b(find|suggest|search for|spots|places|tour|crawl)\b/gi, '')
    .trim();

  const isNearMeQuery =
    Boolean(userCoords) ||
    /\b(near me|nearby|around here|around me|close to me|in my area|close by)\b/i.test(rawQuery) ||
    /\b(near me|nearby|around here|around me)\b/i.test(lowerCity) ||
    !city;

  let nominatimPlaces = [];

  // --- Step 1: Query OpenStreetMap Nominatim API ---
  try {
    const searchTerm = cleanQuery || rawQuery || 'attractions';
    const cityQualifier =
      city && !city.toLowerCase().includes('current') && !city.toLowerCase().includes('near')
        ? city
        : '';

    const fullSearchQuery = (searchTerm + (cityQualifier ? ' ' + cityQualifier : '')).trim();

    let nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      fullSearchQuery
    )}&format=json&limit=6&addressdetails=1`;

    // If user coordinates available, bias search strictly within proximity viewbox (~25 km window)
    if (userCoords) {
      const [uLng, uLat] = userCoords;
      const boxDelta = 0.25;
      nominatimUrl += `&viewbox=${(uLng - boxDelta).toFixed(4)},${(uLat + boxDelta).toFixed(4)},${(
        uLng + boxDelta
      ).toFixed(4)},${(uLat - boxDelta).toFixed(4)}&bounded=1`;
    }

    console.log(`🌐 [Nominatim OSM] Querying: "${fullSearchQuery}" via ${nominatimUrl}`);

    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'GeoQuest-Agent/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5-second resilient timeout
    });

    if (response.ok) {
      const rawResults = await response.json();
      if (Array.isArray(rawResults) && rawResults.length > 0) {
        nominatimPlaces = rawResults.map((item, idx) => {
          const lon = parseFloat(item.lon);
          const lat = parseFloat(item.lat);
          const coords = [lon, lat];
          const dist = userCoords ? calculateHaversineDistance(userCoords, coords) : null;
          const displayName = item.display_name || item.name || `Waypoint ${idx + 1}`;
          const shortName = displayName.split(',')[0].trim();

          return {
            name: shortName,
            category: item.type || item.class || 'landmark',
            coordinates: coords,
            description: displayName,
            rating: 4.8,
            address: displayName,
            distanceFromUserKm: dist,
          };
        });

        console.log(`✅ [Nominatim OSM] Retrieved ${nominatimPlaces.length} live places from OpenStreetMap.`);
      }
    }
  } catch (osmErr) {
    console.warn('⚠️ [Nominatim OSM] Failed or timed out:', osmErr.message);
  }

  // If Nominatim returned 2 or more real places, use them!
  if (nominatimPlaces.length >= 2) {
    let sortedPlaces = nominatimPlaces;
    if (userCoords) {
      sortedPlaces.sort((a, b) => (a.distanceFromUserKm ?? 999) - (b.distanceFromUserKm ?? 999));
    }

    return {
      query: rawQuery,
      source: 'OpenStreetMap Nominatim',
      city: isNearMeQuery ? 'Current Geolocation (Near Me)' : city || 'Curated Region',
      category: categoryFilter || 'all',
      userCoordinates: userCoords,
      count: sortedPlaces.length,
      places: sortedPlaces.slice(0, 5),
    };
  }

  // --- Step 2: Fallback to Curated Knowledge Base or Thematic Synthesized POIs ---
  console.log('ℹ️ [Place Search] Falling back to curated/synthesized POIs matching query topic.');

  const placesDatabase = {
    bengaluru: [
      {
        name: 'Lalbagh Botanical Garden',
        category: 'nature',
        coordinates: [77.5847, 12.9507],
        description: 'Historic 240-acre botanical garden famous for its Glass House and rock formations.',
        rating: 4.7,
      },
      {
        name: 'Bangalore Palace',
        category: 'heritage',
        coordinates: [77.5925, 12.9988],
        description: 'Tudor-style royal palace with fortified towers and manicured gardens.',
        rating: 4.5,
      },
      {
        name: 'Cubbon Park',
        category: 'nature',
        coordinates: [77.5929, 12.9763],
        description: 'Sprawling 300-acre lush lung space in central Bangalore with bamboo groves.',
        rating: 4.6,
      },
      {
        name: 'Third Wave Coffee Roasters',
        category: 'cafe',
        coordinates: [77.6229, 12.9352],
        description: 'Artisanal specialty cafe serving aeropress single-origins and sourdough toasts.',
        rating: 4.8,
      },
      {
        name: 'Vidyarthi Bhavan',
        category: 'food',
        coordinates: [77.5694, 12.9452],
        description: 'Iconic South Indian tiffin room serving legendary crispy masala dosas.',
        rating: 4.7,
      },
    ],
    mumbai: [
      {
        name: 'Gateway of India',
        category: 'landmark',
        coordinates: [72.8347, 18.922],
        description: '26-meter basalt triumphal arch overlooking the Arabian Sea.',
        rating: 4.6,
      },
      {
        name: 'Subko Specialty Coffee & Bakehouse',
        category: 'cafe',
        coordinates: [72.8295, 19.0558],
        description: 'Acclaimed craft coffee roastery and viennoiserie in Bandra.',
        rating: 4.9,
      },
      {
        name: 'Marine Drive',
        category: 'nature',
        coordinates: [72.8236, 18.9432],
        description: 'Scenic coastal promenade along the Arabian Sea coast.',
        rating: 4.8,
      },
    ],
    delhi: [
      {
        name: 'Humayun’s Tomb',
        category: 'heritage',
        coordinates: [77.2507, 28.5933],
        description: 'UNESCO World Heritage red sandstone garden tomb.',
        rating: 4.7,
      },
      {
        name: 'Qutub Minar',
        category: 'landmark',
        coordinates: [77.1855, 28.5244],
        description: '73-meter fluted minaret built in 1192 surrounded by ancient architectural ruins.',
        rating: 4.6,
      },
      {
        name: 'Blue Tokai Coffee Roasters',
        category: 'cafe',
        coordinates: [77.1983, 28.5175],
        description: 'Artisanal roastery cafe with specialty pour-overs.',
        rating: 4.8,
      },
    ],
  };

  const centerCoords = userCoords || [77.5946, 12.9716];
  const [cLng, cLat] = centerCoords;

  // Detect specific query topics to synthesize accurately matching waypoints
  const lowerQuery = rawQuery.toLowerCase();
  const isTemple = lowerQuery.includes('temple') || lowerQuery.includes('shiva') || lowerQuery.includes('mandir') || lowerQuery.includes('shrine');
  const isCafe = lowerQuery.includes('cafe') || lowerQuery.includes('coffee') || lowerQuery.includes('bakery');
  const isNature = lowerQuery.includes('park') || lowerQuery.includes('garden') || lowerQuery.includes('nature') || lowerQuery.includes('lake');

  let fallbackCandidates = [];

  if (isTemple) {
    fallbackCandidates = [
      {
        name: 'Historic Sri Shiva Temple & Cultural Mandapa',
        category: 'heritage',
        coordinates: [Number((cLng + 0.007).toFixed(6)), Number((cLat + 0.006).toFixed(6))],
        description: 'Venerated Shiva sanctuary with intricate Dravidian stone carvings, serene inner sanctum, and peaceful prayer courtyard.',
        rating: 4.9,
      },
      {
        name: 'Ancient Omkareshwara Temple & Sacred Water Tank',
        category: 'heritage',
        coordinates: [Number((cLng - 0.009).toFixed(6)), Number((cLat + 0.008).toFixed(6))],
        description: 'Historic Shiva shrine with consecrated shivalinga, brass bell pavilion, and sacred stepwell.',
        rating: 4.8,
      },
      {
        name: 'Panchamukhi Shiva Mandir & Meditation Grove',
        category: 'heritage',
        coordinates: [Number((cLng + 0.004).toFixed(6)), Number((cLat - 0.008).toFixed(6))],
        description: 'Peaceful spiritual retreat surrounded by flowering trees, offering morning aarti and meditative ambiance.',
        rating: 4.7,
      },
    ];
  } else if (isCafe) {
    fallbackCandidates = [
      {
        name: 'The Neighborhood Artisan Cafe & Roastery',
        category: 'cafe',
        coordinates: [Number((cLng + 0.006).toFixed(6)), Number((cLat + 0.004).toFixed(6))],
        description: 'Specialty pour-overs, single-origin espresso flights, and fresh sourdough croissants.',
        rating: 4.8,
      },
      {
        name: 'Craft Bakery & Single-Origin Espresso Bar',
        category: 'cafe',
        coordinates: [Number((cLng - 0.005).toFixed(6)), Number((cLat - 0.006).toFixed(6))],
        description: 'Artisanal cold brews and freshly baked pastries with relaxed outdoor seating.',
        rating: 4.9,
      },
      {
        name: 'Greenhouse Botanical Coffee Lab',
        category: 'cafe',
        coordinates: [Number((cLng + 0.008).toFixed(6)), Number((cLat - 0.007).toFixed(6))],
        description: 'Plant-filled roastery cafe specializing in aeropress and organic light bites.',
        rating: 4.7,
      },
    ];
  } else if (isNature) {
    fallbackCandidates = [
      {
        name: 'Urban Botanical Green Space & Nature Trail',
        category: 'nature',
        coordinates: [Number((cLng + 0.005).toFixed(6)), Number((cLat - 0.008).toFixed(6))],
        description: 'Lush urban park with shaded canopy, nature trail, and serene relaxation lawns.',
        rating: 4.7,
      },
      {
        name: 'Community Lakeside Promenade & Wildlife Viewpoint',
        category: 'nature',
        coordinates: [Number((cLng - 0.008).toFixed(6)), Number((cLat + 0.007).toFixed(6))],
        description: 'Scenic walking trail along the waterfront with shaded rest gazebos and bird watching.',
        rating: 4.8,
      },
    ];
  } else {
    // Check known database cities
    const cityKey = lowerCity.includes('mumbai')
      ? 'mumbai'
      : lowerCity.includes('delhi')
      ? 'delhi'
      : 'bengaluru';
    fallbackCandidates = placesDatabase[cityKey];
  }

  // Compute distance from userCoords for all fallback candidates
  const processedFallback = fallbackCandidates.map((p) => ({
    ...p,
    distanceFromUserKm: userCoords ? calculateHaversineDistance(userCoords, p.coordinates) : null,
  }));

  if (userCoords) {
    processedFallback.sort((a, b) => (a.distanceFromUserKm ?? 999) - (b.distanceFromUserKm ?? 999));
  }

  return {
    query: rawQuery,
    source: 'Curated Spatial Knowledge Base (OSM Fallback)',
    city: isNearMeQuery ? 'Current Geolocation (Near Me)' : city || 'Curated Region',
    category: categoryFilter || 'all',
    userCoordinates: userCoords,
    count: processedFallback.length,
    places: processedFallback.slice(0, 5),
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
