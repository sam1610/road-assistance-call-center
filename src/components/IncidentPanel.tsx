interface IncidentPanelProps {
  incidentId?: string;
}

/**
 * Static stub sidebar component showing placeholder incident details.
 * Receives an optional `incidentId` prop; all displayed data is placeholder
 * text until wired to real data.
 *
 * Requirements: Design — Frontend Components
 */
export default function IncidentPanel({ incidentId }: IncidentPanelProps) {
  return (
    <aside className="w-80 flex-shrink-0 bg-gray-900 border-r border-gray-800 p-4 space-y-4 overflow-y-auto">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white uppercase tracking-widest">
          Incident Details
        </h2>
        {incidentId && (
          <span className="font-mono text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
            {incidentId}
          </span>
        )}
      </div>

      {/* Customer section */}
      <section className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Customer</p>
        <div className="rounded bg-gray-800 p-3 space-y-1 text-sm text-gray-300">
          <p>
            <span className="text-gray-500">Name:</span> —
          </p>
          <p>
            <span className="text-gray-500">Phone:</span> —
          </p>
          <p>
            <span className="text-gray-500">Membership:</span> —
          </p>
          <p>
            <span className="text-gray-500">Plate:</span> —
          </p>
        </div>
      </section>

      {/* Incident section */}
      <section className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Incident</p>
        <div className="rounded bg-gray-800 p-3 space-y-1 text-sm text-gray-300">
          <p>
            <span className="text-gray-500">Status:</span> —
          </p>
          <p>
            <span className="text-gray-500">Location:</span> —
          </p>
          <p>
            <span className="text-gray-500">Geohash:</span> —
          </p>
        </div>
      </section>

      {/* Dispatch section */}
      <section className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Dispatch</p>
        <div className="rounded bg-gray-800 p-3 space-y-1 text-sm text-gray-300">
          <p>
            <span className="text-gray-500">Truck ID:</span> —
          </p>
          <p>
            <span className="text-gray-500">ETA:</span> —
          </p>
          <p>
            <span className="text-gray-500">Geofence:</span> —
          </p>
        </div>
      </section>

      {/* Footer placeholder */}
      <div className="pt-2 text-xs text-gray-600 text-center">
        {incidentId ? `Monitoring ${incidentId}` : 'No active incident selected'}
      </div>
    </aside>
  );
}
