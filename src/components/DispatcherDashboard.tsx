import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';

interface DispatcherDashboardProps {
  incidentId?: string;
}

interface IncidentLiveUpdate {
  incidentId?: string | null;
  incidentStatus?: string | null;
  truckLocationGeohash?: string | null;
  etaMinutes?: number | null;
}

/**
 * Stub dispatcher dashboard component.
 * Subscribes to the `onIncidentLiveUpdate` AppSync subscription filtered by
 * `incidentId`.  No business logic — just a correctly-typed skeleton.
 *
 * Requirements: Design — Frontend Components, 6.9
 */
export default function DispatcherDashboard({ incidentId = '' }: DispatcherDashboardProps) {
  const [liveUpdate, setLiveUpdate] = useState<IncidentLiveUpdate | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // generateClient() requires amplify_outputs.json to be present at runtime.
    // This stub wires up the subscription shape; it will resolve once the
    // Amplify sandbox is running.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = generateClient<any>();

    let subscription: { unsubscribe: () => void } | null = null;

    try {
      subscription = client.graphql({
        // @ts-ignore — schema types are only available after sandbox generation
        query: `subscription OnIncidentLiveUpdate($incidentId: String!) {
          onIncidentLiveUpdate(incidentId: $incidentId) {
            incidentId
            incidentStatus
            truckLocationGeohash
            etaMinutes
          }
        }`,
        variables: { incidentId },
      }).subscribe({
        next: ({ data }: { data: { onIncidentLiveUpdate: IncidentLiveUpdate } }) => {
          setLiveUpdate(data.onIncidentLiveUpdate);
          setConnected(true);
        },
        error: () => {
          setConnected(false);
        },
      });
    } catch {
      // Subscription setup fails gracefully when sandbox is not running.
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, [incidentId]);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Dispatcher Dashboard</h1>
        <span
          className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
            connected
              ? 'bg-green-900 text-green-300'
              : 'bg-gray-800 text-gray-400'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-500'}`}
          />
          {connected ? 'Live' : 'Disconnected'}
        </span>
      </div>

      {/* Live update stub */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Live Update</p>
        {liveUpdate ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-400">Incident</dt>
            <dd className="font-mono">{liveUpdate.incidentId ?? '—'}</dd>
            <dt className="text-gray-400">Status</dt>
            <dd>{liveUpdate.incidentStatus ?? '—'}</dd>
            <dt className="text-gray-400">Geohash</dt>
            <dd className="font-mono">{liveUpdate.truckLocationGeohash ?? '—'}</dd>
            <dt className="text-gray-400">ETA (min)</dt>
            <dd>{liveUpdate.etaMinutes ?? '—'}</dd>
          </dl>
        ) : (
          <p className="text-sm text-gray-500">Waiting for live updates…</p>
        )}
      </div>
    </div>
  );
}
