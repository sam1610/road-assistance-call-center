import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import ngeohash from 'ngeohash';

// ── Config ─────────────────────────────────────────────────────────────────────
const AWS_REGION             = 'us-east-1';
// VITE_MAP_NAME is set in .env.production / Amplify environment variables
// Falls back to 'RoadAssistMap-sandbox' for local dev
const MAP_NAME = import.meta.env.VITE_MAP_NAME ?? 'RoadAssistMap-sandbox';
const AWS_LOCATION_STYLE_URL = `https://maps.geo.${AWS_REGION}.amazonaws.com/maps/v0/maps/${MAP_NAME}/style-descriptor`;
const OPEN_TILES_STYLE       = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [50.586, 26.2285]; // Bahrain
const DEFAULT_ZOOM           = 11;
const POLL_INTERVAL_MS       = 15_000;
const APPSYNC_URL = 'https://hbdlmgeh3jh4dl4zwjssq4msea.appsync-api.us-east-1.amazonaws.com/graphql';
const APPSYNC_KEY = 'da2-v4ke5urgtvfeber6osnzbyjiaq';
const BAHRAIN_GEOHASH_PREFIXES = ['thev', 'theu', 'theg', 'thes'];
const FLEET_STATUSES           = ['AVAILABLE', 'DISPATCHED', 'OFFLINE'];

// ── Types ──────────────────────────────────────────────────────────────────────
interface TruckPosition {
  truckId: string;
  currentLat: number;
  currentLong: number;
  operationalStatus: string;
}
interface TruckMapProps {
  className?: string;
  customerLat?: number;
  customerLng?: number;
  onLocate?: (lat: number, lng: number) => void;
  refreshKey?: number; // increment to trigger an immediate truck data refresh
}

// ── SigV4 ──────────────────────────────────────────────────────────────────────
async function buildSigner(): Promise<SignatureV4 | null> {
  try {
    const session = await fetchAuthSession();
    const creds   = session.credentials;
    if (!creds) return null;
    return new SignatureV4({
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey, sessionToken: creds.sessionToken },
      region: AWS_REGION, service: 'geo', sha256: Sha256,
    });
  } catch { return null; }
}
async function signRequest(signer: SignatureV4, url: string): Promise<maplibregl.RequestParameters> {
  const u = new URL(url);
  const signed = await signer.sign({ method: 'GET', headers: { host: u.hostname }, hostname: u.hostname, path: u.pathname + u.search, protocol: 'https:', query: Object.fromEntries(u.searchParams) });
  return { url, headers: signed.headers as Record<string, string> };
}

// ── Truck marker SVG ───────────────────────────────────────────────────────────
function makeTruckMarkerEl(status: string): HTMLDivElement {
  const colour = status === 'AVAILABLE' ? '#22c55e' : status === 'DISPATCHED' ? '#FF9900' : '#94a3b8'; // Amazon Orange for dispatched
  const wrapper = document.createElement('div');
  wrapper.title = status;
  wrapper.style.cssText = 'pointer-events:auto;cursor:grab;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));';
  wrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="28" viewBox="0 0 44 28" style="pointer-events:none;display:block;">
    <rect x="10" y="6"  width="24" height="14" rx="2" fill="${colour}"/>
    <rect x="30" y="8"  width="10" height="10" rx="2" fill="${colour}"/>
    <rect x="31" y="9"  width="7"  height="6"  rx="1" fill="#e0f2fe" opacity="0.85"/>
    <rect x="2"  y="11" width="10" height="3"  rx="1" fill="${colour}"/>
    <rect x="1"  y="8"  width="3"  height="6"  rx="1" fill="${colour}"/>
    <circle cx="16" cy="22" r="4" fill="#1e293b"/>
    <circle cx="16" cy="22" r="2" fill="#64748b"/>
    <circle cx="34" cy="22" r="4" fill="#1e293b"/>
    <circle cx="34" cy="22" r="2" fill="#64748b"/>
    <circle cx="38" cy="5"  r="4" fill="${colour}" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
  return wrapper;
}

