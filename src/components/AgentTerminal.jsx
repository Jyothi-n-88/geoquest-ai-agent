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
}) {
  const [prompt, setPrompt] = useState(
    'Find specialty artisan cafes and scenic spots near me'
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

  // Browser Geolocation ("Near Me") State
  const [userLocation, setUserLocation] = useState(null); // { lat, lng }
  const [geoStatus, setGeoStatus] = useState('detecting'); // 'detecting' | 'detected' | 'denied' | 'unsupported'

  // Capture user coordinates using navigator.geolocation
  const detectUserLocation = (showToastNotice = false) => {
    if (!('geolocation' in navigator)) {
      console.warn('⚠️ [GeoQuest GPS] Geolocation API not supported in this browser.');
      setGeoStatus('unsupported');
      return;
    }

    setGeoStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coords = {
          lat: Number(latitude.toFixed(5)),
          lng: Number(longitude.toFixed(5)),
        };
        setUserLocation(coords);
        setGeoStatus('detected');
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
        setGeoStatus('denied');
        if (showToastNotice) {
          setSpeechToast({
            type: 'info',
            message: '⚠️ Location permission denied. The agent will use city default coordinates.',
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
          message: '🎙️ Listening... Speak your destination command (e.g., "Find cafes near me")',
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
    'Find specialty artisan cafes and scenic spots near me',
    'Plan an afternoon walking discovery trail around here',
    'Plan a 1-day heritage and cafe crawl in Bengaluru with 3 curated spots',
    'Find coastal heritage sights and specialty coffee in Mumbai',
  ];

  // Submit Prompt to ReAct Agent endpoint with userLocation payload
  const handleExecute = async (customPrompt) => {
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

    // If geolocation hasn't been captured yet and browser supports it, do a quick capture
    let activeCoords = userLocation;
    if (!activeCoords && 'geolocation' in navigator && geoStatus !== 'denied') {
      try {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              activeCoords = {
                lat: Number(pos.coords.latitude.toFixed(5)),
                lng: Number(pos.coords.longitude.toFixed(5)),
              };
              setUserLocation(activeCoords);
              setGeoStatus('detected');
              resolve();
            },
            () => resolve(),
            { timeout: 2500 }
          );
        });
      } catch {
        // Proceed with null if timeout
      }
    }

    // Payload includes userLocation: { lat, lng }
    const payload = {
      prompt: textToRun,
      userLocation: activeCoords ? { lat: activeCoords.lat, lng: activeCoords.lng } : null,
    };

    console.log('🚀 [GeoQuest Command] Sending request to POST /api/agent/command:', payload);

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
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              GeoQuest ReAct Agent
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                gemini-3.8-flash
              </span>
            </h1>
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
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active</span>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Quick Sample Prompts */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            Suggested Spatial Commands:
          </span>
          <div className="flex flex-col gap-1.5">
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setPrompt(p);
                  handleExecute(p);
                }}
                disabled={loading}
                className="text-left text-xs p-2 rounded-lg bg-slate-950 hover:bg-slate-800/80 text-slate-300 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between group"
              >
                <span className="line-clamp-1">{p}</span>
                <ArrowRight className="h-3 w-3 text-slate-500 group-hover:text-cyan-400 shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>

        {/* Human Oversight Gatekeeper Banner & Approval Buttons */}
        {agentResponse?.proposedRoute && (
          <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/60 space-y-3.5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Human Oversight Gatekeeper
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
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

            <p className="text-xs text-slate-300 leading-relaxed">
              The agent constructed an itinerary (<span className="font-semibold text-white">{agentResponse.proposedRoute.title}</span>)
              spanning {agentResponse.proposedRoute.totalDistanceKm} km across {agentResponse.proposedRoute.locations?.length || 0} stops.
              Confirm to persist to MongoDB Atlas.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400">Approval Notes:</label>
              <input
                type="text"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
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

        {/* Cognitive Thoughts Log */}
        {agentResponse?.thoughts?.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              Agent Thoughts & Reasoning ({agentResponse.thoughts.length})
            </span>
            <div className="space-y-1.5">
              {agentResponse.thoughts.map((thought, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed"
                >
                  {thought}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tool Calls Visualizer */}
        {agentResponse?.toolCallsMade?.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Tool Execution Trace ({agentResponse.toolCallsMade.length})
            </span>
            <div className="space-y-2">
              {agentResponse.toolCallsMade.map((call, idx) => {
                const isExpanded = expandedTools[idx];
                return (
                  <div
                    key={idx}
                    className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs"
                  >
                    <button
                      onClick={() => toggleToolExpand(idx)}
                      className="w-full p-2.5 flex items-center justify-between text-left hover:bg-slate-800/50 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        <span className="font-mono font-semibold text-white">{call.tool}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                        <span>Step {idx + 1}</span>
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-3 border-t border-slate-800/80 bg-slate-950 space-y-2 font-mono text-[11px]">
                        <div>
                          <span className="text-slate-500 uppercase text-[10px] block mb-0.5">Parameters:</span>
                          <pre className="p-2 rounded bg-slate-900 text-cyan-300 overflow-x-auto">
                            {JSON.stringify(call.args, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <span className="text-slate-500 uppercase text-[10px] block mb-0.5">Result:</span>
                          <pre className="p-2 rounded bg-slate-900 text-emerald-300 overflow-x-auto max-h-36">
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
                ? `📍 Location: Detected (${userLocation.lat}, ${userLocation.lng})`
                : geoStatus === 'detecting'
                ? '📍 Location: Detecting GPS...'
                : '📍 Location: City Default'}
            </span>
            <span className="text-[10px] text-slate-500 group-hover:text-slate-400 underline ml-1">
              {geoStatus === 'detected' ? '(Refresh)' : '(Click to Detect)'}
            </span>
          </button>

          {geoStatus === 'detected' && userLocation ? (
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              GPS Ready for "Near Me"
            </span>
          ) : (
            <span className="text-[10px] text-slate-500">
              Using Fallback Center
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
