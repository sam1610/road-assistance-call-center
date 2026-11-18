import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * RoadAssistWidget — Custom launcher for Amazon Connect Communications Widget
 *
 * Two modes once launched:
 *   WELCOME  — shows BETA header + avatar + Start Conversation / Start Call + tiles
 *   CHAT     — shrinks to compact "Road Assistance" header + 2 small buttons,
 *              then the Connect native chat iframe fills the remaining space
 *   CALL     — compact header, voice session in progress via Connect widget
 *
 * The Connect widget script is loaded in index.html (snippetId already set).
 * We hide the native Connect FAB via CSS and drive everything from our own FAB.
 */

interface RoadAssistWidgetProps {
  onStartChat:       () => void;   // fires ACXD pipeline for dashboard
  onStartCall:       () => void;   // no-op fallback
  chatConnected:     boolean;
  callStatus:        'idle' | 'connecting' | 'active' | 'error';
  activeIncidentStatus?: string;
  customerPhone:     string;
  customerPlate?:    string;
  locationGeohash?:  string;
}

// ── CSS: animations + hide the native Connect FAB ────────────────────────────
const WIDGET_CSS = `
@keyframes raWidgetPulse {
  0%   { box-shadow: 0 0 0 0    rgba(22,163,74,0.8); }
  70%  { box-shadow: 0 0 0 18px rgba(22,163,74,0);   }
  100% { box-shadow: 0 0 0 0    rgba(22,163,74,0);   }
}
@keyframes raSlideIn {
  from { opacity:0; transform:translateY(18px) scale(0.96); }
  to   { opacity:1; transform:translateY(0)    scale(1);    }
}
@keyframes raBubbleIn {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0);   }
}

/* ── Hide the native Connect widget launcher FAB ──────────────────────────
   The official way is customLaunchBehavior.skipIconButtonAndAutoOpen in
   index.html. This CSS is a belt-and-suspenders backup targeting the
   launcher iframe by its known fixed dimensions (≤ 100px). ────────────── */
iframe[src*="connectwidget"][src*="launcher"],
iframe[title*="launcher" i],
iframe[title*="widget-launcher" i] {
  display: none !important;
}
`;

const ac = (cmd: string, arg?: unknown) => {
  const fn = (window as any).amazon_connect;
  if (typeof fn === 'function') {
    if (arg !== undefined) fn(cmd, arg);
    else fn(cmd);
  }
};

const isWidgetReady = () =>
  typeof (window as any).amazon_connect === 'function';

type PanelView = 'welcome' | 'chat' | 'call';

