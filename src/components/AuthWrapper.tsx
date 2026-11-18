// src/components/AuthWrapper.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import ngeohash from 'ngeohash';

const client = generateClient<Schema>();

// ─── Types ────────────────────────────────────────────────────────────────────
type PersonaType = 'CUSTOMER' | 'SUPERVISOR' | 'TRUCK_DRIVER';

interface LogEntry { timestamp: Date; level: 'INFO'|'ERROR'|'WARN'; message: string; }
interface ChatMessage { sender: 'me'|'agent'; text: string; timestamp: Date; }

interface MockTruck {
  truckId: string; plate: string; incidentId: string;
  status: 'Available'|'Busy'|'Assigned';
}

// ─── Shared Map component (OpenStreetMap embed) ───────────────────────────────
function LiveMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: '#fff', letterSpacing: 2 }}>MAP</div>
      <iframe
        title="Live Map"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.05},${lat-0.05},${lng+0.05},${lat+0.05}&layer=mapnik&marker=${lat},${lng}`}
        style={{ width: '100%', height: 380, borderRadius: 8, border: '2px solid #b45309' }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AuthWrapper({ children }: { children?: React.ReactNode }) {
  const [persona, setPersona] = useState<PersonaType>('CUSTOMER');

  // Shared location state
  const [lat, setLat] = useState(26.2285);
  const [lng, setLng] = useState(50.5860);
  const [geohash, setGeohash] = useState('thev0z');

  // ── sync lat/lng → geohash (one direction, prevent loop)
  const syncFromCoords = (newLat: number, newLng: number) => {
    const h = ngeohash.encode(newLat, newLng, 6);
    setLat(newLat); setLng(newLng); setGeohash(h);
  };
  // ── sync geohash → lat/lng
  const syncFromGeohash = (h: string) => {
    setGeohash(h);
    if (h.length === 6) {
      try {
        const d = ngeohash.decode(h);
        setLat(d.latitude); setLng(d.longitude);
      } catch { /* invalid */ }
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) { syncFromCoords(26.2285, 50.5860); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => syncFromCoords(p.coords.latitude, p.coords.longitude),
      ()  => syncFromCoords(26.2285, 50.5860),
    );
  };

  return (
    <Authenticator loginMechanisms={['email', 'phone_number']}>
      {({ signOut, user }) => (
        <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'monospace' }}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 24px', borderBottom: '1px solid #222' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#f97316' }}>
                Road Assistance Agentic Call Center
              </div>
              <div style={{ fontSize: 11, color: '#555' }}>
                {user?.signInDetails?.loginId || user?.username}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['CUSTOMER', 'SUPERVISOR', 'TRUCK_DRIVER'] as PersonaType[]).map(p => (
                <button key={p} onClick={() => setPersona(p)}
                  style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                           fontFamily: 'monospace', fontWeight: 700, fontSize: 12,
                           background: persona === p ? '#f97316' : '#1a1a1a',
                           color: persona === p ? '#000' : '#888' }}>
                  {p === 'CUSTOMER' ? '👤 Customer' : p === 'SUPERVISOR' ? '🛡 Supervisor' : '🚛 Driver'}
                </button>
              ))}
              <button onClick={signOut}
                style={{ padding: '6px 14px', background: '#7f1d1d', color: '#fca5a5',
                         border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>
                Sign Out
              </button>
            </div>
          </div>

          {/* ── Persona views ───────────────────────────────────────────────── */}
          <div style={{ padding: 24 }}>
            {persona === 'CUSTOMER' && (
              <CustomerView
                lat={lat} lng={lng} geohash={geohash}
                onGetLocation={handleGetLocation}
                onGeohashChange={syncFromGeohash}
              />
            )}
            {persona === 'SUPERVISOR' && (
              <SupervisorView lat={lat} lng={lng} />
            )}
            {persona === 'TRUCK_DRIVER' && (
              <TruckDriverView lat={lat} lng={lng} />
            )}
          </div>

          {children}
        </div>
      )}
    </Authenticator>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PERSONA 1 — CUSTOMER
// Left: chat transcript + big call button   Right: map
// ══════════════════════════════════════════════════════════════════════════════
function CustomerView({
  lat, lng, geohash, onGetLocation, onGeohashChange,
}: {
  lat: number; lng: number; geohash: string;
  onGetLocation: () => void;
  onGeohashChange: (h: string) => void;
}) {
  const [phone, setPhone]     = useState('+973-33001122');
  const [plate, setPlate]     = useState('BHR-1001');
  const [incidentType, setIncidentType]               = useState('FLAT_TIRE');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput]     = useState('');
  const [contactId, setContactId] = useState<string|null>(null);
  const [channel, setChannel] = useState<'VOICE'|'CHAT'|null>(null);
  const [busy, setBusy]       = useState(false);
  const [log, setLog]         = useState<LogEntry[]>([]);
  const [incident, setIncident] = useState<any>(null);
  const audioRef              = useRef<HTMLAudioElement>(null);
  const subRef                = useRef<any>(null);
  const chatEndRef            = useRef<HTMLDivElement>(null);

  const addLog = (msg: string, lvl: 'INFO'|'ERROR'|'WARN' = 'INFO') =>
    setLog(p => [...p, { timestamp: new Date(), level: lvl, message: msg }]);

  // auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  // live-update subscription
  useEffect(() => {
    if (!incident?.incidentId) return;
    const sub = client.subscriptions
      .onIncidentLiveUpdate({ incidentId: incident.incidentId })
      .subscribe({
        next: (d: any) => addLog(`Live update: status=${d.incidentStatus} ETA=${d.etaMinutes}min`),
        error: (e: any) => addLog(`Sub error: ${e.message}`, 'ERROR'),
      });
    subRef.current = sub;
    return () => { sub.unsubscribe(); subRef.current = null; };
  }, [incident?.incidentId]);

  const syncIncident = async (cid: string) => {
    try {
      const r = await client.queries.syncIncidentAndMemory({
        contactId:          cid,
        customerIdentifier: phone,
        plateNumber:        plate,
        incidentType:       incidentType,
        incidentDescription: incidentDescription,
      });
      if (r.data) { setIncident(r.data); addLog(`Incident synced: ${r.data.incidentId} — ${r.data.customerName}`); }
    } catch (e: any) { addLog(`Sync error: ${e.message}`, 'ERROR'); }
  };

  const startVoice = async () => {
    if (busy || channel) return;
    setBusy(true);
    addLog('Starting WebRTC voice call via Amazon Connect…');
    try {
      const r = await client.mutations.startConnectSession({
        channel:             'VOICE',
        customerIdentifier:  phone,
        plateNumber:         plate,
        locationGeohash:     geohash,
      });
      if (!r.data?.contactId) throw new Error(r.errors?.[0]?.message || 'No contactId returned');
      const { contactId: cid, connectionDataJson } = r.data;
      addLog(`Contact ID: ${cid}`);

      // amazon-connect-streams handles audio for WebRTC contacts.
      // connectionDataJson contains { Attendee, Meeting } from Connect.
      // For a full integration embed the CCP iframe (see comment below).
      // For this POC we show the status and log the connection data.
      addLog(`Connection data received — open browser console for raw payload.`);
      console.info('[WebRTC ConnectionData]', JSON.parse(connectionDataJson || '{}'));

      // Request mic so the browser is ready when the CCP takes over
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        addLog('Microphone access granted');
      } catch { addLog('Mic access denied — audio may not work', 'WARN'); }

      setContactId(cid); setChannel('VOICE');
      await syncIncident(cid);
    } catch (e: any) {
      addLog(`Voice error: ${e.message}`, 'ERROR');
    } finally { setBusy(false); }
  };

  const startChat = async () => {
    if (busy || channel) return;
    setBusy(true);
    addLog('Starting live web chat via Amazon Connect…');
    try {
      // Inject contact attributes into the native Connect widget before opening
      const ac = (window as any).amazon_connect;
      if (typeof ac === 'function') {
        ac('contactAttributes', {
          customerIdentifier:  phone,
          plateNumber:         plate,
          locationGeohash:     geohash,
          channelType:         'CHAT',
          incidentType:        incidentType,
          incidentDescription: incidentDescription,
        });
        ac('open');
        addLog('Connect widget opened with contact attributes');
      }

      const r = await client.mutations.startConnectSession({
        channel:             'CHAT',
        customerIdentifier:  phone,
        plateNumber:         plate,
        locationGeohash:     geohash,
      });
      if (!r.data?.contactId) throw new Error(r.errors?.[0]?.message || 'No contactId returned');
      const { contactId: cid } = r.data;
      addLog(`Chat started — Contact ID: ${cid}`);
      setContactId(cid); setChannel('CHAT');
      setChatMsgs([{ sender: 'agent', text: 'Hello! Road Assistance agent connected. How can I help?', timestamp: new Date() }]);
      await syncIncident(cid);
    } catch (e: any) {
      addLog(`Chat error: ${e.message}`, 'ERROR');
    } finally { setBusy(false); }
  };

  const endSession = () => {
    setContactId(null); setChannel(null);
    setChatMsgs([]); setIncident(null);
    subRef.current?.unsubscribe();
    addLog('Session ended');
  };

  const sendMsg = () => {
    if (!input.trim()) return;
    setChatMsgs(p => [...p, { sender: 'me', text: input, timestamp: new Date() }]);
    addLog(`Sent: ${input}`);
    setInput('');
  };

  const S = styles;
  const isActive = !!channel;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

      {/* LEFT ── controls + chat transcript */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Customer info inputs */}
        <div style={S.card}>
          <div style={S.cardTitle}>📋 Customer Info</div>
          <label style={S.label}>Phone</label>
          <input style={S.input} value={phone} onChange={e => setPhone(e.target.value)} />
          <label style={S.label}>Car Plate</label>
          <input style={S.input} value={plate} onChange={e => setPlate(e.target.value)} />

          <label style={S.label}>Type of Incident</label>
          <select style={{ ...S.input, cursor: 'pointer' }}
            value={incidentType} onChange={e => setIncidentType(e.target.value)}>
            <option value="FLAT_TIRE">Flat Tyre</option>
            <option value="ENGINE_FAILURE">Engine Overheating / Failure</option>
            <option value="BATTERY_DEAD">Dead Battery</option>
            <option value="COLLISION_TOW">Accident / Flatbed Tow</option>
          </select>

          <label style={S.label}>Incident Description</label>
          <textarea
            rows={3}
            style={{ ...S.input, resize: 'vertical', lineHeight: 1.5 }}
            placeholder="Briefly describe what happened…"
            value={incidentDescription}
            onChange={e => setIncidentDescription(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 4 }}>
            <div>
              <label style={S.label}>Geohash</label>
              <input style={S.input} maxLength={6} value={geohash} onChange={e => onGeohashChange(e.target.value)} />
              <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{lat.toFixed(4)}, {lng.toFixed(4)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={onGetLocation} style={{ ...S.btn, background: '#0e7490' }}>📍 Locate</button>
            </div>
          </div>
        </div>

        {/* Call / Chat transcript area */}
        <div style={{ ...S.card, flex: 1 }}>
          {/* Transcript box */}
          <div style={{
            background: '#000', borderRadius: 8, padding: 16, minHeight: 180,
            border: `1px solid ${channel === 'VOICE' ? '#dc2626' : channel === 'CHAT' ? '#2563eb' : '#222'}`,
            marginBottom: 12,
          }}>
            {channel === 'VOICE' && (
              <div style={{ textAlign: 'center', paddingTop: 32 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', border: '4px solid #dc2626',
                              background: '#7f1d1d', margin: '0 auto 16px', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📞</div>
                <div style={{ color: '#ef4444', fontWeight: 700 }}>🔴 LIVE VOICE — {contactId}</div>
              </div>
            )}
            {channel === 'CHAT' && chatMsgs.map((m, i) => (
              <div key={i} style={{ marginBottom: 8,
                textAlign: m.sender === 'me' ? 'right' : 'left' }}>
                <span style={{ fontSize: 11, color: '#555' }}>{m.sender === 'me' ? 'me' : 'Agent'}: </span>
                <span style={{ color: m.sender === 'me' ? '#34d399' : '#fff' }}>{m.text}</span>
              </div>
            ))}
            {!channel && (
              <div style={{ color: '#333', fontSize: 13, paddingTop: 24, textAlign: 'center' }}>
                Start a call or chat to connect
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input row (only when chat active) */}
          {channel === 'CHAT' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input style={{ ...S.input, flex: 1 }} value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMsg()}
                placeholder="Type a message…" />
              <button onClick={sendMsg} style={{ ...S.btn, background: '#2563eb' }}>Send</button>
            </div>
          )}

          {/* Action buttons */}
          {!isActive ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={startVoice} disabled={busy}
                style={{ ...S.btn, flex: 1, background: busy ? '#1a1a1a' : '#166534', fontSize: 14, padding: '12px 0' }}>
                {busy ? '⏳' : '📞'} Voice Call
              </button>
              <button onClick={startChat} disabled={busy}
                style={{ ...S.btn, flex: 1, background: busy ? '#1a1a1a' : '#1e3a8a', fontSize: 14, padding: '12px 0' }}>
                {busy ? '⏳' : '💬'} Web Chat
              </button>
            </div>
          ) : (
            <button onClick={endSession}
              style={{ ...S.btn, width: '100%', background: '#7f1d1d', fontSize: 14, padding: '12px 0' }}>
              ❌ End Session
            </button>
          )}
        </div>

        {/* Execution log collapsible */}
        <details style={S.card}>
          <summary style={{ cursor: 'pointer', color: '#0ea5e9', fontWeight: 700, fontSize: 12 }}>
            📋 Log ({log.length})
          </summary>
          <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 8, fontSize: 11 }}>
            {log.map((e, i) => (
              <div key={i} style={{ color: e.level === 'ERROR' ? '#f87171' : e.level === 'WARN' ? '#fbbf24' : '#4ade80' }}>
                [{e.timestamp.toLocaleTimeString()}] {e.message}
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* RIGHT ── map */}
      <div>
        <LiveMap lat={lat} lng={lng} />
        {incident && (
          <div style={{ ...S.card, marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 13 }}>
              <div><span style={{ color: '#f97316' }}>Incident:</span> {incident.incidentId}</div>
              <div><span style={{ color: '#f97316' }}>Plate:</span> {incident.defaultPlate}</div>
              <div><span style={{ color: '#f97316' }}>Name:</span> {incident.customerName ?? 'Guest'}</div>
              <div><span style={{ color: '#f97316' }}>Tier:</span> {incident.membershipTier}</div>
              <div><span style={{ color: '#f97316' }}>Phone:</span> {incident.customerPhone}</div>
            </div>
          </div>
        )}
      </div>

      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PERSONA 2 — SUPERVISOR / ADMIN
// Left: incident/truck table   Right: map
// Mockup: rows like  11-22 | BAH-23-1 | #12 | Assigned
// ══════════════════════════════════════════════════════════════════════════════
const MOCK_TRUCKS: MockTruck[] = [
  { truckId: '#12', plate: 'BAH-23-1', incidentId: '11-22', status: 'Assigned' },
  { truckId: '#13', plate: 'BAH-###',  incidentId: '##',    status: 'Busy' },
  { truckId: '#14', plate: 'BAH-23-1', incidentId: '11-22', status: 'Assigned' },
];

function SupervisorView({ lat, lng }: { lat: number; lng: number }) {
  const [trucks, setTrucks] = useState<MockTruck[]>(MOCK_TRUCKS);

  const assign = (truckId: string) =>
    setTrucks(p => p.map(t => t.truckId === truckId ? { ...t, status: 'Assigned' } : t));

  const S = styles;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

      {/* LEFT ── fleet table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={S.card}>
          <div style={S.cardTitle}>🛡 Supervisor — Fleet & Incidents</div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr 1.2fr auto',
                        gap: 8, fontSize: 11, color: '#f97316', fontWeight: 700,
                        borderBottom: '1px solid #222', paddingBottom: 6, marginBottom: 8 }}>
            <span>Incident</span><span>Plate</span><span>Truck</span><span>Status</span><span>Action</span>
          </div>

          {trucks.map((t) => (
            <div key={t.truckId} style={{ display: 'grid',
              gridTemplateColumns: '1fr 1.4fr 1fr 1.2fr auto',
              gap: 8, fontSize: 13, alignItems: 'center',
              borderBottom: '1px solid #111', paddingBottom: 6, marginBottom: 6 }}>
              <span style={{ color: '#fff' }}>{t.incidentId}</span>
              <span style={{ color: '#fff', fontWeight: 700 }}>{t.plate}</span>
              <span style={{ color: '#fff' }}>{t.truckId}</span>
              <span style={{ color: t.status === 'Busy' ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                {t.status}
              </span>
              {t.status !== 'Assigned' ? (
                <button onClick={() => assign(t.truckId)}
                  style={{ ...S.btn, fontSize: 11, padding: '4px 10px', background: '#166534' }}>
                  Assign
                </button>
              ) : (
                <span style={{ fontSize: 11, color: '#555' }}>✓</span>
              )}
            </div>
          ))}

          <div style={{ marginTop: 12, fontSize: 11, color: '#555', fontStyle: 'italic' }}>
            The Admin/Agent assigns the closest available truck driver to the mission
          </div>
        </div>
      </div>

      {/* RIGHT ── map */}
      <LiveMap lat={lat} lng={lng} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PERSONA 3 — TRUCK DRIVER
// Left: driver status toggle + assigned incident list   Right: map
// Mockup: TruckDriver-1 | Available/Busy  + incident table
// ══════════════════════════════════════════════════════════════════════════════
function TruckDriverView({ lat, lng }: { lat: number; lng: number }) {
  const [available, setAvailable] = useState(true);
  const [incidents] = useState([
    { incidentId: '11-22', plate: 'Bah-23676', status: 'Assigned' as 'Assigned'|'Accepted' },
  ]);

  const S = styles;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

      {/* LEFT ── driver panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={S.card}>
          {/* Driver ID + availability */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
            <div>
              <span style={{ color: '#f97316', fontWeight: 700, fontSize: 18 }}>TruckDriver-1</span>
              <span style={{ color: '#555', fontSize: 12, marginLeft: 8 }}>Set By the Truck Driver</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                onClick={() => setAvailable(true)}
                style={{ ...S.btn, background: available ? '#166534' : '#1a1a1a',
                         color: available ? '#4ade80' : '#555', fontWeight: 700, padding: '6px 18px' }}>
                Available
              </button>
              <button
                onClick={() => setAvailable(false)}
                style={{ ...S.btn, background: !available ? '#7f1d1d' : '#1a1a1a',
                         color: !available ? '#fca5a5' : '#555', fontWeight: 700, padding: '6px 18px' }}>
                Busy
              </button>
            </div>
          </div>

          {/* Incident table */}
          <div style={{ borderTop: '1px solid #222', paddingTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.2fr',
                          gap: 8, fontSize: 11, color: '#f97316', fontWeight: 700,
                          borderBottom: '1px solid #222', paddingBottom: 6, marginBottom: 8 }}>
              <span>IncidentID</span><span>Car #</span><span>Status</span>
            </div>
            {incidents.map((inc) => (
              <div key={inc.incidentId}
                style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.2fr',
                         gap: 8, fontSize: 14, alignItems: 'center',
                         borderBottom: '1px solid #111', paddingBottom: 6, marginBottom: 6 }}>
                <span style={{ color: '#fff' }}>{inc.incidentId}</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>{inc.plate}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>{inc.status}</span>
                  <button style={{ ...S.btn, fontSize: 10, padding: '3px 8px', background: '#1e3a8a' }}>
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT ── map */}
      <LiveMap lat={lat} lng={lng} />
    </div>
  );
}

// ── Shared micro-styles ────────────────────────────────────────────────────────
const styles = {
  card: {
    background: '#0d0d0d',
    border: '1px solid #1e1e1e',
    borderRadius: 10,
    padding: 20,
  } as React.CSSProperties,
  cardTitle: {
    fontWeight: 700, fontSize: 14, color: '#f97316',
    marginBottom: 14, letterSpacing: 1,
  } as React.CSSProperties,
  label: {
    display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, marginTop: 10,
  } as React.CSSProperties,
  input: {
    width: '100%', padding: '8px 10px', background: '#111',
    border: '1px solid #333', borderRadius: 6, color: '#fff',
    fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  btn: {
    border: 'none', borderRadius: 6, cursor: 'pointer',
    fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
    color: '#fff', padding: '8px 16px',
    background: '#1a1a1a',
  } as React.CSSProperties,
};
