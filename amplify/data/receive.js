/**
 * Subscription handler (AppSync JS resolver) for onIncidentLiveUpdate.
 *
 * This is a passthrough that simply returns the event context so AppSync
 * can fan out the payload to all connected subscribers. The incidentId
 * argument is used by AppSync for server-side filtering automatically
 * because it matches the field name in the IncidentLiveUpdate return type.
 *
 * Requirements: 6.9
 */
export function request(ctx) {
  return {};
}

export function response(ctx) {
  return ctx.result;
}
