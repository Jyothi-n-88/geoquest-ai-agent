import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapboxgl from 'mapbox-gl';
import {
  Compass,
  Layers,
  Maximize2,
  Navigation,
  Info,
  MapPin,
  AlertCircle,
  Key,
  Check,
  Loader2,
} from 'lucide-react';

// Carto Dark high-performance vector-ready raster basemap
const CARTO_DARK_STYLE = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap, © CARTO',
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export default function Map({ geojson, activeRoute, onSelectWaypoint, userLocation }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [activeEngine, setActiveEngine] = useState('MapLibre / Carto Dark');

  const envToken = import.meta.env.VITE_MAPBOX_TOKEN || '';
  const isCustomTokenValid = Boolean(
    envToken &&
    envToken.startsWith('pk.') &&
    !envToken.includes('example') &&
    envToken.length > 25
  );

  // Default fallback center coordinates: Bengaluru [lng: 77.5946, lat: 12.9716]
  const DEFAULT_BENGALURU_CENTER = [77.5946, 12.9716];

  // Initialize Map instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let mapInstance = null;
    const defaultCenter = [77.5946, 12.9716]; // Bengaluru default

    if (isCustomTokenValid) {
      try {
        mapboxgl.accessToken = envToken;
        mapInstance = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: defaultCenter,
          zoom: 11,
          pitch: 30,
        });
        setActiveEngine('Mapbox GL JS v3 (Custom Token)');
      } catch (err) {
        console.warn('Mapbox auth initialization failed, falling back to open MapLibre engine:', err);
        mapInstance = null;
      }
    }

    // Fallback or default: MapLibre GL engine with Carto Dark (100% token-free, zero auth errors)
    if (!mapInstance) {
      mapInstance = new maplibregl.Map({
        container: mapContainerRef.current,
        style: CARTO_DARK_STYLE,
        center: defaultCenter,
        zoom: 11,
        pitch: 30,
      });
      setActiveEngine('Carto Dark (Open Mapbox GL Engine)');
    }

    // Add navigation and fullscreen controls
    const NavControl = isCustomTokenValid && mapboxgl.NavigationControl
      ? mapboxgl.NavigationControl
      : maplibregl.NavigationControl;
    const FullControl = isCustomTokenValid && mapboxgl.FullscreenControl
      ? mapboxgl.FullscreenControl
      : maplibregl.FullscreenControl;

    mapInstance.addControl(new NavControl({ visualizePitch: true }), 'top-right');
    mapInstance.addControl(new FullControl(), 'top-right');

    mapInstance.on('load', () => {
      mapRef.current = mapInstance;
      setMapLoaded(true);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (mapInstance) {
        mapInstance.remove();
      }
      mapRef.current = null;
    };
  }, [envToken, isCustomTokenValid]);

  // Update GeoJSON route and waypoints whenever geojson prop updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Remove existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!geojson || !geojson.features || geojson.features.length === 0) {
      if (map.getSource('route-source')) {
        map.getSource('route-source').setData({
          type: 'FeatureCollection',
          features: [],
        });
      }
      return;
    }

    const sourceData = geojson;

    // Add or update GeoJSON route-source
    if (map.getSource('route-source')) {
      map.getSource('route-source').setData(sourceData);
    } else {
      map.addSource('route-source', {
        type: 'geojson',
        data: sourceData,
      });

      // 1. Ambient cyan glow line
      map.addLayer({
        id: 'route-line-glow',
        type: 'line',
        source: 'route-source',
        filter: ['==', '$type', 'LineString'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#06b6d4',
          'line-width': 8,
          'line-opacity': 0.35,
          'line-blur': 3,
        },
      });

      // 2. Primary Route LineString Layer: Cyan (#06b6d4) with width 4
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-source',
        filter: ['==', '$type', 'LineString'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#06b6d4',
          'line-width': 4,
          'line-opacity': 0.95,
        },
      });
    }

    // Determine correct Marker and Popup constructor based on active engine
    const MarkerClass = isCustomTokenValid ? mapboxgl.Marker : maplibregl.Marker;
    const PopupClass = isCustomTokenValid ? mapboxgl.Popup : maplibregl.Popup;
    const LngLatBoundsClass = isCustomTokenValid ? mapboxgl.LngLatBounds : maplibregl.LngLatBounds;

    const bounds = new LngLatBoundsClass();
    let pointCount = 0;

    geojson.features.forEach((feature) => {
      if (feature.geometry && feature.geometry.type === 'Point') {
        const coords = feature.geometry.coordinates;
        bounds.extend(coords);
        pointCount++;

        const props = feature.properties || {};
        const stopNum = props.stopNumber || pointCount;
        const name = props.name || props.title || `Stop ${stopNum}`;
        const category = props.category || 'landmark';

        // Custom HTML Marker element with pulse aura
        const el = document.createElement('div');
        el.className = 'group cursor-pointer relative';
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <span class="absolute h-9 w-9 rounded-full bg-cyan-400/30 animate-ping"></span>
            <div class="h-8 w-8 rounded-full bg-slate-950 border-2 border-cyan-400 text-cyan-300 font-mono text-xs font-bold flex items-center justify-center shadow-lg shadow-cyan-500/50 hover:scale-125 transition-transform duration-200">
              ${stopNum}
            </div>
            <div class="absolute -top-7 whitespace-nowrap bg-slate-900/95 text-slate-200 text-[11px] font-sans px-2 py-0.5 rounded border border-slate-700 shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              ${name}
            </div>
          </div>
        `;

        el.addEventListener('click', async () => {
          const resolvedAddress = props.address || props.description || props.formatted_address || props.name || '';
          const resolvedDesc = props.description || props.address || props.formatted_address || `${props.name || 'Waypoint'} curated stop`;

          // Set immediate selected point state with loading flag for reverse geocoding
          setSelectedPoint({
            ...props,
            name: name,
            address: resolvedAddress,
            description: resolvedDesc,
            coordinates: coords,
            stopNumber: stopNum,
            isGeocoding: true,
          });

          if (onSelectWaypoint) onSelectWaypoint(props);

          // Perform lightweight reverse-geocoding via OpenStreetMap Nominatim
          try {
            const [lng, lat] = coords;
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
              {
                headers: {
                  'Accept': 'application/json',
                },
              }
            );

            if (res.ok) {
              const data = await res.json();
              const fullAddress =
                data.display_name ||
                [data.address?.road, data.address?.suburb, data.address?.city || data.address?.town, data.address?.state]
                  .filter(Boolean)
                  .join(', ') ||
                resolvedAddress;

              setSelectedPoint((prev) => {
                if (!prev || prev.stopNumber !== stopNum) return prev;
                return {
                  ...prev,
                  address: fullAddress,
                  isGeocoding: false,
                };
              });
            } else {
              setSelectedPoint((prev) => (prev ? { ...prev, isGeocoding: false } : prev));
            }
          } catch (err) {
            console.warn('Reverse geocoding error:', err);
            setSelectedPoint((prev) => (prev ? { ...prev, isGeocoding: false } : prev));
          }
        });

        // Ensure hover popup prioritizes description, address, or informative venue context without generic placeholders
        const locationDetail = props.description || props.address || props.formatted_address || `${name} curated location`;
        const popup = new PopupClass({ offset: 25, closeButton: false }).setHTML(`
          <div class="p-2.5 font-sans bg-slate-900/95 text-slate-100 rounded-xl max-w-[220px] border border-slate-800 shadow-xl backdrop-blur-sm">
            <div class="flex items-center gap-1.5 mb-1.5">
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase font-semibold">
                ${category}
              </span>
              <span class="text-xs font-bold text-white truncate">${name}</span>
            </div>
            <p class="text-[11px] text-slate-300 leading-snug line-clamp-3">${locationDetail}</p>
          </div>
        `);

        const marker = new MarkerClass({ element: el })
          .setLngLat(coords)
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      }
    });

    // Automatically fitBounds to zoom in and center on the waypoints
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: { top: 70, bottom: 70, left: 70, right: 70 },
        maxZoom: 15,
        duration: 1200,
      });
    }
  }, [geojson, mapLoaded, onSelectWaypoint, isCustomTokenValid]);

  // Dynamically pan / flyTo user live coordinates whenever userLocation updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userLocation) return;

    const lat = typeof userLocation.lat === 'number' ? userLocation.lat : parseFloat(userLocation.lat);
    const lng = typeof userLocation.lng === 'number' ? userLocation.lng : parseFloat(userLocation.lng);

    if (isNaN(lat) || isNaN(lng)) return;

    const coords = [lng, lat];
    console.log(`🗺️ [GeoQuest Map] Dynamically flying to user live coordinates: [${lng}, ${lat}]`);

    // Remove existing user position marker if any
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    // Create custom pulsing user location marker
    const MarkerClass = isCustomTokenValid ? mapboxgl.Marker : maplibregl.Marker;
    const PopupClass = isCustomTokenValid ? mapboxgl.Popup : maplibregl.Popup;

    const userEl = document.createElement('div');
    userEl.className = 'relative flex items-center justify-center cursor-pointer';
    userEl.innerHTML = `
      <span class="absolute inline-flex h-9 w-9 animate-ping rounded-full bg-cyan-400/40 opacity-75"></span>
      <span class="relative inline-flex items-center justify-center rounded-full h-7 w-7 bg-cyan-500 text-white font-bold text-[10px] shadow-lg shadow-cyan-500/50 border-2 border-white">
        📍
      </span>
    `;

    const userPopup = new PopupClass({ offset: 20, closeButton: false }).setHTML(`
      <div class="p-2 font-sans bg-slate-900/95 text-slate-100 rounded-lg border border-cyan-800 text-xs">
        <div class="font-bold text-cyan-300 flex items-center gap-1">
          <span>●</span> Live User Location
        </div>
        <p class="text-[11px] text-slate-300 font-mono mt-0.5">${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
      </div>
    `);

    const userMarker = new MarkerClass({ element: userEl })
      .setLngLat(coords)
      .setPopup(userPopup)
      .addTo(map);

    userMarkerRef.current = userMarker;

    // Only fly to user coordinates if there isn't a fresh multi-point active route overriding the camera,
    // or fly smoothly to the user location
    const hasActiveRoutePoints = geojson && geojson.features && geojson.features.length > 0;
    if (!hasActiveRoutePoints) {
      map.flyTo({
        center: coords,
        zoom: 14,
        essential: true,
        duration: 1200,
      });
    }
  }, [userLocation, mapLoaded, isCustomTokenValid]);

  const handleRecenter = () => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // If route features exist, fit the bounds to the route
    if (geojson && geojson.features && geojson.features.length > 0) {
      const LngLatBoundsClass = isCustomTokenValid ? mapboxgl.LngLatBounds : maplibregl.LngLatBounds;
      const bounds = new LngLatBoundsClass();
      geojson.features.forEach((f) => {
        if (f.geometry?.type === 'Point') {
          bounds.extend(f.geometry.coordinates);
        }
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 15,
          duration: 800,
        });
        return;
      }
    }

    // Fallback: Fly to live user coordinates or default Bengaluru
    if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number') {
      map.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 14,
        duration: 800,
      });
    } else {
      map.flyTo({
        center: DEFAULT_BENGALURU_CENTER,
        zoom: 12,
        duration: 800,
      });
    }
  };

  const handleFlyToUser = () => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number') {
      map.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 14,
        duration: 900,
      });
    } else {
      map.flyTo({
        center: DEFAULT_BENGALURU_CENTER,
        zoom: 13,
        duration: 900,
      });
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Engine Status Pill & Recenter Buttons */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-800 text-xs text-slate-300 shadow-xl">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono text-[11px]">{activeEngine}</span>
        </div>

        <button
          onClick={handleFlyToUser}
          title="Recenter Map to Live GPS / Bengaluru"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 backdrop-blur border border-slate-800 shadow-xl text-xs font-medium transition"
        >
          <Navigation className="h-3.5 w-3.5 fill-cyan-400/20" />
          <span className="hidden sm:inline">Center My GPS</span>
        </button>
      </div>

      {/* Floating Active Route Card Overlay */}
      {activeRoute && (
        <div className="absolute bottom-5 left-5 z-20 max-w-md p-4 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-2xl space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-bold text-sm text-white tracking-tight">
                {activeRoute.title || 'Spatial Itinerary'}
              </span>
            </div>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                activeRoute.status === 'approved'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : activeRoute.status === 'rejected'
                  ? 'bg-red-950 text-red-300 border-red-800'
                  : 'bg-amber-950 text-amber-300 border-amber-800'
              }`}
            >
              {activeRoute.status || 'pending'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
            <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Distance</span>
              <span className="text-xs font-bold text-cyan-400">
                {activeRoute.totalDistanceKm || 0} km
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Duration</span>
              <span className="text-xs font-bold text-purple-400">
                {activeRoute.estimatedDurationMinutes || 0} min
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Stops</span>
              <span className="text-xs font-bold text-emerald-400">
                {activeRoute.locations?.length || 0} stops
              </span>
            </div>
          </div>

          {activeRoute.weatherNote && (
            <p className="text-[11px] text-slate-400 leading-tight pt-1 border-t border-slate-800/80">
              🌤️ {activeRoute.weatherNote}
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleRecenter}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition"
            >
              <Maximize2 className="h-3 w-3" />
              Fit Full Route
            </button>
            <span className="text-[10px] text-slate-500 font-mono">Cyan Line (#06b6d4)</span>
          </div>
        </div>
      )}

      {/* Selected Waypoint Modal */}
      {selectedPoint && (
        <div className="absolute top-4 right-14 z-20 max-w-xs p-3.5 rounded-xl bg-slate-900/95 backdrop-blur border border-slate-700 shadow-xl space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold uppercase">
              Stop #{selectedPoint.stopNumber}
            </span>
            <button
              onClick={() => setSelectedPoint(null)}
              className="text-slate-400 hover:text-white text-xs font-bold px-1 transition"
              aria-label="Close details"
            >
              ✕
            </button>
          </div>
          <div>
            <div className="font-bold text-sm text-white">{selectedPoint.name}</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/80 inline-block">
                {selectedPoint.category || 'landmark'}
              </span>
              {selectedPoint.distanceFromUserKm !== null && selectedPoint.distanceFromUserKm !== undefined && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 inline-block">
                  📍 {selectedPoint.distanceFromUserKm} km away
                </span>
              )}
            </div>
          </div>
          {selectedPoint.description && (
            <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
              {selectedPoint.description}
            </p>
          )}
          {/* Human-Readable Address / Real Street Location */}
          <div className="flex items-start gap-1.5 pt-1.5 border-t border-slate-800 text-[11px] text-slate-300">
            {selectedPoint.isGeocoding ? (
              <Loader2 className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5 animate-spin" />
            ) : (
              <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="line-clamp-3 leading-tight block text-slate-200 font-normal">
                {selectedPoint.isGeocoding && !selectedPoint.address ? (
                  <span className="text-cyan-400/80 italic font-mono text-[10px]">Resolving street address...</span>
                ) : (
                  selectedPoint.address || selectedPoint.description || selectedPoint.formatted_address || `${selectedPoint.name} location`
                )}
              </span>
              {selectedPoint.isGeocoding && selectedPoint.address && (
                <span className="text-[9px] text-cyan-400/70 block mt-0.5 font-mono">Verifying precise street...</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