// ── EntityStatusIndex (GSI6) — primary truck query ────────────────────────────
// Uses the new top-level `status` field written by Lambda handlers.
// GSI2 queries remain as fallback for legacy records without top-level status.
async function fetchByEntityStatus(entityType: string, status: string): Promise<any[]> {
  const query = `
    query ByEntityStatus($entityType: String!, $status: String!) {
      listRoadAssistRecordByEntityTypeAndStatus(entityType: $entityType, status: { eq: $status }) {
        items { PK SK entityType data status recordCreatedAt GSI2PK GSI2SK }
      }
    }
  `;
  try {
    const res  = await fetch(APPSYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': APPSYNC_KEY },
      body: JSON.stringify({ query, variables: { entityType, status } }),
    });
    const json = await res.json();
    return json?.data?.listRoadAssistRecordByEntityTypeAndStatus?.items ?? [];
  } catch { return []; }
}

async function fetchByGsi2(gsi2pk: string): Promise<any[]> {
  try {
    const res  = await fetch(APPSYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': APPSYNC_KEY },
      body: JSON.stringify({ query: `query Q($gsi2pk:String!){listRoadAssistRecordByGSI2PKAndGSI2SK(GSI2PK:$gsi2pk){items{PK SK entityType data GSI2PK GSI2SK}}}`, variables: { gsi2pk } }),
    });
    const json = await res.json();
    return json?.data?.listRoadAssistRecordByGSI2PKAndGSI2SK?.items ?? [];
  } catch { return []; }
}

function parseTruckPayload(item: any): TruckPosition | null {
  if (!item?.PK) return null;
  const truckId = item.PK.replace('TRUCK#', '');
  let p: any = {};
  try {
    const once = typeof item.data === 'string' ? JSON.parse(item.data) : (item.data ?? {});
    p = typeof once === 'string' ? JSON.parse(once) : once;
  } catch { return null; }
  let lat = Number(p.currentLat ?? p.latitude ?? 0);
  let lng = Number(p.currentLong ?? p.longitude ?? 0);
  if ((!lat || !lng) && p.locationGeohash) {
    const d = ngeohash.decode(p.locationGeohash.slice(0, 6));
    lat = d.latitude; lng = d.longitude;
  }
  if (!lat || !lng) return null;
  const operationalStatus = p.operationalStatus ?? p.status ?? item.status ?? 'UNKNOWN';
  return { truckId, currentLat: lat, currentLong: lng, operationalStatus };
}

async function fetchTrucks(): Promise<TruckPosition[]> {
  try {
    // Query both entity types that carry GPS coords, in parallel:
    //   TRUCK_PROFILE    (SK=PROFILE) — seed/static records
    //   TOW_TRUCK_STATUS (SK=STATUS)  — live telemetry written by updateTruckTelemetry
    // STATUS records are merged last so they overwrite PROFILE for the same truckId.
    const [
      profileAvail, profileDisp,
      statusAvail,  statusDisp,
    ] = await Promise.all([
      fetchByEntityStatus('TRUCK_PROFILE',    'AVAILABLE'),
      fetchByEntityStatus('TRUCK_PROFILE',    'DISPATCHED'),
      fetchByEntityStatus('TOW_TRUCK_STATUS', 'AVAILABLE'),
      fetchByEntityStatus('TOW_TRUCK_STATUS', 'DISPATCHED'),
    ]);

    // GSI2 fallback — catches records with GSI2PK but no top-level status field
    const legacyGsi2pks = FLEET_STATUSES.flatMap(s =>
      BAHRAIN_GEOHASH_PREFIXES.map(p => `FLEET#${s}#${p}`)
    );
    const legacyItems = (await Promise.all(legacyGsi2pks.map(fetchByGsi2))).flat();

    // Merge order: legacy (lowest priority) → PROFILE → STATUS (highest — freshest GPS)
    const byTruck = new Map<string, TruckPosition>();
    for (const item of [
      ...legacyItems,
      ...profileAvail, ...profileDisp,
      ...statusAvail,  ...statusDisp,
    ]) {
      const truck = parseTruckPayload(item);
      if (truck) byTruck.set(truck.truckId, truck);
    }
    return Array.from(byTruck.values());
  } catch (e) {
    console.warn('[TruckMap] fetchTrucks:', e);
    return [];
  }
}

