import React, { useState, useEffect } from 'react';
import AgentTerminal from './components/AgentTerminal.jsx';
import Map from './components/Map.jsx';
import {
  Compass,
  Database,
  Cpu,
  Layers,
  History,
  Activity,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export default function App() {
  const [activeRoute, setActiveRoute] = useState(null);
  const [activeGeoJSON, setActiveGeoJSON] = useState(null);
  const [userLocation, setUserLocation] = useState({ lat: 12.9716, lng: 77.5946 }); // Bengaluru default
  const [recentRoutes, setRecentRoutes] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState({ isConnected: false, status: 'connecting' });

  // Fetch initial health & recent routes
  const refreshData = async () => {
    try {
      const healthRes = await fetch('/api/health');
      const healthData = await healthRes.json();
      if (healthData?.database) {
        setDbStatus(healthData.database);
      }

      const routesRes = await fetch('/api/agent/routes');
      const routesData = await routesRes.json();
      if (routesData?.success && Array.isArray(routesData.routes)) {
        setRecentRoutes(routesData.routes);

        // If no active route yet, pick the latest approved or staged route
        if (!activeRoute && routesData.routes.length > 0) {
          const latest = routesData.routes[0];
          setActiveRoute(latest);
          setActiveGeoJSON(latest.geojson);
        }
      }
    } catch (e) {
      console.warn('Initial sync failed', e);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Callback when AgentTerminal generates a proposed route
  const handleRouteGenerated = (proposedRoute, routeId) => {
    const routeObj = {
      ...proposedRoute,
      _id: routeId,
    };
    setActiveRoute(routeObj);
    setActiveGeoJSON(proposedRoute.geojson);
    refreshData();
  };

  // Callback when Human Oversight approves/rejects a route
  const handleRouteApproved = (updatedRoute) => {
    setActiveRoute(updatedRoute);
    if (updatedRoute?.geojson) {
      setActiveGeoJSON(updatedRoute.geojson);
    }
    refreshData();
  };

  // Select route from history list
  const handleSelectHistoryRoute = (route) => {
    setActiveRoute(route);
    setActiveGeoJSON(route.geojson);
    setHistoryOpen(false);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-5 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Compass className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                GeoQuest
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 font-mono font-medium">
                Autonomous ReAct Engine
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Spatial Planning Agent • Groq LLaMA-3.3 • Human Oversight Gatekeeper
            </p>
          </div>
        </div>

        {/* Center / Right Badges */}
        <div className="flex items-center gap-2.5">
          {/* Database Connectivity Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono text-slate-300">
              MongoDB {dbStatus.isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* Model Status */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-amber-500/30 text-xs shadow-sm">
            <Cpu className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] font-mono text-amber-300">llama-3.3-70b-versatile</span>
          </div>

          {/* History Drawer Toggle Button */}
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
          >
            <History className="h-3.5 w-3.5 text-cyan-400" />
            <span>Routes ({recentRoutes.length})</span>
          </button>
        </div>
      </header>

      {/* Main Responsive Split-Screen View */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Column (35-40% width): Agent Terminal */}
        <section className="w-full md:w-[38%] h-1/2 md:h-full z-10 flex flex-col">
          <AgentTerminal
            activeRoute={activeRoute}
            onRouteGenerated={handleRouteGenerated}
            onRouteApproved={handleRouteApproved}
            onLocationChange={(coords) => setUserLocation(coords)}
          />
        </section>

        {/* Right Column (60-62% width): Mapbox Spatial Component */}
        <section className="w-full md:w-[62%] h-1/2 md:h-full relative overflow-hidden">
          <Map
            geojson={activeGeoJSON}
            activeRoute={activeRoute}
            userLocation={userLocation}
            onSelectWaypoint={(waypoint) => {
              console.log('Selected Waypoint:', waypoint);
            }}
          />
        </section>

        {/* History Modal / Slide-out Drawer */}
        {historyOpen && (
          <div className="absolute top-0 right-0 h-full w-full sm:w-96 bg-slate-900/98 backdrop-blur-xl border-l border-slate-800 shadow-2xl z-40 p-5 flex flex-col animate-slideLeft">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Stored Spatial Routes</h2>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
              {recentRoutes.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-10">
                  No routes stored yet. Execute an agent prompt to generate an itinerary.
                </div>
              ) : (
                recentRoutes.map((route, idx) => (
                  <div
                    key={route._id || idx}
                    onClick={() => handleSelectHistoryRoute(route)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition space-y-1.5 ${
                      activeRoute?._id === route._id
                        ? 'bg-cyan-950/40 border-cyan-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white line-clamp-1">
                        {route.metadata?.routeTitle || route.userPrompt?.substring(0, 32) || 'Curated Itinerary'}
                      </span>
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded ${
                          route.status === 'approved'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : route.status === 'rejected'
                            ? 'bg-red-950 text-red-400 border border-red-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {route.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-1">{route.userPrompt}</p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                      <span>{route.locations?.length || 0} stops</span>
                      <span>{route.metadata?.totalDistanceKm || 0} km</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
