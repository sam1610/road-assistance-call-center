// src/components/CallControlPanel.tsx
import { useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>({ authMode: 'userPool' });

export default function CallControlPanel({ username, geohash }: { username: string; geohash: string }) {
  const [activeCall, setActiveCall] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const startWebRTCCall = async () => {
    setLoading(true);
    try {
      const res = await client.mutations.startConnectSession({
        channel: 'WEBRTC',
        customerIdentifier: username,
        plateNumber: 'BHR-1001',
        locationGeohash: geohash,
      });
      setActiveCall(res.data);
      alert(`WebRTC Contact Initiated! Contact ID: ${res.data?.contactId}`);
    } catch (err: any) {
      console.error('Failed to start WebRTC call:', err);
    } finally {
      setLoading(false);
    }
  };

  const startChatSession = async () => {
    setLoading(true);
    try {
      const res = await client.mutations.startConnectSession({
        channel: 'CHAT',
        customerIdentifier: username,
        plateNumber: 'BHR-1001',
        locationGeohash: geohash,
      });
      setActiveCall(res.data);
      alert(`Chat Session Initialized! Contact ID: ${res.data?.contactId}`);
    } catch (err: any) {
      console.error('Failed to start chat:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155', marginTop: '20px' }}>
      <h3 style={{ color: '#38bdf8', marginTop: 0 }}>Omnichannel Entry: Call or Chat with Roadside AI</h3>
      <p style={{ fontSize: '13px', color: '#94a3b8' }}>
        Initiate an in-app WebRTC voice call or live chat. Your location and membership info will automatically sync with Amazon Connect.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={startWebRTCCall}
          disabled={loading}
          style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          📞 Call Roadside AI (WebRTC)
        </button>
        <button
          onClick={startChatSession}
          disabled={loading}
          style={{ backgroundColor: '#9333ea', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          💬 Start Live Chat
        </button>
      </div>
      {activeCall && (
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#cbd5e1', fontFamily: 'monospace' }}>
          Active Contact ID: {activeCall.contactId}
        </div>
      )}
    </div>
  );
}