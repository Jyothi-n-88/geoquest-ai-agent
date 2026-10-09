import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Send,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  MapPin,
  Clock,
  Compass,
  CloudSun,
  Activity,
  Layers,
  ChevronDown,
  ChevronRight,
  Database,
  ArrowRight,
  Mic,
  MicOff,
  Navigation,
  AlertTriangle,
  Info,
} from 'lucide-react';

export default function AgentTerminal({
  activeRoute,
  onRouteGenerated,
  onRouteApproved,
  onLocationChange,
}) {
  const [prompt, setPrompt] = useState(
    'Find Shiva temples spots near me'
  );
  const [loading, setLoading] = useState(false);
  const [agentResponse, setAgentResponse] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState('Route reviewed and approved by user');
  const [expandedTools, setExpandedTools] = useState({});

  // Web Speech API Voice States
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechToast, setSpeechToast] = useState(null); // { message, type: 'error' | 'info' }
  const recognitionRef = useRef(null);

  // Default fallback coordinates: Bengaluru [lat: 12.9716, lng: 77.5946] (replaces legacy Dubai [25.1416, 55.2057] defaults)
  const BENGALURU_DEFAULT_COORDS = { lat: 12.9716, lng: 77.5946 };

  // Browser Geolocation ("Near Me") State - Initialized to Bengaluru default [12.9716, 77.5946]
  const [userLocation, setUserLocation] = useState(BENGALURU_DEFAULT_COORDS); // { lat, lng }
  const [geoStatus, setGeoStatus] = useState('detecting'); // 'detecting' | 'detected' | 'denied' | 'unsupported'

  // Capture user coordinates on mount or refresh
  const detectUserLocation = (showToastNotice = false) => {
    if (!('geolocation' in navigator)) {
      console.warn('⚠️ [GeoQuest GPS] Geolocation API not supported in this browser. Defaulting to Bengaluru [12.9716, 77.5946].');
      setUserLocation(BENGALURU_DEFAULT_COORDS);
      setGeoStatus('unsupported');
      return;
    }

    setGeoStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const coords = {
          lat: Number(lat.toFixed(5)),
          lng: Number(lng.toFixed(5)),
        };
        setUserLocation(coords);
        setGeoStatus('detected');
        if (typeof onLocationChange === 'function') {
          onLocationChange(coords);
        }
        console.log(`📍 [GeoQuest GPS] Detected live coordinates: lat=${coords.lat}, lng=${coords.lng}`);
        if (showToastNotice) {
          setSpeechToast({
            type: 'info',
            message: `📍 GPS Detected: [${coords.lat}, ${coords.lng}]. Ready for "near me" commands.`,
          });
        }
      },
      (error) => {
        console.warn('⚠️ [GeoQuest GPS] Geolocation capture failed or denied:', error.message);
        setUserLocation(BENGALURU_DEFAULT_COORDS);
        setGeoStatus('denied');
        if (showToastNotice) {
          setSpeechToast({
            type: 'info',
            message: '⚠️ Location permission denied. Defaulting to Bengaluru [12.9716, 77.5946].',
          });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  };

  // Check Web Speech API support & trigger Geolocation on initial mount
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const supported = Boolean(SpeechRecognition);
    setSpeechSupported(supported);
    console.log(`🎤 [GeoQuest Speech] Web Speech API supported: ${supported}`);

    // Detect user coordinates on initial mount
    detectUserLocation(false);

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Cleanup ignore
        }
      }
    };
  }, []);

  // Web Speech API Voice Toggle with robust logging and user error notifications
  const toggleListening = () => {
    setSpeechToast(null);

    // If currently listening, stop the session cleanly
    if (isListening) {
      console.log('🎤 [GeoQuest Speech] Stopping active speech recognition session...');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn('⚠️ [GeoQuest Speech] Stop error:', e);
        }
      }
      setIsListening(false);
      return;
    }

    // Check browser support
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const err = 'Speech Recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.';
      console.error('❌ [GeoQuest Speech]', err);
      setSpeechToast({ type: 'error', message: err });
      alert(err);
      return;
    }

    try {
      console.log('🎤 [GeoQuest Speech] Initializing SpeechRecognition instance...');
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('🎤 [GeoQuest Speech] Speech recognition session STARTED. Listening for voice input...');
        setIsListening(true);
        setSpeechToast({
          type: 'info',
          message: '🎙️ Listening... Speak your destination command (e.g., "Find Shiva temples near me")',
        });
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        console.log(`🎤 [GeoQuest Speech] Transcribed speech: "${transcript}"`);
        if (transcript.trim()) {
          setPrompt(transcript.trim());
        }
      };

      recognition.onerror = (event) => {
        console.warn('⚠️ [GeoQuest Speech] Recognition error encountered:', event.error);
        setIsListening(false);

        let errorMsg = `Speech recognition error: ${event.error}`;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          errorMsg = 'Microphone permission blocked. Please click the lock/camera icon in your address bar to allow microphone access.';
          alert(errorMsg);
        } else if (event.error === 'no-speech') {
          errorMsg = 'No speech detected. Please speak closer to your microphone and try again.';
        } else if (event.error === 'audio-capture') {
          errorMsg = 'No microphone device was detected on your computer.';
          alert(errorMsg);
        } else if (event.error === 'network') {
          errorMsg = 'Network connection issue during speech recognition.';
        }

        setSpeechToast({ type: 'error', message: errorMsg });
      };

      recognition.onend = () => {
        console.log('🎤 [GeoQuest Speech] Speech recognition session ENDED.');
        setIsListening(false);
      };

      console.log('🎤 [GeoQuest Speech] Calling recognition.start()...');
      recognition.start();
    } catch (startErr) {
      console.error('❌ [GeoQuest Speech] Failed to start recognition instance:', startErr);
      setIsListening(false);
      const errMsg = `Failed to start microphone: ${startErr.message}. Check browser permissions.`;
      setSpeechToast({ type: 'error', message: errMsg });
      alert(errMsg);
    }
  };

  const samplePrompts = [
    { label: 'Shiva Temples Near Me', query: 'Find Shiva temples spots near me' },
    { label: 'Artisan Cafes & Scenic Spots', query: 'Find specialty artisan cafes and scenic spots near me' },
    { label: '1-Day Bengaluru Crawl', query: 'Plan a 1-day heritage and cafe crawl in Bengaluru with 3 curated spots' },
    { label: 'Mumbai Coastal & Coffee', query: 'Find coastal heritage sights and specialty coffee in Mumbai' },
  ];

  /**
   * Submit Prompt to ReAct Agent with Live Browser Geolocation
   * 1. Checks if navigator.geolocation is available
   * 2. Calls navigator.geolocation.getCurrentPosition()
   * 3. Extracts lat = position.coords.latitude, lng = position.coords.longitude
   * 4. Sends payload: { prompt: textToRun, userLocation: { lat, lng } }
   * 5. Falls back to { prompt: textToRun } if denied or unavailable
   * 6. Wraps fetch logic inside callbacks so it waits for GPS before executing
   */
  const handleExecute = (customPrompt) => {
    const textToRun = customPrompt || prompt;
    if (!textToRun.trim() || loading) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }

    setLoading(true);
    setApprovalStatus(null);
    setSpeechToast(null);

    // Default Bengaluru fallback coordinates [12.9716, 77.5946] as required by specifications
    const BENGALURU_FALLBACK = { lat: 12.9716, lng: 77.5946 };

    // Inner sender function that performs the POST /api/agent/command fetch
    const sendCommand = async (userLocationCoords) => {
      // Ensure payload explicitly transmits the live coordinates; if none detected, fall back to Bengaluru [12.9716, 77.5946]
      const finalCoords = userLocationCoords || userLocation || BENGALURU_FALLBACK;
      const payload = {
        prompt: textToRun,
        userLocation: finalCoords,
      };

      console.log('🚀 [GeoQuest Command] Sending request to POST /api/agent/command with live coordinates:', payload);

      try {
        const res = await fetch('/api/agent/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        setAgentResponse(data);

        if (data.proposedRoute) {
          onRouteGenerated(data.proposedRoute, data.routeId);
        }
        if (data.status === 'requires_approval') {
          setApprovalStatus('requires_approval');
        }
      } catch (err) {
        console.error('❌ [GeoQuest Command Error]:', err);
        setAgentResponse({
          success: false,
          thoughts: [`Error during ReAct execution: ${err.message}`],
          toolCallsMade: [],
          proposedRoute: null,
          routeId: null,
          status: 'completed',
          message: 'Failed to communicate with agent endpoint.',
        });
      } finally {
        setLoading(false);
      }
    };

    // If live browser location is already in state, send immediately while refreshing in background
    if (userLocation && geoStatus === 'detected') {
      sendCommand(userLocation);
      return;
    }

    // Check if navigator.geolocation is available in browser
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        // Success callback: extract live GPS coordinates and send userLocation payload
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const coords = {
            lat: Number(lat.toFixed(5)),
            lng: Number(lng.toFixed(5)),
          };
          setUserLocation(coords);
          setGeoStatus('detected');
          sendCommand(coords);
        },
        // Error callback: user denied permissions or timeout; notify user & fall back to Bengaluru [12.9716, 77.5946]
        (error) => {
          console.warn('⚠️ [GeoQuest GPS] Geolocation permission denied or failed:', error.message);
          setGeoStatus('denied');
          setSpeechToast({
            type: 'error',
            message: '⚠️ Location permission denied or timed out. Defaulting to Bengaluru [12.9716, 77.5946].',
          });
          sendCommand(BENGALURU_FALLBACK);
        },
        {
          enableHighAccuracy: true,
          timeout: 7000,
          maximumAge: 30000,
        }
      );
    } else {
      // Browser does not support geolocation; inform user and fall back to Bengaluru [12.9716, 77.5946]
      setGeoStatus('unsupported');
      setSpeechToast({
        type: 'error',
        message: '⚠️ Geolocation not supported by browser. Defaulting to Bengaluru [12.9716, 77.5946].',
      });
      sendCommand(BENGALURU_FALLBACK);
    }
  };

  // Human Oversight Gatekeeper: Approve or Reject
  const handleApprovalAction = async (action) => {
    const targetRouteId = agentResponse?.routeId || activeRoute?._id;
    if (!targetRouteId || approvalLoading) return;

    setApprovalLoading(true);
    try {
      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: targetRouteId,
          action,
          notes: approvalNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setApprovalStatus(action === 'approve' ? 'approved' : 'rejected');
        if (onRouteApproved) {
          onRouteApproved(data.route || { ...activeRoute, status: action === 'approve' ? 'approved' : 'rejected' });
        }
      } else {
        alert(`Approval error: ${data.error}`);
      }
    } catch (err) {
      alert(`Approval request failed: ${err.message}`);
    } finally {
      setApprovalLoading(false);
    }
  };

  const toggleToolExpand = (index) => {
    setExpandedTools((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800 text-slate-100 font-sans">
      {/* Terminal Title Bar */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-sm">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-tight">
                GeoQuest Agent
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/60 font-semibold flex items-center gap-1 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                llama-3.3-70b-versatile
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Autonomous Spatial Planning Console</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isListening && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/90 border border-red-600 text-[10px] text-red-300 font-mono animate-pulse shadow-md shadow-red-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
              <span>Listening...</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-800/60 text-[11px] font-mono text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Ready</span>
          </div>
        </div>
      </div>

      {/* Speech Notification Banner / Toast */}
      {speechToast && (
        <div
          className={`mx-4 mt-3 p-2.5 rounded-xl text-xs flex items-start gap-2 shadow-lg transition animate-fadeIn ${
            speechToast.type === 'error'
              ? 'bg-amber-950/70 border border-amber-600/80 text-amber-200'
              : 'bg-cyan-950/70 border border-cyan-700/80 text-cyan-200'
          }`}
        >
          {speechToast.type === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-[11px] leading-tight">
            <span>{speechToast.message}</span>
          </div>
          <button
            onClick={() => setSpeechToast(null)}
            className="text-slate-400 hover:text-white font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Scrollable Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {/* Streamlined Suggested Prompts as Compact Pill-Chips */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-amber-400" />
              Suggested Spatial Commands:
            </span>
            <span className="text-[10px] text-slate-500 font-mono">click to execute</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {samplePrompts.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setPrompt(item.query);
                  handleExecute(item.query);
                }}
                disabled={loading}
                title={item.query}
                className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/90 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/60 text-[11px] text-slate-300 hover:text-white transition shadow-sm active:scale-95 disabled:opacity-40"
              >
                <Compass className="h-3 w-3 text-cyan-400 group-hover:rotate-45 transition-transform shrink-0" />
                <span className="truncate max-w-[200px]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Loading State Banner */}
        {loading && (
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/40 flex items-center gap-3 animate-pulse shadow-lg shadow-cyan-500/5">
            <RefreshCw className="h-4 w-4 text-cyan-400 animate-spin shrink-0" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-white">ReAct Agent Planning Route...</p>
              <p className="text-[10px] text-slate-400 font-mono">
                Executing spatial functions (places, routes) & assembling GeoJSON
              </p>
            </div>
          </div>
        )}

        {/* Human Oversight Gatekeeper Banner & Approval Buttons */}
        {agentResponse?.proposedRoute && (
          <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/60 space-y-3 shadow-xl ring-1 ring-amber-500/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Human Oversight Gatekeeper
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold ${
                  approvalStatus === 'approved'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : approvalStatus === 'rejected'
                    ? 'bg-red-950 text-red-300 border border-red-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}
              >
                {approvalStatus || 'pending_approval'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white truncate max-w-[220px]">
                  {agentResponse.proposedRoute.title}
                </span>
                <span className="text-[10px] font-mono text-cyan-400 shrink-0">
                  {agentResponse.proposedRoute.totalDistanceKm} km
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                {agentResponse.proposedRoute.locations?.length || 0} curated stops mapped. Confirm to persist to MongoDB Atlas.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-mono uppercase">Approval Notes / Audit Log:</label>
              <input
                type="text"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={() => handleApprovalAction('reject')}
                disabled={approvalLoading || approvalStatus === 'rejected'}
                className="flex-1 py-2 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-800/80 text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
              <button
                onClick={() => handleApprovalAction('approve')}
                disabled={approvalLoading || approvalStatus === 'approved'}
                className="flex-1 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-40 shadow-md shadow-emerald-500/20"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {approvalStatus === 'approved' ? 'Approved & Committed' : 'Approve Route'}
              </button>
            </div>
          </div>
        )}

        {/* Collapsible ReAct Debug Inspector (Thoughts & Tool Trace) */}
        {(agentResponse?.thoughts?.length > 0 || agentResponse?.toolCallsMade?.length > 0) && (
          <details className="group rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden text-xs transition shadow-md">
            <summary className="p-3 cursor-pointer select-none flex items-center justify-between hover:bg-slate-800/40 transition list-none">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-purple-950/80 border border-purple-700/50 flex items-center justify-center text-purple-400">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-slate-200 block text-xs">
                    ReAct Reasoning & Tool Inspector
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {agentResponse.thoughts?.length || 0} thoughts • {agentResponse.toolCallsMade?.length || 0} tool calls
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 group-open:text-purple-400 transition">
                <span className="text-[10px] font-mono group-open:hidden">Inspect</span>
                <span className="text-[10px] font-mono hidden group-open:inline">Hide</span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </div>
            </summary>

            <div className="p-3 border-t border-slate-800/80 bg-slate-950/70 space-y-3.5">
              {/* Cognitive Thoughts Log */}
              {agentResponse?.thoughts?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 font-semibold">
                    <Cpu className="h-3 w-3" />
                    Agent Thoughts & Reasoning ({agentResponse.thoughts.length})
                  </span>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {agentResponse.thoughts.map((thought, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 font-mono leading-relaxed"
                      >
                        {thought}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tool Calls Visualizer */}
              {agentResponse?.toolCallsMade?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 flex items-center gap-1.5 font-semibold">
                    <Activity className="h-3 w-3" />
                    Tool Execution Trace ({agentResponse.toolCallsMade.length})
                  </span>
                  <div className="space-y-1.5">
                    {agentResponse.toolCallsMade.map((call, idx) => {
                      const isExpanded = expandedTools[idx];
                      return (
                        <div
                          key={idx}
                          className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => toggleToolExpand(idx)}
                            className="w-full p-2 flex items-center justify-between text-left hover:bg-slate-800/50 transition"
                          >
                            <div className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                              <span className="font-mono font-semibold text-white text-[11px]">{call.tool}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-mono">
                              <span>Step {idx + 1}</span>
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="p-2.5 border-t border-slate-800/80 bg-slate-950 space-y-2 font-mono text-[10px]">
                              <div>
                                <span className="text-slate-500 uppercase text-[9px] block mb-0.5">Parameters:</span>
                                <pre className="p-2 rounded bg-slate-900 text-cyan-300 overflow-x-auto max-h-32">
                                  {JSON.stringify(call.args, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase text-[9px] block mb-0.5">Result:</span>
                                <pre className="p-2 rounded bg-slate-900 text-emerald-300 overflow-x-auto max-h-32">
                                  {JSON.stringify(call.output, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
      </div>

      {/* Input Bar at Bottom */}
      <div className="p-3.5 border-t border-slate-800 bg-slate-900/95 space-y-2">
        {/* GPS Location Indicator Badge */}
        <div className="flex items-center justify-between text-[11px] font-mono px-1">
          <button
            onClick={() => detectUserLocation(true)}
            title="Click to refresh browser GPS coordinates"
            className="flex items-center gap-1.5 text-slate-300 hover:text-cyan-300 transition group"
          >
            <Navigation
              className={`h-3.5 w-3.5 transition-transform ${
                geoStatus === 'detecting'
                  ? 'animate-spin text-cyan-400'
                  : geoStatus === 'detected'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            />
            <span className="font-medium">
              {geoStatus === 'detected' && userLocation
                ? `📍 GPS: Live (${userLocation.lat}, ${userLocation.lng})`
                : geoStatus === 'detecting'
                ? '📍 GPS: Detecting coordinates...'
                : '📍 GPS: Bengaluru Fallback [12.9716, 77.5946]'}
            </span>
            <span className="text-[10px] text-slate-500 group-hover:text-slate-400 underline ml-1">
              {geoStatus === 'detected' ? '(Refresh GPS)' : '(Detect Live GPS)'}
            </span>
          </button>

          {geoStatus === 'detected' && userLocation ? (
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live GPS Active
            </span>
          ) : (
            <span className="text-[10px] text-amber-400/90 font-mono flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Bengaluru Center
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            disabled={loading}
            placeholder={
              isListening
                ? 'Listening... Speak your destination command...'
                : 'Type or speak a spatial command (e.g. Find cafes near me)...'
            }
            className={`flex-1 bg-slate-950 border rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition ${
              isListening
                ? 'border-red-500/80 shadow-md shadow-red-500/20'
                : 'border-slate-700 focus:border-cyan-500'
            }`}
          />

          {/* Voice Input Button (Web Speech API) */}
          {speechSupported ? (
            <button
              type="button"
              onClick={toggleListening}
              disabled={loading}
              title={isListening ? 'Stop listening' : 'Start voice command (Web Speech API)'}
              className={`p-2 rounded-xl border transition flex items-center justify-center shrink-0 ${
                isListening
                  ? 'bg-red-500 text-white border-red-400 animate-pulse shadow-lg shadow-red-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
              }`}
            >
              {isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
              }}
              title="Speech recognition not supported in this browser"
              className="p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-600 hover:text-slate-400 shrink-0"
            >
              <MicOff className="h-4 w-4" />
            </button>
          )}

          {/* Execute Button */}
          <button
            onClick={() => handleExecute()}
            disabled={loading || !prompt.trim()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-semibold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-40 shrink-0 shadow-md shadow-cyan-500/20"
          >
            {loading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-black" />
            ) : (
              <Send className="h-3.5 w-3.5 text-black" />
            )}
            <span>Execute</span>
          </button>
        </div>
      </div>
    </div>
  );
}