maplibregl.setRTLTextPlugin(
  'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
  true
).catch(() => {});

// ── Customer pin CSS (injected once) ──────────────────────────────────────────
function ensureCustomerPinCSS() {
  if (document.getElementById('cust-pin-css')) return;
  const s = document.createElement('style');
  s.id = 'cust-pin-css';
  s.textContent = `
    @keyframes custPulse {
      0%   { box-shadow: 0 0 0 0    rgba(56,189,248,0.8); }
      70%  { box-shadow: 0 0 0 14px rgba(56,189,248,0);   }
      100% { box-shadow: 0 0 0 0    rgba(56,189,248,0);   }
    }
    .cust-pin {
      width:20px; height:20px; border-radius:50%;
      background:#38bdf8; border:3px solid #fff;
      animation: custPulse 2s ease-out infinite;
      cursor: pointer;
    }`;
  document.head.appendChild(s);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function TruckMap({ className, customerLat, customerLng, onLocate, refreshKey = 0 }: TruckMapProps) {
  const containerRef      = useRef<HTMLDivElement>(null);
  const mapRef            = useRef<maplibregl.Map | null>(null);
  const markersRef        = useRef<Map<string, maplibregl.Marker>>(new Map());
  const pollRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const signerRef         = useRef<SignatureV4 | null>(null);
  const customerMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [trucks,   setTrucks]   = useState<TruckPosition[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [usingAWS, setUsingAWS] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // ── 1. Map init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const center: [number, number] = customerLng && customerLat ? [customerLng, customerLat] : DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current, style: OPEN_TILES_STYLE,
      center, zoom: DEFAULT_ZOOM,
      scrollZoom: true, dragPan: true, dragRotate: true,
      keyboard: true, doubleClickZoom: true, touchZoomRotate: true,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    const canvas = map.getCanvas();
    canvas.style.cursor = 'grab';
    map.on('mousedown', () => { canvas.style.cursor = 'grabbing'; });
    map.on('mouseup',   () => { canvas.style.cursor = 'grab'; });
    map.on('dragstart', () => { canvas.style.cursor = 'grabbing'; });
    map.on('dragend',   () => { canvas.style.cursor = 'grab'; });
    map.on('styledata', () => { canvas.style.cursor = 'grab'; });
    map.on('load', () => setMapReady(true));
    mapRef.current = map;
    // Try AWS Location upgrade — wait 800ms for Cognito credentials to initialise.
    // Without the delay the first page load always gets a 403 because the identity
    // pool hasn't issued temporary credentials yet.
    map.on('load', async () => {
      await new Promise(r => setTimeout(r, 800));
      const signer = await buildSigner();
      if (!signer || !mapRef.current) return;
      signerRef.current = signer;
      try {
        const signed   = await signRequest(signer, AWS_LOCATION_STYLE_URL);
        const styleRes = await fetch(signed.url, { headers: signed.headers });
        if (!styleRes.ok) return;
        const styleJson = await styleRes.json();
        if (styleJson.glyphs && !styleJson.glyphs.startsWith('http'))
          styleJson.glyphs = `https://maps.geo.${AWS_REGION}.amazonaws.com${styleJson.glyphs}`;
        mapRef.current.setStyle(styleJson);
        setUsingAWS(true);
      } catch (e) { console.warn('[TruckMap] AWS style unavailable:', e); }
    });
    return () => {
      pollRef.current && clearInterval(pollRef.current);
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();
      customerMarkerRef.current?.remove();
      customerMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Poll trucks ────────────────────────────────────────────────────────
  const refreshTrucks = useCallback(async () => {
    setTrucks(await fetchTrucks());
  }, []);
  useEffect(() => {
    refreshTrucks();
    pollRef.current = setInterval(refreshTrucks, POLL_INTERVAL_MS);
    return () => { pollRef.current && clearInterval(pollRef.current); };
  // refreshKey change triggers an immediate refresh without waiting for poll interval
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrucks, refreshKey]);

  // ── 3. Truck markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const seen = new Set<string>();
    trucks.forEach(({ truckId, currentLat, currentLong, operationalStatus }) => {
      seen.add(truckId);
      const lngLat: [number, number] = [currentLong, currentLat];
      if (markersRef.current.has(truckId)) {
        const existing = markersRef.current.get(truckId)!;
        existing.setLngLat(lngLat);
        // Update colour when status changes — replace the marker element in-place
        const prevStatus = existing.getElement().title;
        if (prevStatus !== operationalStatus) {
          const newEl = makeTruckMarkerEl(operationalStatus);
          existing.getElement().replaceWith(newEl);
          // Re-attach the new element to the same marker object
          (existing as any)._element = newEl;
          existing.getElement().title = operationalStatus;
        }
      } else {
        const el = makeTruckMarkerEl(operationalStatus);
        el.title = operationalStatus;
        const popupHtml = (lat: number, lng: number) =>
          `<div style="font-family:system-ui;font-size:12px;line-height:1.7;min-width:140px">
            <strong>${truckId}</strong><br/>
            Status:&nbsp;<strong style="color:${operationalStatus === 'AVAILABLE' ? '#16a34a' : operationalStatus === 'DISPATCHED' ? '#FF9900' : '#64748b'}">${operationalStatus}</strong><br/>
            <span style="color:#94a3b8;font-size:10px">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
          </div>`;
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(lngLat)
          .setPopup(new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(popupHtml(currentLat, currentLong)))
          .addTo(map);
        markersRef.current.set(truckId, marker);
      }
    });
    markersRef.current.forEach((m, id) => { if (!seen.has(id)) { m.remove(); markersRef.current.delete(id); } });
  }, [trucks, mapReady]);

  // ── 4. Auto GPS watch — starts as soon as the map is ready ─────────────────
  // watchPosition triggers immediately on permission grant and on every move.
  // No button needed — the marker appears automatically.
  useEffect(() => {
    if (!mapReady) return;
    if (!navigator.geolocation) return;

    const onPosition = (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const map = mapRef.current;
      if (!map) return;

      ensureCustomerPinCSS();
      const lngLat: [number, number] = [lng, lat];

      if (customerMarkerRef.current) {
        customerMarkerRef.current.setLngLat(lngLat);
      } else {
        const el = document.createElement('div');
        el.className = 'cust-pin';
        customerMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .setPopup(
            new maplibregl.Popup({ offset: 20, closeButton: false })
              .setHTML('<div style="font-family:system-ui;font-size:12px;font-weight:700;color:#0f172a;white-space:nowrap">📍 Your Location</div>')
          )
          .addTo(map);
        // Fly to the customer on first fix only
        map.flyTo({ center: lngLat, zoom: Math.min(Math.max(map.getZoom(), 11), 11), duration: 900 });
      }

      onLocate?.(lat, lng);
    };

    const onError = (err: GeolocationPositionError) => {
      console.warn('[TruckMap] Geolocation:', err.code, err.message);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      onPosition, onError,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [mapReady, onLocate]);


  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', gap: 8, position: 'relative' }}>

      {/* Map canvas */}
      <div style={{ position: 'relative', flex: 1, minHeight: '280px' }}>
        <div ref={containerRef} className={className}
          style={{ width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden', pointerEvents: 'auto' }}
        />

        {/* Empty state */}
        {mapReady && trucks.length === 0 && (
          <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.78)', borderRadius: 6, padding: '5px 14px', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            No truck telemetry yet
          </div>
        )}
      </div>


      {/* Legend strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '5px 10px', background: 'rgba(15,23,42,0.55)', borderRadius: 8, fontSize: '11px', color: '#e2e8f0', lineHeight: 1, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, color: '#a5b4fc' }}>🚚 Fleet</span>
        {[{ c: '#22c55e', l: 'Available' }, { c: '#FF9900', l: 'Dispatched' }, { c: '#94a3b8', l: 'Offline' }].map(({ c, l }) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />
            {l}
          </span>
        ))}
        {/* Customer location indicator — shows after locate */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#38bdf8', display: 'inline-block', flexShrink: 0 }} />
          You
        </span>
        {trucks.length > 0 && (
          <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>
            {trucks.length} truck{trucks.length !== 1 ? 's' : ''}
          </span>
        )}
        {usingAWS && <span style={{ color: '#4ade80', fontSize: 9 }}>AWS Location ✓</span>}
      </div>
    </div>
  );
}