export const RoadAssistWidget: React.FC<RoadAssistWidgetProps> = ({
  onStartChat,
  onStartCall,
  chatConnected,
  callStatus,
  activeIncidentStatus,
  customerPhone,
  customerPlate   = 'BHR-1001',
  locationGeohash = 'thev0z',
}) => {
  const [open, setOpen]             = useState(false);
  const [view, setView]             = useState<PanelView>('welcome');
  const [widgetReady, setWidgetReady] = useState(false);
  const panelRef                    = useRef<HTMLDivElement>(null);
  const pollRef                     = useRef<ReturnType<typeof setInterval>>(undefined);

  // ── Inject CSS once ───────────────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById('ra-widget-css')) return;
    const el = document.createElement('style');
    el.id = 'ra-widget-css';
    el.textContent = WIDGET_CSS;
    document.head.appendChild(el);
  }, []);

  // ── Poll for widget script ready ──────────────────────────────────────────
  useEffect(() => {
    if (widgetReady) return;
    pollRef.current = setInterval(() => {
      if (isWidgetReady()) {
        setWidgetReady(true);
        clearInterval(pollRef.current);
      }
    }, 300);
    return () => clearInterval(pollRef.current);
  }, [widgetReady]);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', h), 150);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
  }, [open]);

  // ── Force widget wrapper styles via MutationObserver ────────────────────────
  //    Amazon Connect sets its own inline styles, which defeat stylesheet rules.
  //    We use setProperty(..., 'important') — the only way to beat existing
  //    inline styles — and disconnect the observer the moment the node is found
  //    so it doesn't keep running after the job is done.
  useEffect(() => {
    const SELECTORS = [
      // Primary: the outer wrapper div the SDK injects
      'div[id*="amazon-connect-chat-widget"]',
      'div[id*="amazon-connect"]',
      // Fallback: root iframe if SDK structure changes
      'iframe[id*="amazon-connect-chat-widget"]',
      'iframe[src*="connectwidget"]',
    ];

    const applyAndDisconnect = (observer: MutationObserver, wrapper: HTMLElement) => {
      // Wrapper dimensions — 420 × 700 gives the View form room to breathe
      wrapper.style.setProperty('width',      '420px',  'important');
      wrapper.style.setProperty('height',     '700px',  'important');
      wrapper.style.setProperty('max-width',  '95vw',   'important');
      wrapper.style.setProperty('max-height', '95vh',   'important');
      wrapper.style.setProperty('overflow',   'hidden', 'important');
      // Inner iframe: fill the wrapper completely
      wrapper.querySelectorAll('iframe').forEach((frame) => {
        frame.style.setProperty('width',  '100%', 'important');
        frame.style.setProperty('height', '100%', 'important');
        frame.style.setProperty('border', 'none', 'important');
      });
      // Disconnect immediately — no reason to keep observing after success
      observer.disconnect();
    };

    // Check whether a node or any descendant matches our selectors
    const findWidget = (root: HTMLElement): HTMLElement | null => {
      for (const sel of SELECTORS) {
        if (root.matches?.(sel)) return root;
        const found = root.querySelector<HTMLElement>(sel);
        if (found) return found;
      }
      return null;
    };

    // 1. Widget may already be in the DOM on re-mount — check immediately
    for (const sel of SELECTORS) {
      const existing = document.querySelector<HTMLElement>(sel);
      if (existing) {
        const noop = new MutationObserver(() => {});
        applyAndDisconnect(noop, existing);
        return; // handled synchronously, no live observer needed
      }
    }

    // 2. Widget not yet injected — watch for it
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          const widget = findWidget(node);
          if (widget) {
            applyAndDisconnect(observer, widget);
            return; // stop processing further mutations
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    // Cleanup if component unmounts before the widget appears
    return () => observer.disconnect();
  }, []); // run once on mount

  // ── Push GPS geohash as contact attributes as soon as widget is ready ────
  //    This covers the case where the user opens the native Connect FAB
  //    directly without going through our welcome panel buttons.
  useEffect(() => {
    if (!widgetReady) return;
    ac('contactAttributes', {
      customerIdentifier: customerPhone,
      plateNumber:        customerPlate,
      locationGeohash:    locationGeohash,
      channelType:        'CHAT',
    });
  }, [widgetReady, customerPhone, customerPlate, locationGeohash]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStartChat = useCallback(() => {
    // Inject contact attributes so SAM1610 receives them in the flow
    ac('contactAttributes', {
      customerIdentifier: customerPhone,
      plateNumber:        customerPlate,
      locationGeohash:    locationGeohash,
      channelType:        'CHAT',
    });
    // Close our welcome panel — the native Connect widget opens its own
    // full chat UI (message bubbles, input bar) as a floating overlay
    setOpen(false);
    ac('open');
    onStartChat();  // runs ACXD pipeline for admin dashboard
  }, [customerPhone, customerPlate, locationGeohash, onStartChat]);

  const handleStartCall = useCallback(() => {
    // Inject attributes then open the native widget — the widget's voice panel
    // (logo + timer + Speaking) handles the WebRTC call UI natively
    ac('contactAttributes', {
      customerIdentifier: customerPhone,
      plateNumber:        customerPlate,
      locationGeohash:    locationGeohash,
      channelType:        'WEBRTC',
    });
    setOpen(false);
    ac('open');
    onStartCall();  // runs ACXD pipeline for admin dashboard
  }, [customerPhone, customerPlate, locationGeohash, onStartCall]);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Don't reset view — if chat is active let it stay
  }, []);

  const handleReset = useCallback(() => {
    setView('welcome');
    ac('close');
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isActive = chatConnected || callStatus === 'active';
  const fabBg    = isActive ? '#16a34a' : '#0f4c35';

  // ── Panel height: welcome = auto, chat/call = fixed tall ─────────────────
  const panelHeight = view === 'welcome' ? 'auto' : '580px';

  return (
    <>
      {/* ── Launcher (bottom-right) ─────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24,
        zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10,
        pointerEvents: 'none',
      }}>
        {/* Speech bubble when closed */}
        {!open && (
          <div
            onClick={() => setOpen(true)}
            style={{
              background: '#0f4c35', color: '#fff',
              padding: '9px 15px', borderRadius: '16px 16px 4px 16px',
              fontSize: '13px', fontWeight: 600, lineHeight: 1.4,
              maxWidth: 200, boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
              animation: 'raBubbleIn 0.3s ease', cursor: 'pointer',
              pointerEvents: 'all',
            }}
          >
            How can I help you today?
          </div>
        )}

        {/* FAB */}
        <button
          onClick={() => setOpen(v => !v)}
          aria-label="Road Assistance"
          style={{
            width: 62, height: 62, borderRadius: '50%',
            border: '3px solid #fff', background: fabBg,
            cursor: 'pointer', padding: 0, overflow: 'hidden',
            boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
            animation: isActive ? 'raWidgetPulse 2s infinite' : 'none',
            position: 'relative', transition: 'background 0.3s',
            pointerEvents: 'all',
          }}
        >
          <svg viewBox="0 0 64 64" width="62" height="62" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="32" fill={fabBg}/>
            <circle cx="32" cy="22" r="10" fill="#fde68a"/>
            <path d="M22 22 Q22 12 32 12 Q42 12 42 22" stroke="#1e293b" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
            <rect x="20" y="20" width="4" height="7" rx="2" fill="#1e293b"/>
            <rect x="40" y="20" width="4" height="7" rx="2" fill="#1e293b"/>
            <path d="M40 25 Q47 28 46 33" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round"/>
            <circle cx="46" cy="34" r="2" fill="#16a34a"/>
            <path d="M18 54 Q18 42 32 42 Q46 42 46 54" fill="#0f4c35"/>
            <path d="M20 48 Q32 46 44 48" stroke="#fbbf24" strokeWidth="2.5" fill="none"/>
          </svg>
          {isActive && (
            <span style={{
              position:'absolute', top:3, right:3,
              width:13, height:13, borderRadius:'50%',
              background:'#4ade80', border:'2px solid #fff',
            }}/>
          )}
          {!widgetReady && !isActive && (
            <span style={{
              position:'absolute', bottom:3, right:3,
              width:9, height:9, borderRadius:'50%',
              background:'#fbbf24', border:'1px solid #fff',
            }} title="Loading…"/>
          )}
        </button>
      </div>

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed', bottom: 100, right: 20,
            width: 348, height: panelHeight, maxHeight: 'calc(100vh - 120px)',
            borderRadius: 18,
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            zIndex: 9998, overflow: 'hidden',
            animation: 'raSlideIn 0.22s ease',
            fontFamily: 'system-ui,-apple-system,sans-serif',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* ── Header — compact when in chat/call, full when welcome ── */}
          {view === 'welcome' ? (
            // ── WELCOME HEADER ─────────────────────────────────────────
            <div style={{
              background: 'linear-gradient(140deg,#062214 0%,#0f4c35 100%)',
              padding: '16px 16px 0',
              flexShrink: 0,
            }}>
              <div style={{
                display:'inline-block', fontSize:'9px', fontWeight:700,
                color:'#4ade80', letterSpacing:'0.1em',
                border:'1px solid #16a34a', borderRadius:'3px',
                padding:'2px 6px', marginBottom:'12px',
              }}>BETA VERSION</div>

              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                {/* Avatar */}
                <div style={{
                  width:60, height:60, borderRadius:'50%', flexShrink:0,
                  border:'2px solid #16a34a', overflow:'hidden', background:'#062214',
                }}>
                  <svg viewBox="0 0 60 60" width="60" height="60" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="30" cy="30" r="30" fill="#0f4c35"/>
                    <circle cx="30" cy="22" r="10" fill="#fde68a"/>
                    <path d="M20 22 Q20 11 30 11 Q40 11 40 22" stroke="#1e293b" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                    <rect x="18" y="19" width="4" height="7" rx="2" fill="#1e293b"/>
                    <rect x="38" y="19" width="4" height="7" rx="2" fill="#1e293b"/>
                    <path d="M38 24 Q45 27 44 32" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round"/>
                    <circle cx="44" cy="33" r="2" fill="#16a34a"/>
                    <path d="M14 54 Q14 42 30 42 Q46 42 46 54" fill="#062214"/>
                    <path d="M17 48 Q30 45 43 48" stroke="#fbbf24" strokeWidth="2.5" fill="none"/>
                  </svg>
                </div>
                <div>
                  <div style={{ color:'#e2f8ee', fontSize:'20px', fontWeight:800, lineHeight:1.2 }}>Welcome..</div>
                  <div style={{ color:'#6ee7b7', fontSize:'11px', lineHeight:1.5, marginTop:3 }}>
                    I am your Road Assistance AI Agent SAM1610.
                  </div>
                </div>
              </div>

              <div style={{
                background:'rgba(0,0,0,0.2)', borderRadius:'8px 8px 0 0',
                padding:'6px 10px', display:'flex', gap:7, alignItems:'center',
                fontSize:'11px', color:'#6ee7b7',
              }}>
                <span style={{
                  width:7, height:7, borderRadius:'50%', flexShrink:0,
                  background: widgetReady ? '#16a34a' : '#fbbf24',
                }}/>
                {widgetReady ? `${customerPhone} | Available 24 / 7` : 'Connecting to Amazon Connect…'}
              </div>
            </div>
          ) : (
            // ── COMPACT HEADER (chat / call active) ────────────────────
            <div style={{
              background: '#0f4c35',
              padding: '10px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{
                  width:8, height:8, borderRadius:'50%',
                  background: view === 'call' ? '#fbbf24' : '#4ade80',
                  animation: 'raWidgetPulse 2s infinite',
                }}/>
                <span style={{ color:'#fff', fontWeight:700, fontSize:'14px' }}>
                  Road Assistance
                </span>
                <span style={{ color:'#6ee7b7', fontSize:'11px' }}>
                  {view === 'call' ? '📞 Voice' : '💬 Chat'}
                </span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {/* Compact Chat + Call buttons */}
                <button
                  onClick={handleStartChat}
                  title="Chat"
                  style={{
                    background: view==='chat' ? '#16a34a' : 'rgba(255,255,255,0.1)',
                    border: view==='chat' ? 'none' : '1px solid rgba(255,255,255,0.2)',
                    color:'#fff', borderRadius:8, padding:'4px 10px',
                    cursor:'pointer', fontSize:'12px', fontWeight:600,
                    display:'flex', alignItems:'center', gap:4,
                  }}
                >💬 Chat</button>
                <button
                  onClick={handleStartCall}
                  title="Call"
                  style={{
                    background: view==='call' ? '#16a34a' : 'rgba(255,255,255,0.1)',
                    border: view==='call' ? 'none' : '1px solid rgba(255,255,255,0.2)',
                    color:'#fff', borderRadius:8, padding:'4px 10px',
                    cursor:'pointer', fontSize:'12px', fontWeight:600,
                    display:'flex', alignItems:'center', gap:4,
                  }}
                >📞 Call</button>
                {/* Back / close */}
                <button
                  onClick={handleReset}
                  title="Back"
                  style={{
                    background:'rgba(255,255,255,0.08)', border:'none',
                    color:'#94a3b8', borderRadius:8, padding:'4px 8px',
                    cursor:'pointer', fontSize:'12px',
                  }}
                >← Back</button>
                <button
                  onClick={handleClose}
                  style={{
                    background:'transparent', border:'none',
                    color:'#94a3b8', cursor:'pointer', fontSize:'16px', padding:'0 4px',
                  }}
                >✕</button>
              </div>
            </div>
          )}

          {/* ── Body ─────────────────────────────────────────────────── */}
          <div style={{
            background: view === 'welcome' ? '#0a1a10' : '#000',
            flex: 1, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>

            {view === 'welcome' && (
              <div style={{ padding: '16px 16px 18px', overflowY:'auto', flex:1 }}>

                {/* Two primary CTAs */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                  <button
                    onClick={handleStartChat}
                    style={{
                      background:'linear-gradient(135deg,#0f4c35,#22c55e)',
                      color:'#fff', border:'none', padding:'13px 8px',
                      borderRadius:12, cursor:'pointer', fontWeight:700, fontSize:'14px',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                      boxShadow:'0 3px 12px rgba(22,163,74,0.4)',
                    }}
                  >
                    <span style={{ fontSize:20 }}>💬</span>
                    Start Conversation
                  </button>
                  <button
                    onClick={handleStartCall}
                    style={{
                      background:'transparent', color:'#e2e8f0',
                      border:'2px solid #334155', padding:'13px 8px',
                      borderRadius:12, cursor:'pointer', fontWeight:700, fontSize:'14px',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                    }}
                  >
                    <span style={{ fontSize:20 }}>📞</span>
                    Start Call
                  </button>
                </div>

                {/* ASK */}
                <div style={{ marginBottom:12 }}>
                  <div style={{
                    fontSize:'10px', color:'#4ade80', fontWeight:700,
                    letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:7,
                  }}>ASK</div>
                  <button
                    onClick={handleStartChat}
                    style={{
                      width:'100%', background:'rgba(255,255,255,0.04)',
                      border:'1px solid #1a3324', color:'#e2e8f0',
                      padding:'10px 12px', borderRadius:10, cursor:'pointer',
                      fontSize:'13px', fontWeight:600,
                      display:'flex', alignItems:'center', gap:10, textAlign:'left',
                    }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(22,163,74,0.12)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.04)')}
                  >
                    <span style={{
                      width:30, height:30, borderRadius:8,
                      background:'rgba(22,163,74,0.15)',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0,
                    }}>💬</span>
                    Frequently asked questions (FAQs)
                  </button>
                </div>

                {/* REACH OUT */}
                <div>
                  <div style={{
                    fontSize:'10px', color:'#4ade80', fontWeight:700,
                    letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:7,
                  }}>REACH OUT</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7 }}>
                    {[
                      { e:'🔧', l:'Flat Tyre' },
                      { e:'🔋', l:'Dead Battery' },
                      { e:'🚧', l:'Accident Tow' },
                      { e:'🌡', l:'Engine Fail' },
                      { e:'🆘', l:'Emergency' },
                      { e:'📍', l:'Track Truck' },
                    ].map(({ e, l }) => (
                      <button key={l} onClick={handleStartChat}
                        style={{
                          background:'rgba(255,255,255,0.04)',
                          border:'1px solid #1a3324', color:'#cbd5e1',
                          padding:'9px 4px', borderRadius:10, cursor:'pointer',
                          fontSize:'10px', fontWeight:600,
                          display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                        }}
                        onMouseEnter={ev=>(ev.currentTarget.style.background='rgba(22,163,74,0.15)')}
                        onMouseLeave={ev=>(ev.currentTarget.style.background='rgba(255,255,255,0.04)')}
                      >
                        <span style={{
                          width:34, height:34, borderRadius:8,
                          background:'rgba(22,163,74,0.12)',
                          display:'flex', alignItems:'center', justifyContent:'center', fontSize:17,
                        }}>{e}</span>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active incident pill */}
                {activeIncidentStatus && (
                  <div style={{
                    marginTop:12, background:'rgba(22,163,74,0.1)',
                    border:'1px solid #16a34a', borderRadius:8,
                    padding:'7px 11px', fontSize:'12px', color:'#4ade80',
                    display:'flex', alignItems:'center', gap:7,
                  }}>
                    🚛 Active: <strong>{activeIncidentStatus}</strong>
                  </div>
                )}

                <div style={{ marginTop:12, textAlign:'center', fontSize:'10px', color:'#1e3a28' }}>
                  Powered by Amazon Connect · SAM1610 Agentic AI
                </div>
              </div>
            )}

            {/* CHAT / CALL view: the Connect widget renders inside this div */}
            {(view === 'chat' || view === 'call') && (
              <div style={{ flex:1, position:'relative', background:'#fff' }}>
                {/* The Connect widget iframe injects itself here via customContainerId */}
                <div
                  id="ra-connect-widget-container"
                  style={{ width:'100%', height:'100%', minHeight:'400px' }}
                />
                {view === 'call' && (
                  <div style={{
                    position:'absolute', bottom:8, left:0, right:0,
                    textAlign:'center', fontSize:'11px', color:'#94a3b8',
                    pointerEvents:'none',
                  }}>
                    📞 Voice call active — speak into your microphone
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
